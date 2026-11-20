// node --test scripts/schema.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildPreset } from "../src/presets/build.js";
import { sanitizePresetCss } from "../src/presets/css.js";
import { buildModules, coerceSetting, emitConfig, fallbackConfig, resolveConfig, safeCssValue } from "../src/presets/schema.js";

const core = JSON.parse(fs.readFileSync(new URL("../public/schema/core.json", import.meta.url), "utf8"));
const base = { id: "t-one", name: "T" };
const build = (manifest, files = {}) => buildPreset({ manifest, ...files }, { core });
const norm = (manifest, modules) => {
  const r = build(manifest, modules ? { modules } : {});
  assert.ok(r.ok, JSON.stringify(r.errors));
  return r;
};

test("minimal manifest is valid and gets core schema defaults", () => {
  const { manifest } = norm(base);
  assert.equal(manifest.sections.layout.shell, "classic");
  assert.equal(manifest.preview, "preview.png");
  assert.deepEqual(manifest.sections.visualizer.placement, ["player"]);
});

test("fatal errors: missing id/name, invalid id, newer schema; schema 1 and 2 accepted", () => {
  assert.equal(build({}).ok, false);
  assert.equal(build({ id: "Bad ID", name: "x" }).ok, false);
  assert.equal(build({ ...base, schema: 3 }).ok, false);
  assert.equal(build([]).ok, false);
  assert.ok(build({ ...base, schema: 1 }).ok);
  assert.ok(build({ ...base, schema: 2 }).ok);
});

test("invalid values → warning + default, without breaking the preset", () => {
  const { manifest, warnings } = norm({
    ...base,
    layout: { shell: "nope", contentWidth: 99999, bogus: 1 },
    theme: { colors: { accent: "red", muted: "#abc" } },
    visualizer: { placement: ["stage", "x"] },
  });
  assert.equal(manifest.sections.layout.shell, "classic");
  assert.equal(manifest.sections.layout.contentWidth, 1400);
  assert.deepEqual(manifest.sections.theme.colors, { muted: "#abc" });
  assert.deepEqual(manifest.sections.visualizer.placement, ["stage"]);
  assert.ok(warnings.length >= 3);
});

test("settings: valid/invalid bind and type coercion", () => {
  const { manifest } = norm({
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
      { key: "ptype", type: "select", bind: "lyrics.mode" }, // options default to the enum's values
    ],
  });
  assert.deepEqual(manifest.settings.map((s) => s.key), ["bars", "col", "glow", "t", "ptype"]);
  const bars = manifest.settings[0];
  assert.equal(bars.min, 8);
  assert.equal(bars.max, 96);
  assert.equal(bars.default, 40);
  assert.deepEqual(manifest.settings[3].options.map((o) => o.value), ["list", "karaoke"]);
  assert.ok(manifest.settings[4].options.length >= 3);
  assert.equal(coerceSetting(bars, 500).value, 96);
  assert.equal(coerceSetting(bars, "abc").ok, false);
});

test("settings: multiselect, palette, text, group, visibleIf", () => {
  const { manifest, warnings } = norm({
    ...base,
    settings: [
      { key: "where", type: "multiselect", bind: "visualizer.placement", group: "Visualizer" },
      { key: "pal", type: "palette", bind: "background.colors", count: 3, visibleIf: "p.background.effect != 'media'" },
      { key: "font", type: "text", bind: "theme.fontFamily" },
      { key: "bad", type: "multiselect", bind: "layout.shell" },
      { key: "bad2", type: "range", bind: "layout.shell" },
      { key: "bad3", type: "toggle", bind: "layout.shell", visibleIf: "1 +" },
    ],
  });
  assert.deepEqual(manifest.settings.map((s) => s.key), ["where", "pal", "font"]);
  assert.equal(manifest.settings[0].group, "Visualizer");
  assert.equal(manifest.settings[1].count, 3);
  assert.equal(manifest.settings[1].visibleIf, "p.background.effect != 'media'");
  assert.deepEqual(coerceSetting(manifest.settings[0], ["stage", "nope", "stage"]).value, ["stage"]);
  assert.deepEqual(coerceSetting(manifest.settings[1], ["#fff", "red", "#000", "#111", "#222"]).value, ["#fff", "#000", "#111"]);
  assert.ok(warnings.length >= 3);
});

