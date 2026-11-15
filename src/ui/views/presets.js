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

/** Ảnh preview; thiếu file thì hiện khung màu thay thế (chữ cái đầu của preset). */
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

/** Vài thẻ tóm tắt module nào đang được preset dùng. */
function moduleChips(manifest) {
  const chips = [
    `bố cục: ${manifest.layout.shell}`,
    `ảnh: ${manifest.artwork.style}`,
    `nền: ${manifest.background.effect}`,
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
        h("p", { class: "error-text small" }, "Preset không dùng được:"),
        h("ul", { class: "preset-errors" }, entry.errors.map((e) => h("li", null, e))),
        entry.source === "user"
          ? h("div", { class: "preset-actions" }, h("button", { class: "danger small", onclick: () => removeUserPreset(entry) }, icon("trash", 14), " Xoá"))
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
        entry.source === "user" ? h("span", { class: "badge attachments" }, "Của bạn") : null,
      ),
      m.author ? h("p", { class: "muted small" }, `Tác giả: ${m.author}`) : null,
      m.description ? h("p", { class: "preset-desc" }, m.description) : null,
      moduleChips(m),
      notes.length
        ? h(
            "details",
            { class: "preset-warnings" },
            h("summary", null, `${notes.length} cảnh báo`),
            h("ul", null, notes.map((n) => h("li", null, n))),
          )
        : null,
      h(
        "div",
        { class: "preset-actions" },
        active
          ? h("button", { class: "primary small", disabled: true }, icon("check", 14), " Đang dùng")
          : h("button", { class: "primary small", onclick: () => usePreset(entry) }, "Dùng preset này"),
        entry.source === "user"
          ? h("button", { class: "danger small", title: "Xoá preset khỏi máy", onclick: () => removeUserPreset(entry) }, icon("trash", 14))
          : null,
      ),
    ),
  );
}

/** Một ô tuỳ chỉnh (do preset khai báo trong `settings`). */
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
  const head = h("h3", null, `Tuỳ chỉnh: ${entry?.manifest?.name ?? "Classic"}`);
  if (!settings.length)
    return h("section", { class: "preset-settings" }, head, h("p", { class: "muted" }, "Preset này không có thông số nào để tuỳ chỉnh."));
  const values = userValuesOf(entry.key);
  return h(
    "section",
    { class: "preset-settings" },
    head,
    h("p", { class: "muted small" }, "Chỉ các thông số do tác giả preset cho phép. Thay đổi áp dụng ngay và được nhớ theo từng preset."),
    h("div", { class: "preset-settings-grid" }, settings.map((s) => settingControl(s, values[s.key] ?? s.default))),
    h("button", { class: "small", onclick: () => { resetPresetSettings(); renderMain(); } }, "Đặt lại mặc định của preset"),
  );
}

export function viewPresets() {
  const dir = presetsDir();
  const pathInput = h("input", { type: "text", placeholder: "Dán đường dẫn thư mục preset (khi chạy ngoài Tauri)…" });
  return h(
    "section",
    { class: "view presets-view" },
    h(
      "div",
      { class: "view-head" },
      h(
        "div",
        null,
        h("h2", null, "Giao diện (Preset)"),
        h("p", { class: "muted" }, "Preset quyết định bố cục, ảnh bìa, thông tin bài hát, nền, visualizer, lyrics và cách bố trí giao diện."),
      ),
      h(
        "div",
        { class: "button-row" },
        h("button", { class: "primary", onclick: () => pickPresetFolder() }, icon("folder", 16), " Thêm thư mục preset"),
        h("button", { title: "Quét lại", "aria-label": "Quét lại danh sách preset", onclick: () => refreshPresets() }, icon("refresh", 16)),
      ),
    ),
    api.isTauri()
      ? null
      : h(
          "div",
          { class: "form-row" },
          pathInput,
          h("button", { onclick: () => pathInput.value.trim() && importPresetFolder(pathInput.value.trim()) }, "Thêm"),
        ),
    h("div", { class: "preset-grid" }, listEntries().map((entry) => presetCard(entry, entry.key === activeKey()))),
    settingsPanel(),
    h(
      "p",
      { class: "help small" },
      "Chọn một thư mục có ",
      h("code", null, "preset.json"),
      " (hoặc thư mục chứa nhiều thư mục preset). Preset được sao chép vào ",
      h("code", null, dir || "thư mục dữ liệu của app"),
      ". Cách tạo preset: xem ",
      h("code", null, "docs/PRESETS.md"),
      ".",
    ),
  );
}
