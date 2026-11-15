/**
 * Schema của Preset + bộ đăng ký các "module" mà preset có thể chọn.
 *
 * File này THUẦN (không đụng DOM/localStorage) để dùng chung cho:
 *   - runtime trong app (src/presets/runtime.js)
 *   - công cụ kiểm tra preset (scripts/presets.mjs)
 *
 * Preset chỉ KHAI BÁO: "dùng module nào, với tham số nào". Phần code thực thi nằm
 * trong app (CSS + JS của từng module), nên preset (kể cả do người dùng thêm) không
 * chạy được mã tuỳ ý.
 */

export const SCHEMA_VERSION = 1;
export const MANIFEST_FILE = "preset.json";
export const DEFAULT_PREVIEW = "preview.png";
export const PREVIEW_EXTS = ["png", "jpg", "jpeg", "webp", "svg", "avif"];
export const ID_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/;
export const SETTING_KEY_RE = /^[a-z][A-Za-z0-9]{0,31}$/;
export const CSS_VAR_RE = /^--preset-[a-z][a-z0-9-]{0,40}$/;
const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FONT_RE = /^[\w\s,'"\-.]{1,120}$/u;

/* ---------------------------------------------------------------- param types */

const enumOf = (values, def, doc) => ({ type: "enum", values, default: def, doc });
const num = (def, min, max, doc, step = 1) => ({
  type: "number",
  default: def,
  min,
  max,
  step,
  doc,
});
const bool = (def, doc) => ({ type: "boolean", default: def, doc });
const color = (def, doc) => ({ type: "color", default: def, doc });
const list = (values, def, max, doc) => ({
  type: "list",
  values,
  default: def,
  max,
  doc,
});
const colors = (max, doc) => ({ type: "colors", default: [], max, doc });

/**
 * Mỗi section là một "module" của preset. Giá trị `default` của tất cả tham số
 * trùng với giao diện gốc của Zimusix (preset `classic`).
 */
export const MODULES = {
  layout: {
    doc: "Bố cục tổng thể của giao diện web (thanh bên, thanh phát, độ rộng nội dung).",
    params: {
      shell: enumOf(
        ["classic", "stage", "focus", "split"],
        "classic",
        "classic: danh sách | stage: sân khấu giữa | focus: tập trung lyrics | split: chia đôi sân khấu + nội dung",
      ),
      sidebar: enumOf(
        ["left", "right", "rail", "hidden"],
        "left",
        "Vị trí thanh bên: trái, phải, thu gọn (chỉ icon) hoặc ẩn",
      ),
      player: enumOf(
        ["bottom", "floating", "top", "minimal"],
        "bottom",
        "Thanh phát: dưới, nổi, trên hoặc tối giản",
      ),
      density: enumOf(["comfortable", "compact"], "comfortable", "Độ dày khoảng cách"),
      defaultView: enumOf(
        [
          "keep",
          "search",
          "library",
          "queue",
          "related",
          "lyrics",
          "nowplaying",
          "presets",
          "discord",
        ],
        "keep",
        'Tab mở khi chọn preset ("keep" = giữ tab hiện tại)',
      ),
      contentWidth: num(880, 560, 1400, "Độ rộng tối đa của nội dung (px)"),
      radius: num(12, 0, 28, "Bo góc của panel (px)"),
    },
  },

  controls: {
    doc: "Giao diện của mọi nút, thanh công cụ, điều hướng và panel.",
    params: {
      buttons: enumOf(
        ["soft", "pill", "square", "ghost", "outline"],
        "soft",
        "Kiểu nút chung: soft (mặc định) | pill (bo tròn) | square (vuông) | ghost (không nền) | outline (viền nhấn)",
      ),
      playButton: enumOf(["circle", "square", "accent"], "circle", "Nút Phát/Tạm dừng: tròn | vuông bo | tô màu nhấn"),
      nav: enumOf(["soft", "pill", "bar"], "soft", "Mục điều hướng ở thanh bên: soft | pill | bar (vạch nhấn)"),
      toolbar: enumOf(
        ["docked", "floating", "transparent", "autohide"],
        "docked",
        "Thanh công cụ phía trên: docked | floating (viên thuốc) | transparent | autohide (hiện khi rê chuột)",
      ),
      panels: enumOf(["solid", "glass", "flat"], "solid", "Nền của thanh bên/thanh phát/popup: đặc | kính mờ | phẳng (trong suốt)"),
      iconSize: num(18, 14, 26, "Cỡ icon của nút và điều hướng (px)"),
    },
  },

  artwork: {
    doc: "Cách trình bày ảnh bìa (thanh phát + khu Đang phát).",
    params: {
      style: enumOf(
        ["square", "rounded", "circle", "vinyl", "polaroid", "none"],
        "rounded",
        "Kiểu khung ảnh",
      ),
      size: num(56, 32, 96, "Kích thước ảnh trên thanh phát (px)"),
      stageSize: num(320, 160, 560, "Kích thước ảnh ở khu Đang phát (px)"),
      react: bool(true, "Ảnh nhún theo bass"),
      reactAmount: num(8, 0, 20, "Mức nhún (%)"),
      glow: bool(true, "Quầng sáng theo bass"),
      spin: bool(false, "Quay khi đang phát (hợp với circle/vinyl)"),
      spinSpeed: num(18, 4, 60, "Số giây cho một vòng quay"),
      shadow: bool(false, "Đổ bóng cố định dưới ảnh"),
    },
  },

  info: {
    doc: "Cách hiển thị thông tin bài hát.",
    params: {
      style: enumOf(
        ["inline", "stacked", "centered", "huge"],
        "inline",
        "inline: gọn | stacked: tiêu đề lớn | centered: căn giữa | huge: chữ rất lớn",
      ),
      show: list(["title", "artist", "source", "duration"], ["title", "artist", "source"], 4),
      marquee: bool(true, "Tiêu đề dài tự chạy chữ"),
      titleScale: num(1, 0.7, 2, "Hệ số phóng chữ tiêu đề", 0.05),
    },
  },

  background: {
    doc: "Hiệu ứng nền.",
    params: {
      effect: enumOf(
        ["media", "aurora", "gradient", "solid", "particles"],
        "media",
        "media: ảnh bìa/video | aurora | gradient | solid | particles",
      ),
      media: enumOf(
        ["auto", "on", "off"],
        "auto",
        "Có phủ ảnh bìa/video lên không (auto: chỉ khi effect = media)",
      ),
      colors: colors(4, "Tối đa 4 màu hex; bỏ trống = dùng màu accent"),
      speed: num(1, 0.2, 3, "Tốc độ hiệu ứng", 0.1),
      intensity: num(0.6, 0, 1, "Độ đậm hiệu ứng", 0.05),
      angle: num(135, 0, 360, "Góc gradient (độ)"),
      count: num(70, 10, 200, "Số hạt (particles)"),
      react: bool(true, "Hiệu ứng phản ứng theo nhạc"),
    },
  },

  visualizer: {
    doc: "Visualizer âm thanh.",
    params: {
      type: enumOf(
        ["bars", "mirror", "wave", "circle", "dots", "none"],
        "bars",
        "Kiểu vẽ",
      ),
      placement: list(["player", "stage", "background"], ["player"], 3, "Vẽ ở đâu (có thể nhiều nơi)"),
      bars: num(32, 8, 96, "Số cột/điểm"),
      colorMode: enumOf(["gradient", "accent", "solid"], "gradient", "Cách tô màu"),
      color: color("#a78bfa", "Màu khi colorMode = solid"),
      thickness: num(2, 1, 10, "Độ dày nét / khoảng cách giữa cột (px)"),
      smoothing: num(0, 0, 0.95, "Làm mượt giữa các khung hình", 0.05),
      opacity: num(1, 0.1, 1, "Độ đậm", 0.05),
      height: num(120, 60, 420, "Chiều cao vùng vẽ ở khu Đang phát (px)"),
    },
  },

  lyrics: {
    doc: "Cách hiển thị lời bài hát.",
    params: {
      mode: enumOf(
        ["list", "karaoke", "focus", "compact"],
        "list",
        "list: cả bài | karaoke: dòng hiện tại to, mờ dần | focus: chỉ vài dòng quanh dòng hiện tại | compact: nhỏ gọn",
      ),
      placement: enumOf(
        ["view", "stage"],
        "view",
        "view: tab Lời bài hát | stage: nhúng trong khu Đang phát",
      ),
      align: enumOf(["left", "center", "right"], "left", "Căn lề"),
      showTime: bool(true, "Hiện mốc thời gian từng dòng"),
      size: num(22, 14, 48, "Cỡ chữ dòng thường (px)"),
      activeScale: num(1.27, 1, 1.8, "Dòng đang hát phóng to bao nhiêu lần", 0.01),
      glow: bool(true, "Dòng hiện tại phát sáng theo nhạc"),
    },
  },

  theme: {
    doc: "Màu sắc & font. `colors` nhận mã hex.",
    params: {
      colorScheme: enumOf(["dark", "light"], "dark", "Hệ màu của control gốc (thanh cuộn, input)"),
      fontFamily: { type: "font", default: "", doc: "Danh sách font CSS (an toàn, không ký tự đặc biệt)" },
    },
    colorKeys: ["accent", "accent2", "bg", "panel", "panel2", "line", "text", "muted", "ok", "danger"],
  },
};

export const SECTIONS = Object.keys(MODULES);

/** Tên token màu → biến CSS. */
export const COLOR_VARS = {
  accent: "--accent",
  accent2: "--accent-2",
  bg: "--bg",
  panel: "--panel",
  panel2: "--panel-2",
  line: "--line",
  text: "--text",
  muted: "--muted",
  ok: "--ok",
  danger: "--danger",
};

/* ------------------------------------------------------------------- helpers */

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

export const isHexColor = (v) => typeof v === "string" && HEX_RE.test(v);

export function isSafeRelPath(p) {
  return (
    typeof p === "string" &&
    p.length > 0 &&
    p.length <= 120 &&
    !p.startsWith("/") &&
    !p.includes("\\") &&
    !p.includes(":") &&
    !p.includes("\0") &&
    !p.split("/").some((part) => part === ".." || part === "." || part === "")
  );
}

const extOf = (p) => (p.includes(".") ? p.split(".").pop().toLowerCase() : "");

/** Ép một giá trị về đúng kiểu của tham số. Trả `{ok, value}`. */
export function coerceParam(spec, raw) {
  switch (spec.type) {
    case "number": {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false };
      let v = Math.min(spec.max, Math.max(spec.min, n));
      if (spec.step && spec.step < 1) {
        const decimals = String(spec.step).split(".")[1]?.length ?? 2;
        v = Number(v.toFixed(decimals));
      } else v = Math.round(v);
      return { ok: true, value: v };
    }
    case "boolean":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false };
    case "enum":
      return spec.values.includes(raw) ? { ok: true, value: raw } : { ok: false };
    case "color":
      return isHexColor(raw) ? { ok: true, value: raw } : { ok: false };
    case "list": {
      const arr = typeof raw === "string" ? [raw] : raw;
      if (!Array.isArray(arr)) return { ok: false };
      const out = [...new Set(arr.filter((x) => spec.values.includes(x)))].slice(0, spec.max);
      return { ok: true, value: out };
    }
    case "colors": {
      if (!Array.isArray(raw)) return { ok: false };
      return { ok: true, value: raw.filter(isHexColor).slice(0, spec.max) };
    }
    case "font":
      return typeof raw === "string" && (raw === "" || FONT_RE.test(raw))
        ? { ok: true, value: raw }
        : { ok: false };
    default:
      return { ok: false };
  }
}

