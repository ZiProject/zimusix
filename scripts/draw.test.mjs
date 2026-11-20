// node --test scripts/draw.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAW_LIMITS, buildDraw } from "../src/presets/draw.js";

/** Records canvas calls so programs can be asserted without a browser. */
function mockCtx() {
  const calls = [];
  const ctx = {
    calls,
    globalAlpha: 1,
    save: () => calls.push(["save"]),
    restore: () => calls.push(["restore"]),
    beginPath: () => calls.push(["beginPath"]),
    rect: (...a) => calls.push(["rect", ...a]),
    roundRect: (...a) => calls.push(["roundRect", ...a]),
    arc: (...a) => calls.push(["arc", ...a.map((n) => Math.round(n * 100) / 100)]),
    moveTo: (...a) => calls.push(["moveTo", ...a]),
    lineTo: (...a) => calls.push(["lineTo", ...a]),
    quadraticCurveTo: (...a) => calls.push(["quad", ...a]),
    closePath: () => calls.push(["closePath"]),
    fill: () => calls.push(["fill", ctx.fillStyle]),
    stroke: () => calls.push(["stroke", ctx.strokeStyle]),
    fillText: (...a) => calls.push(["text", ...a]),
    translate: (...a) => calls.push(["translate", ...a]),
    rotate: (...a) => calls.push(["rotate", ...a]),
    scale: (...a) => calls.push(["scale", ...a]),
    createLinearGradient: (...a) => ({ stops: [], addColorStop(p, c) { this.stops.push([p, c]); }, kind: "linear", a }),
  };
  return ctx;
}
const scopeOf = (extra = {}) => ({ w: 200, h: 100, u: 1, n: 4, bands: [0.1, 0.5, 1, 0.25], bass: 0.5, energy: 0.5, beat: 0, accent: "#ff0000", accent2: "#0000ff", colors: ["#ff0000", "#0000ff"], ring: false, audio: { beat: 0 }, time: 1, dt: 0.016, p: {}, s: {}, ...extra });
const program = (draw, extra = {}) => {
  const r = buildDraw({ visualizers: { t: { draw, ...extra } } });
  assert.deepEqual(r.warnings, []);
  return r.draw.visualizers.t;
};

test("each + rect: one pill per band with expression-driven geometry and colors", () => {
  const prog = program(
    [{ op: "each", count: "n", as: "i", do: [{ op: "rect", x: "i * v.bw", y: "h - bands[i] * h", w: "v.bw - 2", h: "bands[i] * h", fill: "mixc(accent, accent2, i / n)", alpha: "0.5" }] }],
    { vars: { bw: "w / n" } },
  );
  const ctx = mockCtx();
  const used = prog.render(ctx, scopeOf());
  assert.equal(used, 4);
  const rects = ctx.calls.filter((c) => c[0] === "rect");
  assert.deepEqual(rects[0], ["rect", 0, 90, 48, 10]);
  assert.deepEqual(rects[2], ["rect", 100, 0, 48, 100]);
  const fills = ctx.calls.filter((c) => c[0] === "fill").map((c) => c[1]);
  assert.equal(fills[0], "rgba(255, 0, 0, 1.000)");
  assert.notEqual(fills[3], fills[0]);
  assert.equal(ctx.calls.filter((c) => c[0] === "save").length, ctx.calls.filter((c) => c[0] === "restore").length);
});

