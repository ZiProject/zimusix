// node --test scripts/scenes.test.mjs
// Headless checks for src/presets/bg-scenes.js: every scene runs for a while against a fake 2D context
// (no DOM/GPU needed) and the beat detector behaves.
import { test } from "node:test";
import assert from "node:assert/strict";

// minimal browser stubs (only used by the sakura petal sprites)
const fakeCtx = () =>
  new Proxy(
    {},
    {
      get: (target, prop) => {
        if (prop in target) return target[prop];
        if (/^create(Linear|Radial)Gradient$/.test(String(prop))) return () => ({ addColorStop() {} });
        if (prop === "measureText") return () => ({ width: 10 });
        return () => {};
      },
      set: (target, prop, value) => ((target[prop] = value), true),
    },
  );
globalThis.OffscreenCanvas = class {
  getContext() {
    return fakeCtx();
  }
};
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} };
globalThis.document = { hidden: false, createElement: () => ({ getContext: fakeCtx }) };

const { SCENES, createScene, isScene, sampleAudio } = await import("../src/presets/bg-scenes.js");
const { reactive } = await import("../src/presets/reactive.js");

test("scene registry", () => {
  assert.deepEqual([...SCENES].sort(), ["fireworks", "glyphs", "hearts", "rain", "sakura"]);
  assert.ok(isScene("rain") && !isScene("aurora") && !isScene("particles"));
  assert.equal(createScene("nope"), undefined);
});

test("every scene renders 10 s of music (kick @120 bpm) without errors, at several settings", () => {
  const W = 800;
  const H = 450;
  let t = 5_000_000;
  for (const name of SCENES) {
    for (const cfg of [
      { count: 70, intensity: 0.6, colors: [] },
      { count: 200, intensity: 1, colors: ["#ff0066", "#00ccff"] },
      { count: 10, intensity: 0.1, colors: [] },
    ]) {
      const scene = createScene(name);
      scene.resize(W, H, 1);
      for (let f = 0; f < 600; f++) {
        t += 1000 / 60;
        const kick = Math.exp(-((t % 500) / 500) * 7);
        reactive.active = f > 20 && f < 560; // also covers the "music stops" case
        reactive.bass = Math.min(1, 0.25 + 0.65 * kick);
        reactive.energy = 0.35 + 0.25 * kick;
        const a = sampleAudio(t, 1 / 60, true, 1);
        const o = { ...cfg, ia: 0.35 + 0.65 * cfg.intensity, ba: 0.3 + 0.7 * cfg.intensity, u: 1, dpr: 1, time: f / 60 };
        scene.frame(fakeCtx(), W, H, 1 / 60, o, a);
      }
      // resizing mid-run must not throw either
      scene.resize(500, 700, 1.2);
      scene.frame(fakeCtx(), 500, 700, 1 / 60, { count: 70, intensity: 0.6, colors: [], ia: 0.7, ba: 0.7, u: 1.2, dpr: 1, time: 0 }, sampleAudio(t + 20, 1 / 60, true, 1));
    }
  }
});

test("rain lightning appears on each beat, independent of hit strength or cooldown", () => {
  const W = 800;
  const H = 450;
  const lightningFlashes = [];
  const ctx = new Proxy(fakeCtx(), {
    get: (target, prop) => {
      if (prop === "fillRect") {
        return (x, y, w, h) => {
          if (typeof target.fillStyle === "string" && target.fillStyle.startsWith("rgba(190,212,255,")) {
            const alpha = Number(target.fillStyle.slice(target.fillStyle.lastIndexOf(",") + 1, -1));
            if (alpha > 0.14) lightningFlashes.push({ x, y, w, h });
          }
        };
      }
      return target[prop];
    },
  });
  const scene = createScene("rain");
  scene.resize(W, H, 1);
  const options = { count: 70, intensity: 0.6, colors: [], ia: 0.7, ba: 0.7 };
  for (const strength of [0.5, 0.7, 1]) {
    scene.frame(ctx, W, H, 1 / 60, options, { hit: true, strength, energy: 0, bass: 0, beat: 0 });
    for (let frame = 1; frame < 30; frame++) {
      scene.frame(ctx, W, H, 1 / 60, options, { hit: false, strength: 0, energy: 0, bass: 0, beat: 0 });
    }
  }
  assert.equal(lightningFlashes.length, 3);
  assert.ok(lightningFlashes.every(({ x, y, w, h }) => x === 0 && y === 0 && w === W && h === H));
});

test("beat detector: ~1 hit per kick, none when silent or when reaction is off", () => {
  let t = 9_000_000;
  const run = (secs, { active, react, level }) => {
    let hits = 0;
    for (let f = 0; f < secs * 60; f++) {
      t += 1000 / 60;
      const kick = Math.exp(-((t % 500) / 500) * 7);
      reactive.active = active;
      reactive.bass = Math.min(1, 0.2 + 0.7 * kick) * level;
      reactive.energy = 0.4;
      if (sampleAudio(t, 1 / 60, react, 1).hit) hits++;
    }
    return hits;
  };
  const hits = run(10, { active: true, react: true, level: 1 });
  assert.ok(hits >= 16 && hits <= 22, `expected about 20 hits in 10 s, got ${hits}`);
  assert.equal(run(5, { active: false, react: true, level: 1 }), 0);
  assert.equal(run(5, { active: true, react: false, level: 1 }), 0);
  // decays to zero after the music stops
  reactive.active = false;
  for (let i = 0; i < 120; i++) sampleAudio((t += 16), 0.016, true, 1);
  const a = sampleAudio((t += 16), 0.016, true, 1);
  assert.ok(a.bass < 0.01 && a.energy < 0.01 && a.beat === 0);
});

test("sensitivity scales and clamps the reaction", () => {
  reactive.active = true;
  reactive.bass = 0.5;
  reactive.energy = 0.5;
  const t = 20_000_000;
  assert.ok(Math.abs(sampleAudio(t, 0.016, true, 0.5).bass - 0.25) < 1e-9);
  assert.ok(Math.abs(sampleAudio(t + 16, 0.016, true, 2).bass - 1) < 1e-9);
  reactive.bass = 1;
  assert.ok(sampleAudio(t + 32, 0.016, true, 2).bass <= 1.4);
});