const cloneDefault = (v) => (Array.isArray(v) ? [...v] : v);

/** Giá trị mặc định đầy đủ của một section. */
export function defaultSection(name) {
  const out = {};
  for (const [key, spec] of Object.entries(MODULES[name].params))
    out[key] = cloneDefault(spec.default);
  if (name === "theme") out.colors = {};
  return out;
}

function normalizeSection(name, raw, warn) {
  const out = defaultSection(name);
  if (raw === undefined) return out;
  if (!isObject(raw)) {
    warn(`"${name}" phải là object — dùng mặc định`);
    return out;
  }
  const specs = MODULES[name].params;
  for (const [key, value] of Object.entries(raw)) {
    if (name === "theme" && key === "colors") {
      if (!isObject(value)) {
        warn('"theme.colors" phải là object');
        continue;
      }
      for (const [ck, cv] of Object.entries(value)) {
        if (!MODULES.theme.colorKeys.includes(ck))
          warn(`theme.colors.${ck}: tên màu không có (hợp lệ: ${MODULES.theme.colorKeys.join(", ")})`);
        else if (!isHexColor(cv)) warn(`theme.colors.${ck}: cần mã hex (#rgb, #rrggbb, #rrggbbaa)`);
        else out.colors[ck] = cv;
      }
      continue;
    }
    const spec = specs[key];
    if (!spec) {
      warn(`${name}.${key}: tham số không tồn tại — bỏ qua`);
      continue;
    }
    const res = coerceParam(spec, value);
    if (res.ok) out[key] = res.value;
    else warn(`${name}.${key}: giá trị ${JSON.stringify(value)} không hợp lệ — dùng mặc định`);
  }
  return out;
}

