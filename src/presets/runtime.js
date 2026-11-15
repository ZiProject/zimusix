/**
 * Preset Runtime — chọn preset, gộp tuỳ chỉnh của người dùng, rồi "áp dụng":
 *
 *   • đặt thuộc tính data-* lên <html> (CSS của từng module bám vào đó)
 *   • đặt CSS variables (kích thước ảnh, cỡ chữ lyrics, màu theme, --preset-*)
 *   • chèn style.css của preset (đã làm sạch)
 *   • báo cho các phần UI render lại (onPresetChange)
 *
 * Runtime không import UI để tránh vòng phụ thuộc; main.js nối sự kiện.
 */
import { app } from "../state.js";
import { loadBuiltinEntries, loadPresetCss, loadUserEntries } from "./loader.js";
import {
  COLOR_VARS,
  coerceSetting,
  defaultManifest,
  resolveConfig,
} from "./schema.js";
import { DEFAULT_PRESET_KEY, loadPrefs, savePrefs } from "./store.js";

/** @type {import("./loader.js").PresetEntry[]} */
let entries = [];
let userDir = "";
let prefs = loadPrefs();
let current = { entry: null, config: resolveConfig(defaultManifest()) };

const listeners = new Set();
let appliedVars = new Set();
let applyToken = 0;

/* --------------------------------------------------------------- truy cập */

/** Cấu hình hiện hành (luôn có đủ section nhờ giá trị mặc định). */
export const cfg = () => current.config;
export const activeEntry = () => current.entry;
export const activeKey = () => current.entry?.key ?? DEFAULT_PRESET_KEY;
export const listEntries = () => entries;
export const presetsDir = () => userDir;
export const userValuesOf = (key) => ({ ...(prefs.values[key] ?? {}) });

/** Gọi `fn(config, {reason})` mỗi khi cấu hình đổi. Trả hàm huỷ đăng ký. */
export function onPresetChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = (reason) => {
  for (const fn of listeners)
    try {
      fn(current.config, { reason });
    } catch (error) {
      console.error("[presets] listener lỗi:", error);
    }
};

/* ---------------------------------------------------------------- áp dụng */

function hexToRgbTriplet(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

function setVars(vars) {
  const style = document.documentElement.style;
  for (const name of appliedVars) if (!(name in vars)) style.removeProperty(name);
  for (const [name, value] of Object.entries(vars)) style.setProperty(name, value);
  appliedVars = new Set(Object.keys(vars));
}

function collectVars(config) {
  const { layout, artwork, lyrics, visualizer, theme, background } = config;
  const vars = {
    "--content-width": `${layout.contentWidth}px`,
    "--radius": `${layout.radius}px`,
    "--icon-size": `${config.controls.iconSize}px`,
    "--art-size": `${artwork.size}px`,
    "--stage-art": `${artwork.stageSize}px`,
    "--art-react": artwork.react ? String(artwork.reactAmount / 100) : "0",
    "--art-glow": artwork.glow ? "1" : "0",
    "--spin-speed": `${artwork.spinSpeed}s`,
    "--lyrics-size": `${lyrics.size}px`,
    "--lyrics-active-scale": String(lyrics.activeScale),
    "--viz-stage-h": `${visualizer.height}px`,
    "--info-title-scale": String(config.info.titleScale),
    "--fx-speed": String(background.speed),
    "--fx-intensity": String(background.intensity),
    "--fx-angle": `${background.angle}deg`,
  };
  for (const [token, value] of Object.entries(theme.colors)) {
    const name = COLOR_VARS[token];
    if (!name) continue;
    vars[name] = value;
    if (token === "bg") vars["--bg-rgb"] = hexToRgbTriplet(value);
    if (token === "panel") vars["--panel-rgb"] = hexToRgbTriplet(value);
  }
  if (theme.fontFamily) vars["font-family"] = theme.fontFamily;
  for (const [name, value] of Object.entries(config.cssVars)) vars[name] = value;
  return vars;
}

function applyAttributes(config) {
  const d = document.documentElement.dataset;
  const { layout, artwork, info, background, visualizer, lyrics, theme, controls } = config;
  d.btn = controls.buttons;
  d.playBtn = controls.playButton;
  d.nav = controls.nav;
  d.toolbar = controls.toolbar;
  d.panels = controls.panels;
  d.shell = layout.shell;
  d.sidebar = layout.sidebar;
  d.playerPos = layout.player;
  d.density = layout.density;
  d.artwork = artwork.style;
  d.artSpin = artwork.spin ? "1" : "0";
  d.artShadow = artwork.shadow ? "1" : "0";
  d.info = info.style;
  d.bgEffect = background.effect;
  d.viz = visualizer.type;
  d.vizPlayer = visualizer.placement.includes("player") && visualizer.type !== "none" ? "1" : "0";
  d.lyricsMode = lyrics.mode;
  d.lyricsAlign = lyrics.align;
  d.lyricsTime = lyrics.showTime ? "1" : "0";
  d.scheme = theme.colorScheme;
  document.documentElement.style.colorScheme = theme.colorScheme;
}

function setPresetStyle(css) {
  let el = document.getElementById("preset-style");
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = "preset-style";
    document.head.append(el);
  }
  el.textContent = css;
}