test("resolveConfig: prefers user values, clamps range, css var", () => {
  const { manifest } = norm({
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
  assert.equal(c.theme.colors.accent, "#112233");
  assert.equal(c.cssVars["--preset-glow"], "7px");
});

test("precedence: manifest < setting default < rules < user setting < user override", () => {
  const { manifest } = norm({
    ...base,
    layout: { sidebar: "right" },
    settings: [{ key: "side", type: "select", bind: "layout.sidebar", options: ["left", "right", "rail", "hidden"] }],
  });
  assert.equal(resolveConfig(manifest).layout.sidebar, "right");
  const rules = [{ "layout.sidebar": "rail" }];
  assert.equal(resolveConfig(manifest, {}, { ruleSets: rules }).layout.sidebar, "rail");
  assert.equal(resolveConfig(manifest, { side: "left" }, { ruleSets: rules }).layout.sidebar, "left");
  assert.equal(resolveConfig(manifest, { side: "left" }, { ruleSets: rules, overrides: { "layout.sidebar": "hidden" } }).layout.sidebar, "hidden");
  // invalid rule/override values are ignored
  assert.equal(resolveConfig(manifest, {}, { overrides: { "layout.sidebar": "zzz", "nope.x": 1 } }).layout.sidebar, "right");
});

test("schema contract: a preset that drops sections still yields a complete config", () => {
  const { manifest } = norm(base, { sections: { tiny: { params: { n: { type: "number", min: 0, max: 1, default: 0.5 } } } } });
  assert.deepEqual(Object.keys(manifest.sections), ["tiny"]);
  const c = resolveConfig(manifest);
  assert.equal(c.tiny.n, 0.5);
  assert.equal(c.visualizer.type, "bars"); // engine contract fallback
  assert.equal(c.layout.sidebar, "left");
  assert.equal(fallbackConfig().artwork.stageSize, 320);
});

test("modules.json: extends core — add a section, change a param, remove a param", () => {
  const modules = {
    extends: "core",
    sections: {
      cinema: {
        doc: "Cinema mode",
        params: {
          vignette: { type: "number", min: 0, max: 1, default: 0.4, emit: { css: "--cinema-vignette" } },
          mode: { type: "enum", values: ["off", "letterbox", "scope"], default: "off", emit: { attr: "cinema" } },
          tint: { type: "color", default: "#112233", emit: { css: "--cinema-tint" } },
          dark: { type: "boolean", default: true, emit: { class: "dark-bars" } },
        },
      },
      layout: { params: { shell: { values: ["classic", "stage", "focus", "split", "cinema"] }, radius: null } },
    },
    emit: [{ css: "--cinema-dim", expr: "p.cinema.mode == 'off' ? 0 : p.cinema.vignette * 100", unit: "%" }],
  };
  const { manifest, warnings } = norm({ ...base, layout: { shell: "cinema" }, cinema: { mode: "scope", vignette: 0.75 } }, modules);
  assert.deepEqual(warnings, []);
  assert.equal(manifest.sections.layout.shell, "cinema"); // enum extended by the preset
  assert.equal("radius" in manifest.sections.layout, false); // removed
  assert.equal(manifest.sections.cinema.vignette, 0.75);
  const out = emitConfig(resolveConfig(manifest), manifest.modules);
  assert.equal(out.attrs.cinema, "scope");
  assert.equal(out.attrs.shell, "cinema");
  assert.equal(out.css["--cinema-vignette"], "0.75");
  assert.equal(out.css["--cinema-tint"], "#112233");
  assert.equal(out.css["--cinema-dim"], "75%");
  assert.deepEqual(out.classes, ["x-dark-bars"]);
  assert.equal("--radius" in out.css, false);
  // step default is derived from the range (0..1 → 0.01), not rounded to integers
  assert.equal(manifest.modules.sections.cinema.params.vignette.step, 0.01);
});

test("modules.json: validation of param specs, names and emit targets", () => {
  const r = buildModules({
    sections: {
      ok: { params: { a: { type: "boolean", default: true, emit: { attr: "a-flag" } } } },
      "Bad Name": { params: {} },
      s: {
        params: {
          n1: { type: "number", min: 5, max: 1 },
          e1: { type: "enum", values: [] },
          t1: { type: "teleport" },
          x1: { type: "boolean", emit: { attr: "preset" } },
          x2: { type: "boolean", emit: { css: "position" } },
          x3: { type: "boolean", emit: { css: "--fine-var" } },
          "bad-key": { type: "boolean" },
          __proto__: { type: "boolean" },
        },
      },
    },
    emit: [{ css: "--x", expr: "p.nope.(" }, { css: "--y", expr: "audio.bass" }],
  });
  assert.ok(r.ok);
  assert.deepEqual(Object.keys(r.modules.sections), ["ok", "s"]);
  assert.deepEqual(Object.keys(r.modules.sections.s.params).sort(), ["x1", "x2", "x3"]);
  assert.equal(r.modules.sections.s.params.x1.emit, undefined); // reserved attribute
  assert.equal(r.modules.sections.s.params.x2.emit, undefined); // arbitrary CSS property
  assert.equal(r.modules.sections.s.params.x3.emit.css, "--fine-var");
  assert.equal(r.modules.emitRules.filter((x) => x.expr).length, 0); // both expression rules rejected
  assert.ok(r.warnings.length >= 7);
  assert.equal(buildModules(undefined, undefined).ok, false);
  assert.equal(buildModules({ extends: "core", sections: {} }, undefined).ok, false);
});

test("emit: lists, assets, colormap, unsafe CSS values", () => {
  const modules = {
    sections: {
      a: {
        params: {
          list: { type: "list", values: ["x", "y"], default: ["x", "y"], emit: { attr: "list" } },
          img: { type: "asset", accept: ["png"], default: "assets/bg.png", emit: { css: "--preset-img" } },
          pal: { type: "colormap", keys: { main: "--c-main", back: "--c-back" }, rgb: { back: "--c-back-rgb" } },
        },
      },
    },
  };
  const { manifest } = norm({ ...base, a: { pal: { main: "#ff0000", back: "#102030" }, img: "assets/b.png" } }, modules);
  const out = emitConfig(resolveConfig(manifest), manifest.modules, { fileUrl: (r) => `/presets/${r}` });
  assert.equal(out.attrs.list, "x y");
  assert.equal(out.css["--preset-img"], 'url("/presets/assets/b.png")');
  assert.equal(out.css["--c-main"], "#ff0000");
  assert.equal(out.css["--c-back-rgb"], "16 32 48");
  // asset must be a safe relative path with an accepted extension
  const bad = norm({ ...base, a: { img: "../x.png" } }, modules);
  assert.equal(bad.manifest.sections.a.img, "assets/bg.png");
  assert.equal(norm({ ...base, a: { img: "x.jpg" } }, modules).manifest.sections.a.img, "assets/bg.png");
  assert.equal(safeCssValue("url(http://evil)"), null);
  assert.equal(safeCssValue("1; color: red"), null);
  assert.equal(safeCssValue("12px"), "12px");
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

const presetsDir = new URL("../public/presets/", import.meta.url);
const readJson = (rel) => (fs.existsSync(new URL(rel, presetsDir)) ? JSON.parse(fs.readFileSync(new URL(rel, presetsDir), "utf8")) : undefined);
const loadBuiltin = (id) => {
  const manifest = readJson(`${id}/preset.json`);
  const files = { manifest };
  for (const f of ["modules", "hooks", "draw"]) if (manifest[f]) files[f] = readJson(`${id}/${manifest[f]}`);
  return buildPreset(files, { core });
};

test("built-in presets own their schema, are valid, warning-free and indexed", () => {
  const { presets } = readJson("index.json");
  assert.ok(presets.includes("classic"));
  for (const id of presets) {
    const r = loadBuiltin(id);
    assert.ok(r.ok, `${id}: ${r.errors}`);
    assert.deepEqual(r.warnings, [], `${id} has warnings`);
    assert.equal(r.manifest.files.modules, "modules.json", `${id} should ship its own modules.json`);
    assert.ok(fs.existsSync(new URL(`${id}/${r.manifest.preview}`, presetsDir)), `${id} missing preview`);
  }
});

test("emit of a built-in preset reproduces the previous hard-coded output", () => {
  const r = loadBuiltin("neon-afterlife");
  const out = emitConfig(resolveConfig(r.manifest), r.manifest.modules);
  assert.equal(out.attrs.shell, "stage");
  assert.equal(out.attrs["player-pos"], "floating");
  assert.equal(out.attrs["viz-player"], "1");
  assert.equal(out.attrs["art-spin"], "0");
  assert.equal(out.css["--content-width"], "1240px");
  assert.equal(out.css["--spin-speed"], "18s");
  assert.equal(out.css["--art-react"], "0.1");
  assert.equal(out.css["color-scheme"], "dark");
  assert.equal(out.css["--bg-rgb"], "7 8 16");
  assert.equal(out.css["--preset-neon-intensity"], "0.85");
  // classic keeps theme colors empty (app CSS supplies them): nothing emitted for them
  const classic = loadBuiltin("classic");
  const c = emitConfig(resolveConfig(classic.manifest), classic.manifest.modules);
  assert.equal("--accent" in c.css, false);
  assert.equal("font-family" in c.css, false);
});

test("dynamic-scenes preset: scene selector switches background.effect", () => {
  const { manifest, warnings } = loadBuiltin("dynamic-scenes");
  assert.deepEqual(warnings, []);
  const scene = manifest.settings.find((s) => s.key === "scene");
  assert.deepEqual(scene.options.map((o) => o.value).sort(), ["fireworks", "glyphs", "hearts", "rain", "sakura"]);
  assert.equal(resolveConfig(manifest).background.effect, "sakura");
  for (const o of scene.options) assert.equal(resolveConfig(manifest, { scene: o.value }).background.effect, o.value);
  assert.equal(resolveConfig(manifest, { scene: "nope" }).background.effect, "sakura");
  assert.equal(resolveConfig(manifest, { react: false }).background.react, false);
  const css = fs.readFileSync(new URL("dynamic-scenes/style.css", presetsDir), "utf8");
  for (const o of scene.options) assert.match(css, new RegExp(`data-bg-effect="${o.value}"`), o.value);
});

test("background wallpaper: preset image/video are asset parameters with safe paths and extensions", () => {
  const bg = core.sections.background.params;
  assert.equal(bg.image.type, "asset");
  assert.equal(bg.video.type, "asset");
  assert.deepEqual(bg.wallpaper.values, ["fallback", "always"]);
  const ok = norm({ ...base, background: { image: "assets/w.jpg", video: "assets/w.mp4", wallpaper: "always", wallBlur: 12 } });
  assert.equal(ok.manifest.sections.background.image, "assets/w.jpg");
  assert.equal(ok.manifest.sections.background.video, "assets/w.mp4");
  assert.equal(ok.manifest.sections.background.wallpaper, "always");
  const out = emitConfig(resolveConfig(ok.manifest), ok.manifest.modules);
  assert.equal(out.css["--wall-blur"], "12px");
  assert.equal("--wall-fit" in out.css, true);
  // wrong extension for the slot, traversal, absolute and remote URLs fall back to "" with a warning
  for (const [key, value] of [["video", "assets/w.png"], ["image", "../w.jpg"], ["image", "/etc/passwd"], ["image", "https://evil/x.png"], ["video", "assets/w.exe"]]) {
    const r = norm({ ...base, background: { [key]: value } });
    assert.equal(r.manifest.sections.background[key], "", `${key}=${value}`);
    assert.ok(r.warnings.some((w) => w.includes(`background.${key}`)));
  }
  // the shipped showcase uses a real wallpaper file
  const lab = loadBuiltin("signal-lab");
  assert.equal(lab.manifest.sections.background.image, "assets/nebula.svg");
  assert.ok(fs.existsSync(new URL("signal-lab/assets/nebula.svg", presetsDir)));
});