test("circle, line, arc, poly (smooth/closed), text, group, if, let", () => {
  const prog = program([
    { op: "let", name: "r", value: "u * 10" },
    { op: "circle", x: 10, y: 20, r: "v.r", fill: "accent" },
    { op: "line", x1: 0, y1: 0, x2: "w", y2: "h", stroke: "'#fff'", lineWidth: 3 },
    { op: "arc", x: 50, y: 50, r: 10, a0: 0, a1: "pi", stroke: "accent2" },
    { op: "poly", count: 3, as: "k", x: "k * 10", y: "k * 5", closed: true, smooth: true, fill: "accent" },
    { op: "text", x: 5, y: 5, text: "concat('n=', n)", size: 12, fill: "accent" },
    { op: "group", tx: 10, ty: 5, rotate: 0.5, scale: 2, do: [{ op: "circle", x: 0, y: 0, r: 1 }] },
    { op: "if", when: "beat > 0.5", do: [{ op: "circle", x: 0, y: 0, r: 99 }], else: [{ op: "circle", x: 1, y: 1, r: 2 }] },
  ]);
  const ctx = mockCtx();
  prog.render(ctx, scopeOf());
  const names = ctx.calls.map((c) => c[0]);
  assert.ok(names.includes("arc") && names.includes("lineTo") && names.includes("quad") && names.includes("closePath"));
  assert.deepEqual(ctx.calls.find((c) => c[0] === "text"), ["text", "n=4", 5, 5]);
  assert.deepEqual(ctx.calls.find((c) => c[0] === "translate"), ["translate", 10, 5]);
  const arcs = ctx.calls.filter((c) => c[0] === "arc");
  assert.deepEqual(arcs[0], ["arc", 10, 20, 10, 0, 6.28]); // circle radius from `let`
  assert.ok(arcs.some((a) => a[3] === 2), "else branch drawn");
  assert.ok(!arcs.some((a) => a[3] === 99), "if branch skipped");
});

test("gradients: linear fill from expressions", () => {
  const prog = program([{ op: "rect", x: 0, y: 0, w: 10, h: 10, fill: { linear: { x1: 0, y1: 0, x2: 0, y2: "h", stops: [[0, "accent"], [1, "accent2"], [2, "alpha(accent, 0.2)"]] } } }]);
  const ctx = mockCtx();
  prog.render(ctx, scopeOf());
  const fill = ctx.calls.find((c) => c[0] === "fill")[1];
  assert.equal(fill.kind, "linear");
  assert.deepEqual(fill.a, [0, 0, 0, 100]);
  assert.deepEqual(fill.stops.map((s) => s[0]), [0, 1, 1]); // positions clamped to 0..1
});

test("limits: loops capped, primitive budget stops runaway programs", () => {
  const prog = program([{ op: "each", count: 1000000, as: "i", do: [{ op: "each", count: 1000000, as: "j", do: [{ op: "circle", x: "i", y: "j", r: 1 }] }] }]);
  const ctx = mockCtx();
  const used = prog.render(ctx, scopeOf());
  assert.ok(used > DRAW_LIMITS.primitives && used <= DRAW_LIMITS.primitives + 2);
  assert.ok(ctx.calls.filter((c) => c[0] === "arc").length <= DRAW_LIMITS.primitives);
});

test("validation: unknown op/props, bad names, unknown identifiers, shadowing, op cap", () => {
  const r = buildDraw({
    visualizers: {
      ok: { bands: 500, ring: true, draw: [{ op: "circle", x: 0, y: 0, r: 1, bogus: 1 }] },
      "Bad Id": { draw: [] },
      bad: {
        draw: [
          { op: "explode" },
          { op: "circle", x: "window", y: 0, r: 1 },
          { op: "circle", x: "nope.x", y: 0, r: 1 },
          { op: "each", count: 3, as: "audio", do: [] },
          { op: "each", count: 3, as: "i", do: [{ op: "each", count: 2, as: "i", do: [] }] },
          { op: "circle", y: 0, r: 1 },
          { op: "let", name: "Bad-Name", value: 1 },
          { op: "circle", x: "bands[i]", y: 0, r: 1 }, // `i` only exists inside loops
        ],
      },
    },
    backgrounds: { stars: { draw: [{ op: "circle", x: "rand(1) * w", y: "time * 10", r: 1 }] } },
  });
  assert.deepEqual(Object.keys(r.draw.visualizers), ["ok", "bad"]);
  assert.equal(r.draw.visualizers.ok.bands, 96); // clamped
  assert.equal(r.draw.visualizers.ok.ring, true);
  assert.ok(r.draw.backgrounds.stars);
  assert.ok(r.warnings.filter((w) => /bad\.draw/.test(w)).length >= 7);
  assert.ok(r.warnings.some((w) => /unknown property "bogus"/.test(w)));
  const many = buildDraw({ visualizers: { big: { draw: Array.from({ length: 300 }, () => ({ op: "circle", x: 0, y: 0, r: 1 })) } } });
  assert.equal(many.draw.visualizers.big.opCount, DRAW_LIMITS.ops);
  assert.ok(many.warnings.some((w) => /more than 200/.test(w)));
});

