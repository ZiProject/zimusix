// node --test scripts/expr.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, tryCompile, ExprError, FUNCTIONS } from "../src/presets/expr.js";

const ev = (src, scope = {}, opts) => compile(src, opts).run(scope);

test("arithmetic, precedence, ternary, strings", () => {
  assert.equal(ev("1 + 2 * 3"), 7);
  assert.equal(ev("(1 + 2) * 3"), 9);
  assert.equal(ev("10 % 4 - -2"), 4);
  assert.equal(ev("1 < 2 && 2 <= 2 ? 'y' : 'n'"), "y");
  assert.equal(ev("'a' + 1"), "a1");
  assert.equal(ev("null ?? 5"), 5);
  assert.equal(ev("1 / 0"), 0); // division by zero is neutralised
  assert.equal(ev("x == 'a'", { x: "a" }), true);
  assert.equal(ev("x != 2", { x: 2 }), false);
});

test("scope access, arrays, members", () => {
  const scope = { audio: { bass: 0.5, bands: new Float32Array([0.1, 0.2]) }, list: ["a", "b"], p: { v: { n: 3 } } };
  assert.equal(ev("audio.bass * 2", scope), 1);
  assert.ok(Math.abs(ev("audio.bands[1]", scope) - 0.2) < 1e-6);
  assert.equal(ev("audio.bands[9]", scope), undefined);
  assert.equal(ev("len(list) + p.v.n", scope), 5);
  assert.equal(ev("has(list, 'b')", scope), true);
  assert.equal(ev("pick(list, 3)", scope), "b");
  assert.equal(ev("list.length", scope), 2);
});

test("sandbox: no prototype access, no calling values, no eval-like syntax", () => {
  assert.equal(ev("a.constructor", { a: {} }), undefined);
  assert.equal(ev("a.__proto__", { a: {} }), undefined);
  assert.equal(ev("toString", {}), undefined);
  assert.equal(ev("a.toString", { a: {} }), undefined);
  assert.throws(() => compile("a.b()"), ExprError);
  assert.throws(() => compile("constructor('x')"), /Unknown function/);
  assert.throws(() => compile("window.alert(1)"), ExprError);
  assert.throws(() => compile("a = 1"), ExprError);
  assert.throws(() => compile("1; 2"), ExprError);
  assert.throws(() => compile("`x`"), ExprError);
  assert.throws(() => compile("x.y", { roots: ["a"] }), /Unknown name/);
  // strings expose only length
  assert.equal(ev("'abc'.length"), 3);
  assert.equal(ev("'abc'.constructor"), undefined);
});

test("limits: length, nodes, depth", () => {
  assert.throws(() => compile("1+".repeat(300) + "1"), /longer|complex/);
  assert.throws(() => compile("(".repeat(60) + "1" + ")".repeat(60)), /deeply|complex/);
  assert.equal(tryCompile("1 +").ok, false);
});

test("function library", () => {
  assert.equal(ev("clamp(5, 0, 1)"), 1);
  assert.equal(ev("mix(0, 10, 0.25)"), 2.5);
  assert.equal(ev("map(5, 0, 10, 100, 200)"), 150);
  assert.equal(ev("mod(-1, 4)"), 3);
  assert.ok(Math.abs(ev("smoothstep(0, 1, 0.5)") - 0.5) < 1e-9);
  assert.equal(ev("round(3.14159, 2)"), 3.14);
  assert.ok(Math.abs(ev("ease(0.5, 'sine')") - 0.5) < 1e-9);
  assert.equal(FUNCTIONS.rand(3), FUNCTIONS.rand(3)); // deterministic
  assert.notEqual(FUNCTIONS.rand(3), FUNCTIONS.rand(4));
  const r = FUNCTIONS.rand(7);
  assert.ok(r >= 0 && r < 1);
  assert.match(ev("hsl(200, 80, 50, 0.5)"), /^hsla\(200, 80%, 50%, 0\.5\)$/);
  assert.equal(ev("mixc('#000000', '#ffffff', 0.5)"), "rgba(128, 128, 128, 1.000)");
  assert.match(ev("alpha('#ff0000', 0.25)"), /rgba\(255, 0, 0, 0\.250\)/);
  assert.equal(ev("tau"), Math.PI * 2);
  assert.throws(() => compile("nope(1)"), /Unknown function/);
});

test("stateful functions keep state per call site", () => {
  const c = compile("smooth(x, 1, 0.5) + smooth(x, 1, 0.5) * 0");
  const st = c.newState();
  assert.equal(c.run({ x: 1, dt: 1 / 60 }, st), 1);
  assert.equal(c.run({ x: 0, dt: 1 / 60 }, st), 0.5);
  assert.equal(c.run({ x: 0, dt: 1 / 60 }, st), 0.25);
  const p = compile("pulse(hit, 1)");
  const ps = p.newState();
  assert.equal(p.run({ hit: false, dt: 0.1 }, ps), 0);
  assert.ok(p.run({ hit: true, dt: 0.1 }, ps) > 0.8);
  assert.ok(p.run({ hit: true, dt: 0.1 }, ps) < 0.85); // no re-trigger while held
  const pk = compile("peak(x, 1)");
  const ks = pk.newState();
  pk.run({ x: 1, dt: 0.1 }, ks);
  assert.ok(Math.abs(pk.run({ x: 0, dt: 0.1 }, ks) - 0.9) < 1e-9);
  const ac = compile("accum(2)");
  const as = ac.newState();
  ac.run({ dt: 0.25 }, as);
  assert.equal(ac.run({ dt: 0.25 }, as), 1); // dt is clamped to 0.25 s per step
});

test("roots & paths are collected for dependency analysis", () => {
  const c = compile("audio.bass > 0.5 && p.layout.shell == 'stage' ? s.k : time");
  assert.deepEqual([...c.roots].sort(), ["audio", "p", "s", "time"]);
  assert.ok(c.paths.has("audio.bass") && c.paths.has("p.layout.shell"));
});
