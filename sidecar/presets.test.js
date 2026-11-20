"use strict";
// Unit tests for preset store (no ZiPlayer/ffmpeg required): node --test presets.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createPresetStore, safeRelPath } = require("./presets");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "zimusix-presets-"));
function makePreset(root, id, extra = {}, files = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "preset.json"), JSON.stringify({ schema: 1, id, name: id, ...extra }));
  for (const [rel, data] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), data);
  }
  return dir;
}

test("import a preset, list, read file, remove", () => {
  const data = tmp();
  const src = tmp();
  const dir = makePreset(src, "demo-one", {}, { "preview.png": "PNG", "assets/a.png": "A", "style.css": "a{}" });
  const store = createPresetStore(data);
  const res = store.importFrom(dir);
  assert.deepEqual(res.imported.map((p) => p.id), ["demo-one"]);
  assert.equal(res.imported[0].files, 4);
  assert.deepEqual(store.list().map((p) => p.id), ["demo-one"]);
  const info = store.resolveFile("demo-one", "assets/a.png");
  assert.equal(info.mime, "image/png");
  assert.equal(fs.readFileSync(info.file, "utf8"), "A");
  store.remove("demo-one");
  assert.equal(store.list().length, 0);
});

test("import folder containing multiple presets; broken presets reported, valid presets installed", () => {
  const data = tmp();
  const src = tmp();
  makePreset(src, "good-a");
  makePreset(src, "good-b");
  makePreset(src, "bad-ext", {}, { "evil.js": "alert(1)" });
  const res = createPresetStore(data).importFrom(src);
  assert.deepEqual(res.imported.map((p) => p.id).sort(), ["good-a", "good-b"]);
  assert.equal(res.failed.length, 1);
  assert.match(res.failed[0].error, /disallowed extension/i);
});

test("reject: missing manifest, bad id, newer schema, symlink, relative path", () => {
  const store = createPresetStore(tmp());
  const empty = tmp();
  assert.throws(() => store.importFrom(empty), /preset\.json/);
  assert.throws(() => store.importFrom("relative/path"), /Absolute path/i);

  const badId = tmp();
  fs.writeFileSync(path.join(badId, "preset.json"), JSON.stringify({ id: "../x", name: "x" }));
  assert.throws(() => store.importFrom(badId), /id/i);

  const future = tmp();
  fs.writeFileSync(path.join(future, "preset.json"), JSON.stringify({ id: "future", name: "f", schema: 99 }));
  assert.throws(() => store.importFrom(future), /schema/i);

  const dir = makePreset(tmp(), "with-link");
  try {
    fs.symlinkSync("/etc/passwd", path.join(dir, "link.txt"));
    assert.throws(() => store.importFrom(dir), /symlink/i);
  } catch (e) {
    if (e.code !== "EPERM") throw e; // Windows lacks permission to create symlinks
  }
});

test("overwriting import with same id replaces old content", () => {
  const store = createPresetStore(tmp());
  const v1 = makePreset(tmp(), "same-id", { version: "1" }, { "old.txt": "x" });
  store.importFrom(v1);
  const v2 = makePreset(tmp(), "same-id", { version: "2" });
  store.importFrom(v2);
  assert.equal(store.list()[0].manifest.version, "2");
  assert.throws(() => store.resolveFile("same-id", "old.txt"), /not found/i);
});

test("cannot import preset store itself", () => {
  const data = tmp();
  const store = createPresetStore(data);
  store.importFrom(makePreset(tmp(), "inside"));
  assert.throws(() => store.importFrom(path.join(store.root, "inside")), /already inside/i);
});

test("resolveFile blocks directory traversal, unknown extensions and bad ids", () => {
  const store = createPresetStore(tmp());
  store.importFrom(makePreset(tmp(), "safe", {}, { "a.png": "A" }));
  const secret = path.join(store.root, "secret.png");
  fs.writeFileSync(secret, "S");
  for (const rel of ["../secret.png", "/etc/passwd", "a/../../secret.png", "..\\secret.png", "C:/x.png", ""])
    assert.throws(() => store.resolveFile("safe", rel), /invalid/i, rel);
  assert.throws(() => store.resolveFile("safe", "preset.exe"), /not allowed/i);
  assert.throws(() => store.resolveFile("../safe", "a.png"), /id/i);
  assert.throws(() => store.resolveFile("safe", "missing.png"), /not found/i);
});

test("safeRelPath", () => {
  assert.equal(safeRelPath("assets/./a.png"), "assets/a.png");
  assert.equal(safeRelPath("../a"), null);
  assert.equal(safeRelPath("a\0b"), null);
});

test("broken installed preset is still listed with error for deletion", () => {
  const data = tmp();
  const store = createPresetStore(data);
  fs.mkdirSync(path.join(store.root, "broken"));
  fs.writeFileSync(path.join(store.root, "broken", "preset.json"), "{ not json");
  const [item] = store.list();
  assert.equal(item.id, "broken");
  assert.match(item.error, /JSON/);
  store.remove("broken");
  assert.equal(store.list().length, 0);
});

test("schema-2 companion files (modules/hooks/draw) must exist, be small and valid JSON", () => {
  const store = createPresetStore(tmp());
  const src = tmp();
  const good = makePreset(src, "with-logic", { schema: 2, modules: "modules.json", hooks: "hooks.json", draw: "draw.json" }, {
    "modules.json": "{}",
    "hooks.json": "{}",
    "draw.json": "{}",
  });
  assert.equal(store.importFrom(good).imported.length, 1);

  const missing = makePreset(tmp(), "no-modules", { schema: 2, modules: "modules.json" });
  assert.throws(() => store.importFrom(missing), /not found/i);

  const broken = makePreset(tmp(), "bad-hooks", { schema: 2, hooks: "hooks.json" }, { "hooks.json": "{nope" });
  assert.throws(() => store.importFrom(broken), /invalid JSON/i);

  const escape = makePreset(tmp(), "escape", { schema: 2, modules: "../modules.json" });
  assert.throws(() => store.importFrom(escape), /relative path/i);

  const big = makePreset(tmp(), "too-big", { schema: 2, draw: "draw.json" }, { "draw.json": JSON.stringify({ pad: "x".repeat(300 * 1024) }) });
  assert.throws(() => store.importFrom(big), /too large/i);
});
