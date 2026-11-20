// node --test scripts/logic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildLogic, createRunner } from "../src/presets/logic.js";
import { buildModules } from "../src/presets/schema.js";

const core = JSON.parse(fs.readFileSync(new URL("../public/schema/core.json", import.meta.url), "utf8"));
const { modules } = buildModules(undefined, core);
const build = (raw) => buildLogic(raw, { modules });

test("absent hooks.json is an empty, valid logic", () => {
  const r = build(undefined);
  assert.ok(r.ok);
  assert.equal(r.logic.signals.length + r.logic.binds.length + r.logic.rules.length, 0);
});

test("signals, binds, cost classification", () => {
  const { logic, warnings } = build({
    signals: { kick: "smooth(audio.bass, 0.8, 0.1)", mood: "player.progress > 0.5 ? 'late' : 'early'", both: "s.kick + player.progress" },
    bind: [
      { css: "--preset-glow", expr: "mix(4, 32, s.kick)", unit: "px" },
      { attr: "mood", expr: "s.mood" },
      { class: "hot", expr: "s.kick > 0.6" },
    ],
  });
  assert.deepEqual(warnings, []);
  assert.deepEqual(logic.signals.map((s) => [s.name, s.cost]), [["kick", "frame"], ["mood", "tick"], ["both", "frame"]]);
  assert.deepEqual(logic.binds.map((b) => b.cost), ["frame", "tick", "frame"]);
  assert.ok(logic.hasFrame);
});

test("validation: unknown names/fields, forward signal refs, bad targets, limits", () => {
  const { logic, warnings } = build({
    signals: { a: "s.b + 1", b: "1", c: "window.x", d: "audio.nope", "Bad": "1", e: "nope(1)", f: 5 },
    bind: [
      { css: "--accent", expr: "1" }, // protected variable
      { css: "--preset-ok", expr: "1" },
      { attr: "preset", expr: "1" },
      { class: "BAD", expr: "1" },
      { expr: "1" },
      { css: "--preset-x", expr: "p.layout.shell", unit: "px" },
    ],
    rules: [
      { when: "p.layout.shell == 'x'", set: { "layout.sidebar": "rail" } }, // rules may not read p
      { when: "viewport.w < 900", set: { "layout.sidebar": "rail", "layout.nope": 1, "layout.shell": "zzz", "theme.colors.accent": "#fff" } },
      { when: "1", set: {} },
    ],
    extra: 1,
  });
  assert.deepEqual(logic.signals.map((s) => s.name), ["b", "d"]); // d compiles; unknown field only warns
  assert.deepEqual(logic.binds.map((b) => b.name), ["--preset-ok", "--preset-x"]);
  assert.equal(logic.rules.length, 1);
  assert.deepEqual(Object.keys(logic.rules[0].set).sort(), ["layout.sidebar", "theme.colors.accent"]);
  assert.ok(warnings.some((w) => /unknown hook field audio\.nope/.test(w)));
  assert.ok(warnings.some((w) => /not declared before/.test(w)));
  assert.ok(warnings.length >= 10);
});

test("runner: frame vs tick evaluation, outputs, class toggle, formatting", () => {
  const { logic } = build({
    signals: { kick: "audio.bass * 2", slow: "player.progress" },
    bind: [
      { css: "--preset-a", expr: "s.kick", unit: "px", round: 1 },
      { css: "--preset-b", expr: "s.slow" },
      { attr: "state", expr: "player.playing ? 'on' : 'off'" },
      { class: "loud", expr: "audio.bass > 0.5" },
      { css: "--preset-evil", expr: "'url(http://x)'" },
      { css: "--preset-bool", expr: "player.playing" },
    ],
  });
  const run = createRunner(logic);
  const scope = { audio: { bass: 0.3 }, player: { progress: 0.25, playing: true } };
  run.step(scope, { tick: true, dt: 0.016 });
  assert.equal(run.output.css["--preset-a"], "0.6px");
  assert.equal(run.output.css["--preset-b"], "0.25");
  assert.equal(run.output.css["--preset-bool"], "1");
  assert.equal("--preset-evil" in run.output.css, false); // unsafe values never reach the DOM
  assert.equal(run.output.attrs.state, "on");
  assert.equal(run.output.classes.has("x-loud"), false);

  // frame-only step: audio-driven items update, tick items keep their last value
  scope.audio.bass = 0.8;
  scope.player.progress = 0.9;
  run.step(scope, { tick: false, dt: 0.016 });
  assert.equal(run.output.css["--preset-a"], "1.6px");
  assert.equal(run.output.css["--preset-b"], "0.25");
  assert.equal(run.output.classes.has("x-loud"), true);
  run.step(scope, { tick: true, dt: 0.2 });
  assert.equal(run.output.css["--preset-b"], "0.9");
});

test("runner: rules report matching sets and a stable key", () => {
  const { logic } = build({
    rules: [
      { when: "viewport.w < 900", set: { "layout.sidebar": "rail" } },
      { when: "player.playing && viewport.w < 900", set: { "layout.density": "compact" } },
    ],
  });
  const run = createRunner(logic);
  run.step({ viewport: { w: 1200 }, player: { playing: true } }, { tick: true });
  assert.deepEqual(run.rules(), { key: "", sets: [] });
  run.step({ viewport: { w: 700 }, player: { playing: false } }, { tick: true });
  assert.equal(run.rules().key, "0");
  run.step({ viewport: { w: 700 }, player: { playing: true } }, { tick: true });
  assert.equal(run.rules().key, "0,1");
  assert.deepEqual(run.rules().sets, [{ "layout.sidebar": "rail" }, { "layout.density": "compact" }]);
  // rules are only evaluated on ticks
  run.step({ viewport: { w: 1200 }, player: { playing: true } }, { tick: false });
  assert.equal(run.rules().key, "0,1");
});

test("runner: stateful functions persist between steps; reset clears them", () => {
  const { logic } = build({ signals: { k: "smooth(audio.bass, 1, 0.5)" } });
  const run = createRunner(logic);
  run.step({ audio: { bass: 1 } }, { tick: true, dt: 1 / 60 });
  assert.equal(run.signals.k, 1);
  run.step({ audio: { bass: 0 } }, { tick: true, dt: 1 / 60 });
  assert.equal(run.signals.k, 0.5);
  run.reset();
  assert.equal("k" in run.signals, false);
});

test("runtime errors inside expressions never throw out of the runner", () => {
  const { logic } = build({ signals: { x: "audio.nothing.deeper + 1" }, bind: [{ css: "--preset-x", expr: "s.x" }] });
  const run = createRunner(logic);
  assert.doesNotThrow(() => run.step({}, { tick: true }));
});
