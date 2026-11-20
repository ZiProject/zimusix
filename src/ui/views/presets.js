import { importPresetFolder, pickPresetFolder, refreshPresets, removeUserPreset, usePreset } from "../../features/presets.js";
import * as api from "../../api.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { renderMain } from "../main-view.js";
import { customizeBody } from "../preset-settings.js";
import {
  activeEntry,
  activeKey,
  listEntries,
  presetsDir,
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

/** Summary chips of the preset (values come from whatever sections ITS schema defines). */
function moduleChips(entry) {
  const sec = entry.manifest.sections;
  const pick = (label, section, key) => (sec[section]?.[key] !== undefined ? `${label}: ${sec[section][key]}` : null);
  const chips = [
    pick("layout", "layout", "shell"),
    pick("artwork", "artwork", "style"),
    pick("bg", "background", "effect"),
    pick("viz", "visualizer", "type"),
    pick("lyrics", "lyrics", "mode"),
  ].filter(Boolean);
  const core = new Set(["layout", "controls", "artwork", "info", "background", "visualizer", "lyrics", "theme"]);
  const custom = Object.keys(sec).filter((name) => !core.has(name));
  if (custom.length) chips.push(`+ ${custom.join(", ")}`);
  const l = entry.logic;
  if (l && (l.signals.length || l.binds.length || l.rules.length)) chips.push("⚡ hooks");
  const d = entry.draw;
  if (d && (Object.keys(d.visualizers).length || Object.keys(d.backgrounds).length)) chips.push("✦ draw");
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
      moduleChips(entry),
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

function settingsPanel() {
  const entry = activeEntry();
  const head = h("h3", null, `Customize: ${entry?.manifest?.name ?? "Classic"}`);
  const body = customizeBody(() => renderMain());
  if (!body) return h("section", { class: "preset-settings" }, head, h("p", { class: "muted" }, "No preset is active."));
  return h(
    "section",
    { class: "preset-settings" },
    head,
    h("p", { class: "muted small" }, "Parameters exposed by the preset author, plus an advanced editor for every parameter in its schema. Changes apply immediately and are saved per preset."),
    ...body,
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