/* ------------------------------------------------------------ settings (UI tuỳ chỉnh) */

const SETTING_TYPES = ["range", "toggle", "select", "color"];

/** Tra tham số mà `bind` trỏ tới. Trả `{kind:'param'|'themeColor'|'cssVar', ...}` hoặc null. */
export function resolveBind(bind) {
  if (typeof bind !== "string") return null;
  if (bind.startsWith("css:")) {
    const name = bind.slice(4);
    return CSS_VAR_RE.test(name) ? { kind: "cssVar", name } : null;
  }
  const parts = bind.split(".");
  if (parts[0] === "theme" && parts[1] === "colors" && parts.length === 3) {
    return MODULES.theme.colorKeys.includes(parts[2])
      ? { kind: "themeColor", color: parts[2] }
      : null;
  }
  if (parts.length !== 2 || parts[0] === "theme") {
    if (parts.length === 2 && parts[0] === "theme" && MODULES.theme.params[parts[1]])
      return { kind: "param", section: "theme", key: parts[1], spec: MODULES.theme.params[parts[1]] };
    return null;
  }
  const spec = MODULES[parts[0]]?.params[parts[1]];
  return spec ? { kind: "param", section: parts[0], key: parts[1], spec } : null;
}

function normalizeSettings(raw, sections, warn) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    warn('"settings" phải là mảng');
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const [i, item] of raw.slice(0, 24).entries()) {
    const at = `settings[${i}]`;
    if (!isObject(item)) {
      warn(`${at}: phải là object`);
      continue;
    }
    if (!SETTING_KEY_RE.test(item.key ?? "")) {
      warn(`${at}: "key" cần dạng camelCase, bắt đầu bằng chữ thường (tối đa 32 ký tự)`);
      continue;
    }
    if (seen.has(item.key)) {
      warn(`${at}: key "${item.key}" bị trùng`);
      continue;
    }
    if (!SETTING_TYPES.includes(item.type)) {
      warn(`${at} (${item.key}): "type" phải là ${SETTING_TYPES.join(" | ")}`);
      continue;
    }
    const bind = resolveBind(item.bind);
    if (!bind) {
      warn(
        `${at} (${item.key}): "bind" không hợp lệ ("section.param", "theme.colors.<tên>" hoặc "css:--preset-<tên>")`,
      );
      continue;
    }
    const setting = {
      key: item.key,
      label: typeof item.label === "string" && item.label.trim() ? item.label.trim().slice(0, 60) : item.key,
      description: typeof item.description === "string" ? item.description.slice(0, 160) : "",
      type: item.type,
      bind: item.bind,
    };

    if (item.type === "range") {
      const spec = bind.kind === "param" && bind.spec.type === "number" ? bind.spec : null;
      if (bind.kind === "param" && !spec) {
        warn(`${at} (${item.key}): range chỉ bind được vào tham số số`);
        continue;
      }
      const min = Number.isFinite(item.min) ? item.min : (spec?.min ?? 0);
      const max = Number.isFinite(item.max) ? item.max : (spec?.max ?? 100);
      if (min >= max) {
        warn(`${at} (${item.key}): min phải nhỏ hơn max`);
        continue;
      }
      // khoảng cho phép không được rộng hơn khoảng của tham số
      setting.min = spec ? Math.max(min, spec.min) : min;
      setting.max = spec ? Math.min(max, spec.max) : max;
      setting.step = Number.isFinite(item.step) && item.step > 0 ? item.step : (spec?.step ?? 1);
      setting.unit = typeof item.unit === "string" ? item.unit.slice(0, 6) : "";
    } else if (item.type === "toggle") {
      if (bind.kind !== "param" || bind.spec.type !== "boolean") {
        warn(`${at} (${item.key}): toggle chỉ bind được vào tham số boolean`);
        continue;
      }
    } else if (item.type === "select") {
      if (!Array.isArray(item.options) || !item.options.length) {
        warn(`${at} (${item.key}): select cần "options"`);
        continue;
      }
      const spec = bind.kind === "param" && bind.spec.type === "enum" ? bind.spec : null;
      if (bind.kind === "param" && !spec) {
        warn(`${at} (${item.key}): select chỉ bind được vào tham số enum`);
        continue;
      }
      const options = [];
      for (const opt of item.options.slice(0, 12)) {
        const value = isObject(opt) ? opt.value : opt;
        const label = isObject(opt) && opt.label ? String(opt.label) : String(value);
        if (typeof value !== "string") continue;
        if (spec && !spec.values.includes(value)) {
          warn(`${at} (${item.key}): option "${value}" không phải giá trị hợp lệ của ${item.bind}`);
          continue;
        }
        options.push({ value, label: label.slice(0, 40) });
      }
      if (!options.length) {
        warn(`${at} (${item.key}): không có option hợp lệ`);
        continue;
      }
      setting.options = options;
    } else if (item.type === "color") {
      const ok =
        bind.kind === "themeColor" ||
        bind.kind === "cssVar" ||
        (bind.kind === "param" && bind.spec.type === "color");
      if (!ok) {
        warn(`${at} (${item.key}): color chỉ bind được vào màu (theme.colors.*, tham số color, css:--preset-*)`);
        continue;
      }
    }

    // default: lấy từ manifest nếu có, không thì từ giá trị hiện tại của tham số được bind
    let def = item.default;
    if (def === undefined) def = currentBoundValue(bind, sections);
    const coerced = coerceSetting(setting, def);
    setting.default = coerced.ok ? coerced.value : fallbackSettingValue(setting);
    if (item.default !== undefined && !coerced.ok)
      warn(`${at} (${item.key}): "default" không hợp lệ — dùng ${JSON.stringify(setting.default)}`);
    seen.add(item.key);
    out.push(setting);
  }
  return out;
}

