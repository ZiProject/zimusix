// node --test scripts/schema.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { sanitizePresetCss } from "../src/presets/css.js";
import { coerceSetting, defaultManifest, normalizeManifest, resolveConfig } from "../src/presets/schema.js";

const base = { id: "t-one", name: "T" };

test("manifest tối thiểu hợp lệ và có đủ mặc định", () => {
  const r = normalizeManifest(base);
  assert.ok(r.ok);
  assert.equal(r.manifest.layout.shell, "classic");
  assert.equal(r.manifest.preview, "preview.png");
  assert.deepEqual(r.manifest.visualizer.placement, ["player"]);
});

test("lỗi nặng: thiếu id/name, id xấu, schema mới", () => {
  assert.equal(normalizeManifest({}).ok, false);
  assert.equal(normalizeManifest({ id: "Bad ID", name: "x" }).ok, false);
  assert.equal(normalizeManifest({ ...base, schema: 2 }).ok, false);
  assert.equal(normalizeManifest([]).ok, false);
});

test("giá trị sai → cảnh báo + dùng mặc định, không hỏng preset", () => {
  const r = normalizeManifest({
    ...base,
    layout: { shell: "nope", contentWidth: 99999, bogus: 1 },
    theme: { colors: { accent: "red", muted: "#abc" } },
    visualizer: { placement: ["stage", "x"] },
  });
  assert.ok(r.ok);
  assert.equal(r.manifest.layout.shell, "classic");
  assert.equal(r.manifest.layout.contentWidth, 1400);
  assert.deepEqual(r.manifest.theme.colors, { muted: "#abc" });
  assert.deepEqual(r.manifest.visualizer.placement, ["stage"]);
  assert.ok(r.warnings.length >= 3);
});

test("settings: bind hợp lệ/không hợp lệ và ép kiểu", () => {
  const r = normalizeManifest({
    ...base,
    visualizer: { bars: 40 },
    settings: [
      { key: "bars", type: "range", bind: "visualizer.bars", min: 4, max: 200 },
      { key: "bad1", type: "range", bind: "visualizer.type" },
      { key: "bad2", type: "toggle", bind: "visualizer.bars" },
      { key: "bad3", type: "range", bind: "nope.x" },
      { key: "bad4", type: "color", bind: "css:--accent" },
      { key: "Bad", type: "range", bind: "visualizer.bars" },
      { key: "col", type: "color", bind: "theme.colors.accent" },
      { key: "glow", type: "range", bind: "css:--preset-glow", min: 0, max: 10, unit: "px", default: 3 },
      { key: "t", type: "select", bind: "lyrics.mode", options: ["list", "zzz", { value: "karaoke", label: "K" }] },
    ],
  });
  assert.deepEqual(r.manifest.settings.map((s) => s.key), ["bars", "col", "glow", "t"]);
  const bars = r.manifest.settings[0];
  assert.equal(bars.min, 8); // kẹp theo khoảng của tham số
  assert.equal(bars.max, 96);
  assert.equal(bars.default, 40); // lấy từ section
  assert.deepEqual(r.manifest.settings[3].options.map((o) => o.value), ["list", "karaoke"]);
  assert.equal(coerceSetting(bars, 500).value, 96);
  assert.equal(coerceSetting(bars, "abc").ok, false);
});

test("resolveConfig: ưu tiên giá trị người dùng, kẹp khoảng, css var", () => {
  const { manifest } = normalizeManifest({
    ...base,
    settings: [
      { key: "bars", type: "range", bind: "visualizer.bars", min: 10, max: 50, default: 20 },
      { key: "col", type: "color", bind: "theme.colors.accent", default: "#112233" },
      { key: "glow", type: "range", bind: "css:--preset-glow", min: 0, max: 10, unit: "px", default: 3 },
    ],
  });
  let c = resolveConfig(manifest);
  assert.equal(c.visualizer.bars, 20);
  assert.equal(c.theme.colors.accent, "#112233");
  assert.equal(c.cssVars["--preset-glow"], "3px");
  c = resolveConfig(manifest, { bars: 9999, col: "javascript:x", glow: 7 });
  assert.equal(c.visualizer.bars, 50);
  assert.equal(c.theme.colors.accent, "#112233"); // giá trị sai bị bỏ
  assert.equal(c.cssVars["--preset-glow"], "7px");
});

test("defaultManifest dùng được", () => {
  assert.equal(resolveConfig(defaultManifest()).layout.sidebar, "left");
});

test("sanitizePresetCss", () => {
  const resolve = (r) => `/f/${r}`;
  const { css, notes } = sanitizePresetCss(
    `@import url(http://evil/x.css);
     .a{background:url(assets/n.png)} .b{background:url("https://evil/t.png")}
     .c{background:url('../up.png')} .d{background:url(data:image/png;base64,AAA)}
     .e{width:expression(alert(1)); -moz-binding:url(x)} /* url(commented.png) */`,
    resolve,
  );
  assert.match(css, /url\("\/f\/assets\/n\.png"\)/);
  assert.doesNotMatch(css, /evil/);
  assert.doesNotMatch(css, /@import|expression|binding|up\.png|commented/);
  assert.match(css, /data:image\/png/);
  assert.ok(notes.length >= 4);
  assert.match(sanitizePresetCss(".a{background:url(n.png)}", resolve, "css/sub").css, /\/f\/css\/sub\/n\.png/);
});

test("preset built-in đều hợp lệ và index khớp thư mục", () => {
  const dir = new URL("../public/presets/", import.meta.url);
  const { presets } = JSON.parse(fs.readFileSync(new URL("index.json", dir), "utf8"));
  assert.ok(presets.includes("classic"));
  for (const id of presets) {
    const r = normalizeManifest(JSON.parse(fs.readFileSync(new URL(`${id}/preset.json`, dir), "utf8")));
    assert.ok(r.ok, `${id}: ${r.errors}`);
    assert.deepEqual(r.warnings, [], `${id} có cảnh báo`);
    assert.ok(fs.existsSync(new URL(`${id}/${r.manifest.preview}`, dir)), `${id} thiếu preview`);
  }
});
