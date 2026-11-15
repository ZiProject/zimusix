import { importPresetFolder, pickPresetFolder, refreshPresets, removeUserPreset, usePreset } from "../../features/presets.js";
import * as api from "../../api.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { renderMain } from "../main-view.js";
import {
  activeEntry,
  activeKey,
  listEntries,
  presetsDir,
  resetPresetSettings,
  setPresetSetting,
  userValuesOf,
} from "../../presets/runtime.js";

/** Preview image; if missing, displays fallback colored box with preset initial. */
function previewBox(entry) {
  const box = h("div", { class: "preset-preview" });
  const fallback = h("div", { class: "preset-preview-fallback" }, (entry.manifest?.name ?? entry.id).slice(0, 1).toUpperCase());
  box.append(fallback);
  if (entry.previewUrl) {
    const img = h("img", { src: entry.previewUrl, alt: "", draggable: false, loading: "lazy" });
    img.addEventListener("load", () => fallback.remove());
    img.addEventListener("error", () => img.remove());
    box.append(img);
  }
  return box;
}

/** Summary chips of active modules in preset. */
function moduleChips(manifest) {
  const chips = [
    `layout: ${manifest.layout.shell}`,
    `artwork: ${manifest.artwork.style}`,
    `bg: ${manifest.background.effect}`,
    `viz: ${manifest.visualizer.type}`,
    `lyrics: ${manifest.lyrics.mode}`,
  ];
  return h("div", { class: "preset-chips" }, chips.map((text) => h("span", { class: "preset-chip" }, text)));
}

function presetCard(entry, active) {
  const m = entry.manifest;
  if (!entry.valid) {
    return h(
      "article",
      { class: "preset-card invalid" },
      previewBox(entry),
      h(
        "div",
        { class: "preset-body" },
        h("h3", null, entry.id),
        h("p", { class: "error-text small" }, "Preset unusable:"),
        h("ul", { class: "preset-errors" }, entry.errors.map((e) => h("li", null, e))),
        entry.source === "user"
          ? h("div", { class: "preset-actions" }, h("button", { class: "danger small", onclick: () => removeUserPreset(entry) }, icon("trash", 14), " Delete"))
          : null,
      ),
    );
  }
  const notes = [...entry.warnings];
  return h(
    "article",
    { class: `preset-card ${active ? "active" : ""}` },
    previewBox(entry),
    h(
      "div",
      { class: "preset-body" },
      h(
        "h3",
        null,
        m.name,
        h("span", { class: "preset-ver" }, ` v${m.version}`),
        entry.source === "user" ? h("span", { class: "badge attachments" }, "Custom") : null,
      ),
      m.author ? h("p", { class: "muted small" }, `Author: ${m.author}`) : null,
      m.description ? h("p", { class: "preset-desc" }, m.description) : null,
      moduleChips(m),
      notes.length
        ? h(
            "details",
            { class: "preset-warnings" },
            h("summary", null, `${notes.length} warning(s)`),
            h("ul", null, notes.map((n) => h("li", null, n))),
          )
        : null,
      h(
        "div",
        { class: "preset-actions" },
        active
          ? h("button", { class: "primary small", disabled: true }, icon("check", 14), " Active")
          : h("button", { class: "primary small", onclick: () => usePreset(entry) }, "Use this preset"),
        entry.source === "user"
          ? h("button", { class: "danger small", title: "Delete preset from device", onclick: () => removeUserPreset(entry) }, icon("trash", 14))
          : null,
      ),
    ),
  );
}

/** Single setting control (declared by preset in `settings`). */
function settingControl(setting, value) {
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

function settingsPanel() {
  const entry = activeEntry();
  const settings = entry?.manifest?.settings ?? [];
  const head = h("h3", null, `Customize: ${entry?.manifest?.name ?? "Classic"}`);
  if (!settings.length)
    return h("section", { class: "preset-settings" }, head, h("p", { class: "muted" }, "This preset has no configurable settings."));
  const values = userValuesOf(entry.key);
  return h(
    "section",
    { class: "preset-settings" },
    head,
    h("p", { class: "muted small" }, "Configurable parameters exposed by preset author. Changes apply immediately and are saved per preset."),
    h("div", { class: "preset-settings-grid" }, settings.map((s) => settingControl(s, values[s.key] ?? s.default))),
    h("button", { class: "small", onclick: () => { resetPresetSettings(); renderMain(); } }, "Reset preset to defaults"),
  );
}

export function viewPresets() {
  const dir = presetsDir();
  const pathInput = h("input", { type: "text", placeholder: "Paste preset folder path (when running outside Tauri)…" });
  return h(
    "section",
    { class: "view presets-view" },
    h(
      "div",
      { class: "view-head" },
      h(
        "div",
        null,
        h("h2", null, "Themes (Presets)"),
        h("p", { class: "muted" }, "Presets control layout, cover art, track info, background effects, visualizers, lyrics, and controls."),
      ),
      h(
        "div",
        { class: "button-row" },
        h("button", { class: "primary", onclick: () => pickPresetFolder() }, icon("folder", 16), " Add preset folder"),
        h("button", { title: "Refresh presets", "aria-label": "Refresh presets list", onclick: () => refreshPresets() }, icon("refresh", 16)),
      ),
    ),
    api.isTauri()
      ? null
      : h(
          "div",
          { class: "form-row" },
          pathInput,
          h("button", { onclick: () => pathInput.value.trim() && importPresetFolder(pathInput.value.trim()) }, "Add"),
        ),
    h("div", { class: "preset-grid" }, listEntries().map((entry) => presetCard(entry, entry.key === activeKey()))),
    settingsPanel(),
    h(
      "p",
      { class: "help small" },
      "Select a folder containing ",
      h("code", null, "preset.json"),
      " (or a folder containing multiple preset subfolders). Presets are copied into ",
      h("code", null, dir || "app data directory"),
      ". To create presets, see ",
      h("code", null, "docs/PRESETS.md"),
      ".",
    ),
  );
}