function currentBoundValue(bind, sections) {
  if (bind.kind === "param") return sections[bind.section]?.[bind.key];
  if (bind.kind === "themeColor") return sections.theme.colors[bind.color];
  return undefined;
}

function fallbackSettingValue(setting) {
  switch (setting.type) {
    case "range":
      return setting.min;
    case "toggle":
      return false;
    case "select":
      return setting.options[0].value;
    default:
      return "#7c5cff";
  }
}

/** Ép giá trị người dùng chọn về đúng khoảng/lựa chọn mà setting cho phép. */
export function coerceSetting(setting, raw) {
  switch (setting.type) {
    case "range": {
      const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false };
      const clamped = Math.min(setting.max, Math.max(setting.min, n));
      const decimals = String(setting.step).split(".")[1]?.length ?? 0;
      return { ok: true, value: Number(clamped.toFixed(decimals)) };
    }
    case "toggle":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false };
    case "select":
      return setting.options.some((o) => o.value === raw) ? { ok: true, value: raw } : { ok: false };
    case "color":
      return isHexColor(raw) ? { ok: true, value: raw } : { ok: false };
    default:
      return { ok: false };
  }
}

/* ------------------------------------------------------------------ manifest */

/**
 * Kiểm tra & chuẩn hoá manifest. Không ném lỗi:
 *   { ok, manifest, errors[], warnings[] }
 * - `errors`: preset KHÔNG dùng được (thiếu id/name, schema quá mới…)
 * - `warnings`: preset vẫn dùng được, giá trị sai đã được thay bằng mặc định
 */