function applyConfig(reason, prevSidebar) {
  const { config, entry } = current;
  if (prevSidebar !== undefined && prevSidebar !== config.layout.sidebar)
    app.sidebarHidden = config.layout.sidebar === "hidden";
  applyAttributes(config);
  document.documentElement.dataset.preset = entry?.id ?? "classic";
  setVars(collectVars(config));
  emit(reason);
}

function reresolve() {
  const entry = current.entry;
  const manifest = entry?.manifest ?? defaultManifest();
  current.config = resolveConfig(manifest, prefs.values[entry?.key ?? DEFAULT_PRESET_KEY]);
}

/* ------------------------------------------------------------- hành động */

/** Chọn preset theo key. Trả `false` nếu preset không dùng được. */
export async function applyPreset(key, { persist = true } = {}) {
  const entry = entries.find((e) => e.key === key);
  if (!entry?.valid) return false;
  const token = ++applyToken;
  const { css } = await loadPresetCss(entry);
  if (token !== applyToken) return true; // có lần chọn mới hơn
  current.entry = entry;
  reresolve();
  setPresetStyle(css);

  const { layout } = current.config;
  app.sidebarHidden = layout.sidebar === "hidden";
  if (layout.defaultView !== "keep") app.view = layout.defaultView;

  if (persist) {
    prefs.active = entry.key;
    savePrefs(prefs);
  }
  applyConfig("preset");
  return true;
}

/** Đổi một tuỳ chỉnh của preset đang dùng (áp dụng ngay, không nạp lại CSS). */
export function setPresetSetting(settingKey, rawValue) {
  const entry = current.entry;
  const setting = entry?.manifest?.settings.find((s) => s.key === settingKey);
  if (!setting) return;
  const coerced = coerceSetting(setting, rawValue);
  if (!coerced.ok) return;
  prefs.values[entry.key] = { ...(prefs.values[entry.key] ?? {}), [settingKey]: coerced.value };
  savePrefs(prefs);
  const prevSidebar = current.config.layout.sidebar;
  reresolve();
  applyConfig("setting", prevSidebar);
}

export function resetPresetSettings() {
  const entry = current.entry;
  if (!entry) return;
  delete prefs.values[entry.key];
  savePrefs(prefs);
  const prevSidebar = current.config.layout.sidebar;
  reresolve();
  applyConfig("setting", prevSidebar);
}

/** Tải lại danh sách preset (sau khi thêm/xoá thư mục). */
export async function reloadEntries() {
  const [builtin, user] = await Promise.all([loadBuiltinEntries(), loadUserEntries()]);
  userDir = user.dir;
  entries = [...builtin, ...user.entries];
  // preset đang dùng bị xoá / hỏng → về mặc định
  if (current.entry && !entries.some((e) => e.key === current.entry.key && e.valid)) {
    await applyPreset(DEFAULT_PRESET_KEY, { persist: true });
  } else if (current.entry) {
    // manifest có thể đã đổi (import đè): làm mới tham chiếu
    const fresh = entries.find((e) => e.key === current.entry.key);
    if (fresh) {
      current.entry = fresh;
      reresolve();
      const { css } = await loadPresetCss(fresh);
      setPresetStyle(css);
      applyConfig("reload");
    }
  }
}

/** Khởi động: nạp danh sách + áp dụng preset đã lưu (rơi về `classic`, rồi về mặc định cứng). */
export async function initPresets() {
  prefs = loadPrefs();
  const [builtin, user] = await Promise.all([loadBuiltinEntries(), loadUserEntries()]);
  userDir = user.dir;
  entries = [...builtin, ...user.entries];
  const order = [prefs.active, DEFAULT_PRESET_KEY];
  for (const key of order) if (await applyPreset(key, { persist: false })) return;
  // không có preset nào dùng được: dùng cấu hình mặc định cứng (tương đương classic)
  current = { entry: null, config: resolveConfig(defaultManifest()) };
  applyConfig("init");
}
