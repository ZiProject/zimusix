import { pickFiles, pickFolder } from "../../features/files.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { renderMain } from "../main-view.js";
import { targetLabel } from "../shared.js";

export function viewLibrary() {
  return h(
    "section",
    { class: "view" },
    h("h2", null, "File local"),
    h(
      "p",
      { class: "muted" },
      "Chọn file hoặc thư mục nhạc trên máy (mp3, flac, wav, ogg, m4a, aac, opus…). Có thể kéo thả trực tiếp vào cửa sổ.",
    ),
    h(
      "div",
      { class: "segmented" },
      h(
        "button",
        {
          class: app.addMode === "end" ? "active" : "",
          onclick: () => ((app.addMode = "end"), renderMain()),
        },
        "Thêm vào hàng đợi",
      ),
      h(
        "button",
        {
          class: app.addMode === "now" ? "active" : "",
          onclick: () => ((app.addMode = "now"), renderMain()),
        },
        "Phát ngay",
      ),
    ),
    h(
      "div",
      { class: "drop-zone" },
      icon("folder", 36),
      h("div", null, "Kéo thả file / thư mục vào đây"),
      h(
        "div",
        { class: "button-row" },
        h("button", { class: "primary", onclick: pickFiles }, "Chọn file…"),
        h("button", { onclick: pickFolder }, "Chọn thư mục…"),
      ),
    ),
    h("p", { class: "muted small" }, `Đang phát tới: ${targetLabel()}`),
  );
}