export function normalizeManifest(raw) {
  const errors = [];
  const warnings = [];
  const warn = (m) => warnings.push(m);

  if (!isObject(raw)) {
    return { ok: false, manifest: null, errors: ["preset.json phải là một object JSON"], warnings };
  }
  if (typeof raw.id !== "string" || !ID_RE.test(raw.id))
    errors.push('"id" phải gồm chữ thường, số, "-" hoặc "_" (2–48 ký tự, bắt đầu bằng chữ/số)');
  if (typeof raw.name !== "string" || !raw.name.trim()) errors.push('Thiếu "name"');
  const schema = raw.schema ?? SCHEMA_VERSION;
  if (!Number.isInteger(schema) || schema < 1) errors.push('"schema" phải là số nguyên ≥ 1');
  else if (schema > SCHEMA_VERSION)
    errors.push(`Preset dùng schema ${schema}; app này chỉ hỗ trợ tới ${SCHEMA_VERSION}. Hãy cập nhật Zimusix.`);

  const known = new Set([
    "$schema",
    "schema",
    "id",
    "name",
    "version",
    "author",
    "description",
    "tags",
    "preview",
    "style",
    "settings",
    ...SECTIONS,
  ]);
  for (const key of Object.keys(raw)) if (!known.has(key)) warn(`Trường "${key}" không được hỗ trợ — bỏ qua`);

  if (errors.length) return { ok: false, manifest: null, errors, warnings };

  const sections = {};
  for (const name of SECTIONS) sections[name] = normalizeSection(name, raw[name], warn);

  let preview = raw.preview;
  if (preview !== undefined && (!isSafeRelPath(preview) || !PREVIEW_EXTS.includes(extOf(preview)))) {
    warn(`"preview" phải là đường dẫn tương đối tới ảnh (${PREVIEW_EXTS.join(", ")}) — dùng ${DEFAULT_PREVIEW}`);
    preview = undefined;
  }
  let style = raw.style;
  if (style !== undefined && (!isSafeRelPath(style) || extOf(style) !== "css")) {
    warn('"style" phải là đường dẫn tương đối tới file .css — bỏ qua');
    style = undefined;
  }
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t) => typeof t === "string" && t.trim()).map((t) => t.trim().slice(0, 24)).slice(0, 8)
    : [];

  const manifest = {
    schema,
    id: raw.id,
    name: raw.name.trim().slice(0, 60),
    version: typeof raw.version === "string" ? raw.version.slice(0, 20) : "0.0.0",
    author: typeof raw.author === "string" ? raw.author.slice(0, 60) : "",
    description: typeof raw.description === "string" ? raw.description.slice(0, 300) : "",
    tags,
    preview: preview ?? DEFAULT_PREVIEW,
    previewDeclared: preview !== undefined,
    style: style ?? null,
    ...sections,
    settings: normalizeSettings(raw.settings, sections, warn),
  };
  return { ok: true, manifest, errors, warnings };
}

