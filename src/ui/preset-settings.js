import { h } from "../lib/dom.js";
import { activeEntry, resetPresetSettings, setPresetSetting, userValuesOf } from "../presets/runtime.js";

/** Single setting control (declared by preset in `settings`). */
export function settingControl(setting, value) {
  if (setting.type === "range") {
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
          setPresetSetting(setting.key, v);
        },
      }),
      setting.description ? h("small", { class: "muted" }, setting.description) : null,
    );
  }
  if (setting.type === "toggle") {
    return h(
      "label",
      { class: "bg-check" },
      h("input", {
        type: "checkbox",
        checked: Boolean(value),
        onchange: (event) => setPresetSetting(setting.key, event.target.checked),
      }),
      h("span", null, setting.label),
    );
  }
  if (setting.type === "select") {
    return h(
      "label",
      { class: "bg-row" },
      h("span", { class: "bg-row-label" }, setting.label),
      h(
        "select",
        { class: "preset-select", onchange: (event) => setPresetSetting(setting.key, event.target.value) },
        setting.options.map((o) => h("option", { value: o.value, selected: o.value === value }, o.label)),
      ),
    );
  }
  // color
  return h(
    "label",
    { class: "bg-row preset-color-row" },
    h("span", { class: "bg-row-label" }, setting.label),
    h("input", {
      type: "color",
      value: String(value).slice(0, 7),
      oninput: (event) => setPresetSetting(setting.key, event.target.value),
    }),
  );
}

/**
 * All customizable settings of the active preset as a ready-made section (used by the Background panel).
 * Returns null when the preset exposes none. `onReset` runs after "Reset" so the host can re-render.
 */
export function presetSettingsSection(onReset) {
  const entry = activeEntry();
  const settings = entry?.manifest?.settings ?? [];
  if (!settings.length) return null;
  const values = userValuesOf(entry.key);
  return h(
    "div",
    { class: "bg-section" },
    h("b", null, `${entry.manifest.name} settings`),
    ...settings.map((s) => settingControl(s, values[s.key] ?? s.default)),
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
