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
    h("h2", null, "Local Files"),
    h(
      "p",
      { class: "muted" },
      "Select local music files or folders (mp3, flac, wav, ogg, m4a, aac, opus…). You can also drag and drop directly into the window.",
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
        "Add to queue",
      ),
      h(
        "button",
        {
          class: app.addMode === "now" ? "active" : "",
          onclick: () => ((app.addMode = "now"), renderMain()),
        },
        "Play now",
      ),
    ),
    h(
      "div",
      { class: "drop-zone" },
      icon("folder", 36),
      h("div", null, "Drag & drop files / folders here"),
      h(
        "div",
        { class: "button-row" },
        h("button", { class: "primary", onclick: pickFiles }, "Choose files…"),
        h("button", { onclick: pickFolder }, "Choose folder…"),
      ),
    ),
    h("p", { class: "muted small" }, `Playing to: ${targetLabel()}`),
  );
}
