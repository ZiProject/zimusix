import { h } from "../lib/dom.js";
import { compile } from "../presets/expr.js";
import {
  activeEntry,
  cfg,
  clearPresetOverride,
  overridesOf,
  resetPresetSettings,
  setPresetOverride,
  setPresetSetting,
  userValuesOf,
} from "../presets/runtime.js";

/* -------------------------------------------------------------- controls */

const exprCache = new Map();
function visible(setting) {
  if (!setting.visibleIf) return true;
  let expr = exprCache.get(setting.visibleIf);
  if (!expr) exprCache.set(setting.visibleIf, (expr = compile(setting.visibleIf, { roots: ["p"] })));
  try {
    return Boolean(expr.run({ p: cfg() }));
  } catch {
    return true;
  }
}

/**
 * One control. `set(value)` receives the new value (defaults to updating the preset setting).
 * Supports every setting type: range · toggle · select · color · multiselect · palette · text.
 */
export function settingControl(setting, value, set = (v) => setPresetSetting(setting.key, v)) {
  const desc = setting.description ? h("small", { class: "muted" }, setting.description) : null;
  switch (setting.type) {
    case "range": {
      const out = h("output", null, `${value}${setting.unit ?? ""}`);
      return h(
        "label",
        { class: "bg-row" },
        h("span", { class: "bg-row-label" }, setting.label, out),
        h("input", {
          type: "range",
          min: setting.min,
          max: setting.max,
          step: setting.step,
          value,
          "aria-label": setting.label,
          oninput: (event) => {
            const v = Number(event.target.value);
            out.textContent = `${v}${setting.unit ?? ""}`;
            set(v);
          },
        }),
        desc,
      );
    }
    case "toggle":
      return h(
        "label",
        { class: "bg-check" },
        h("input", { type: "checkbox", checked: Boolean(value), onchange: (event) => set(event.target.checked) }),
        h("span", null, setting.label),
        desc,
      );
    case "select":
      return h(
        "label",
        { class: "bg-row" },
        h("span", { class: "bg-row-label" }, setting.label),
        h(
          "select",
          { class: "preset-select", onchange: (event) => set(event.target.value) },
          setting.options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.label)),
        ),
        desc,
      );
    case "multiselect": {
      const chosen = new Set(Array.isArray(value) ? value : []);
      return h(
        "div",
        { class: "bg-row" },
        h("span", { class: "bg-row-label" }, setting.label),
        h(
          "div",
          { class: "preset-multi" },
          setting.options.map((o) =>
            h(
              "label",
              { class: "bg-check" },
              h("input", {
                type: "checkbox",
                checked: chosen.has(o.value),
                onchange: (event) => {
                  if (event.target.checked) chosen.add(o.value);
                  else chosen.delete(o.value);
                  set(setting.options.map((x) => x.value).filter((v) => chosen.has(v)));
                },
              }),
              h("span", null, o.label),
            ),
          ),
        ),
        desc,
      );
    }
    case "palette": {
      const colors = Array.isArray(value) ? [...value] : [];
      const inputs = [];
      const push = () => set(inputs.map((i) => i.value).slice(0, setting.count));
      for (let i = 0; i < setting.count; i++)
        inputs.push(
          h("input", {
            type: "color",
            value: String(colors[i] ?? "#7c5cff").slice(0, 7),
            "aria-label": `${setting.label} ${i + 1}`,
            oninput: push,
          }),
        );
      return h(
        "div",
        { class: "bg-row preset-color-row" },
        h("span", { class: "bg-row-label" }, setting.label),
        h("div", { class: "preset-palette" }, ...inputs, h("button", { class: "small", type: "button", onclick: () => set([]) }, "Auto")),
        desc,
      );
    }
    case "text":
      return h(
        "label",
        { class: "bg-row" },
        h("span", { class: "bg-row-label" }, setting.label),
        h("input", {
          type: "text",
          class: "preset-select",
          value: value ?? "",
          maxlength: setting.maxLen,
          onchange: (event) => set(event.target.value),
        }),
        desc,
      );
    default:
      // color
      return h(
        "label",
        { class: "bg-row preset-color-row" },
        h("span", { class: "bg-row-label" }, setting.label),
        h("input", { type: "color", value: String(value).slice(0, 7), oninput: (event) => set(event.target.value) }),
        desc,
      );
  }
}

/* ------------------------------------------------------------ the sections */