/* ------------------------------------------------------------- resolve config */

/**
 * Gộp manifest + giá trị người dùng đã chỉnh → cấu hình cuối cùng mà runtime dùng.
 * `userValues` = { [settingKey]: value }.
 */
export function resolveConfig(manifest, userValues = {}) {
  const config = {};
  for (const name of SECTIONS) {
    config[name] = structuredCloneSafe(manifest[name]);
  }
  config.cssVars = {};
  for (const setting of manifest.settings) {
    const raw = userValues[setting.key];
    const coerced = coerceSetting(setting, raw === undefined ? setting.default : raw);
    const value = coerced.ok ? coerced.value : setting.default;
    const bind = resolveBind(setting.bind);
    if (!bind) continue;
    if (bind.kind === "param") {
      const final = coerceParam(bind.spec, value);
      if (final.ok) config[bind.section][bind.key] = final.value;
    } else if (bind.kind === "themeColor") {
      config.theme.colors[bind.color] = value;
    } else if (bind.kind === "cssVar") {
      config.cssVars[bind.name] = setting.type === "range" ? `${value}${setting.unit ?? ""}` : String(value);
    }
  }
  return config;
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

/** Manifest mặc định (tương đương preset `classic`) — dự phòng khi không tải được preset nào. */
export function defaultManifest() {
  return normalizeManifest({
    schema: SCHEMA_VERSION,
    id: "classic",
    name: "Classic",
    version: "1.0.0",
    author: "Zimusix",
    description: "Giao diện gốc của Zimusix.",
  }).manifest;
}