test("blend modes are whitelisted; glow sets shadow state", () => {
  const glow = program([{ op: "circle", x: 0, y: 0, r: 5, fill: "accent", glow: "10", blend: "lighter" }]);
  const a = mockCtx();
  glow.render(a, scopeOf());
  assert.equal(a.globalCompositeOperation, "lighter");
  assert.equal(a.shadowBlur, 10);
  const refused = program([{ op: "circle", x: 0, y: 0, r: 5, blend: "destination-out" }]);
  const b = mockCtx();
  refused.render(b, scopeOf());
  assert.equal(b.globalCompositeOperation, undefined);
});

test("signal-lab preset: logic + draw programs run end-to-end against a fake runtime", async () => {
  const fs = await import("node:fs");
  const { buildPreset } = await import("../src/presets/build.js");
  const { createRunner } = await import("../src/presets/logic.js");
  const { resolveConfig } = await import("../src/presets/schema.js");
  const dir = new URL("../public/presets/signal-lab/", import.meta.url);
  const read = (f) => JSON.parse(fs.readFileSync(new URL(f, dir), "utf8"));
  const core = JSON.parse(fs.readFileSync(new URL("../public/schema/core.json", import.meta.url), "utf8"));
  const manifest = read("preset.json");
  const res = buildPreset({ manifest, modules: read("modules.json"), hooks: read("hooks.json"), draw: read("draw.json") }, { core });
  assert.ok(res.ok, res.errors.join("; "));
  assert.deepEqual(res.warnings, []);
  assert.deepEqual(Object.keys(res.draw.visualizers).sort(), ["ember", "halo"]);
  assert.equal(res.draw.visualizers.halo.ring, true);

  const config = resolveConfig(res.manifest);
  assert.equal(config.visualizer.type, "halo");
  assert.equal(config.pulse.hueShift, 200);

  // hooks: per-track hue, flash pulse, rules for a narrow, low-power window
  const run = createRunner(res.logic);
  const hooks = (over = {}) => ({
    audio: { bass: 0.7, energy: 0.5, hit: true, beat: 1 },
    player: { progress: 0.4, playing: true },
    track: { seed: 0.25 },
    lyrics: { has: true, index: 2 },
    clock: { hour: 23.5 },
    viewport: { w: 800, aspect: 1.6 },
    system: { lowPower: false, reducedMotion: false },
    time: 10,
    p: config,
    ...over,
  });
  run.step(hooks(), { tick: true, dt: 1 / 60 });
  assert.equal(run.output.css["--preset-hue"], String(Math.round((200 + 0.25 * 360 + 10 * 4) % 360)));
  assert.equal(run.output.css["--preset-progress"], "40%");
  assert.ok(Number(run.output.css["--preset-flash"]) > 0.5);
  assert.ok(run.output.classes.has("x-lyrics-live") && run.output.classes.has("x-late-night"));
  assert.equal(run.rules().key, "0"); // narrow window only
  const sets = run.rules().sets;
  const cfgNarrow = resolveConfig(res.manifest, {}, { ruleSets: sets });
  assert.equal(cfgNarrow.layout.sidebar, "rail");
  assert.equal(cfgNarrow.layout.density, "compact");
  assert.equal(cfgNarrow.artwork.stageSize, 240);
  run.step(hooks({ system: { lowPower: true } }), { tick: true, dt: 0.2 });
  assert.equal(run.rules().key, "0,2");
  const lowPower = resolveConfig(res.manifest, {}, { ruleSets: run.rules().sets });
  assert.equal(lowPower.background.effect, "gradient");
  assert.equal(lowPower.visualizer.type, "bars");
  // …but an explicit user choice still wins over rules
  assert.equal(resolveConfig(res.manifest, { bg: "aurora" }, { ruleSets: run.rules().sets }).background.effect, "aurora");

  // draw programs render with the live signals
  for (const [kind, id] of [["visualizers", "ember"], ["visualizers", "halo"], ["backgrounds", "starfield"]]) {
    const ctx = mockCtx();
    const used = res.draw[kind][id].render(ctx, scopeOf({ ...hooks(), s: run.signals, n: 40, bands: Array.from({ length: 48 }, (_, i) => (i % 7) / 7) }));
    assert.ok(used > 20, `${id} drew ${used}`);
  }
});