/** Grouped author-exposed settings. Re-evaluates `visibleIf` after every change. */
function authorSettings(entry) {
  const settings = entry.manifest.settings;
  if (!settings.length) return null;
  const values = userValuesOf(entry.key);
  const nodes = [];
  const rows = [];
  const refresh = () => rows.forEach(({ el, setting }) => (el.hidden = !visible(setting)));
  let group = null;
  let container = h("div", { class: "preset-settings-grid" });
  const flush = () => {
    if (container.childElementCount) nodes.push(group ? h("fieldset", { class: "preset-group" }, h("legend", null, group), container) : container);
  };
  for (const setting of settings) {
    if (setting.group !== (group ?? "")) {
      flush();
      group = setting.group || null;
      container = h("div", { class: "preset-settings-grid" });
    }
    const el = h(
      "div",
      { class: "preset-setting" },
      settingControl(setting, values[setting.key] ?? setting.default, (v) => {
        setPresetSetting(setting.key, v);
        refresh();
      }),
    );
    rows.push({ el, setting });
    container.append(el);
  }
  flush();
  refresh();
  return nodes;
}

/** Control description for any schema parameter (so the editor needs no hand-written UI per module). */
function pseudoSetting(path, spec) {
  const base = { key: path, label: path.split(".")[1], description: spec.doc ?? "", bind: path };
  switch (spec.type) {
    case "number":
      return { ...base, type: "range", min: spec.min, max: spec.max, step: spec.step, unit: spec.emit?.unit ?? "" };
    case "boolean":
      return { ...base, type: "toggle" };
    case "enum":
      return { ...base, type: "select", options: spec.values.map((v) => ({ value: v, label: v })) };
    case "color":
      return { ...base, type: "color" };
    case "list":
      return { ...base, type: "multiselect", options: spec.values.map((v) => ({ value: v, label: v })), max: spec.max };
    case "colors":
      return { ...base, type: "palette", count: spec.max, max: spec.max };
    default:
      return { ...base, type: "text", maxLen: spec.maxLen ?? 120 };
  }
}

/**
 * Advanced editor generated from the preset's own schema: EVERY parameter of EVERY module, including ones the
 * author did not expose. Values are stored as overrides (highest priority) and can be cleared one by one.
 */
function advancedEditor(entry, onReset) {
  const { modules } = entry.manifest;
  const config = cfg();
  const overrides = overridesOf(entry.key);
  const body = h("div", { class: "preset-advanced" });
  for (const [sname, section] of Object.entries(modules.sections)) {
    const grid = h("div", { class: "preset-settings-grid" });
    for (const [key, spec] of Object.entries(section.params)) {
      const path = `${sname}.${key}`;
      if (spec.type === "colormap") {
        for (const token of Object.keys(spec.keys)) {
          const p = `${path}.${token}`;
          grid.append(overrideRow(p, { key: p, label: `${key}.${token}`, type: "color", description: "" }, config[sname]?.[key]?.[token] ?? "#7c5cff", p in overrides, onReset));
        }
        continue;
      }
      if (spec.type === "asset") continue; // files are chosen by the preset author
      grid.append(overrideRow(path, pseudoSetting(path, spec), config[sname]?.[key] ?? spec.default, path in overrides, onReset));
    }
    body.append(h("details", { class: "preset-adv-section" }, h("summary", null, h("b", null, sname), section.doc ? h("small", { class: "muted" }, ` — ${section.doc}`) : null), grid));
  }
  return h("details", { class: "preset-advanced-wrap" }, h("summary", null, "Advanced — every parameter of this preset's schema"), body);
}

function overrideRow(path, setting, value, overridden, onReset) {
  return h(
    "div",
    { class: `preset-setting ${overridden ? "overridden" : ""}` },
    settingControl(setting, value, (v) => setPresetOverride(path, v)),
    overridden
      ? h("button", { class: "small", type: "button", title: "Back to the preset's value", onclick: () => { clearPresetOverride(path); onReset?.(); } }, "↺ reset")
      : null,
  );
}

/** Everything customizable for the active preset (author settings + advanced editor + reset). */
export function customizeBody(onReset) {
  const entry = activeEntry();
  if (!entry?.manifest) return null;
  const nodes = authorSettings(entry) ?? [];
  const body = [...nodes];
  body.push(advancedEditor(entry, onReset));
  body.push(
    h(
      "button",
      {
        class: "small",
        onclick: () => {
          resetPresetSettings();
          onReset?.();
        },
      },
      "Reset preset to defaults",
    ),
  );
  return body;
}

/**
 * Compact section for the Background panel: author settings only (+ reset). The full editor lives in Themes.
 * Returns null when the preset exposes none. `onReset` runs after "Reset" so the host can re-render.
 */
export function presetSettingsSection(onReset) {
  const entry = activeEntry();
  if (!entry?.manifest?.settings.length) return null;
  const values = userValuesOf(entry.key);
  return h(
    "div",
    { class: "bg-section" },
    h("b", null, `${entry.manifest.name} settings`),
    ...entry.manifest.settings.filter((s) => visible(s)).map((s) => settingControl(s, values[s.key] ?? s.default)),
    h(
      "button",
      {
        class: "small",
        onclick: () => {
          resetPresetSettings();
          onReset?.();
        },
      },
      "Reset preset settings",
    ),
  );
}
