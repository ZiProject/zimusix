import { resetBgSettings, setBgSetting } from "../features/background.js";
import { h } from "../lib/dom.js";
import { app } from "../state.js";

export function renderBgPanel() {
  const slider = (label, key, min, max, unit) => {
    const out = h("output", null, `${app.bg[key]}${unit}`);
    return h(
      "label",
      { class: "bg-row" },
      h("span", { class: "bg-row-label" }, label, out),
      h("input", {
        type: "range",
        min,
        max,
        value: app.bg[key],
        "aria-label": label,
        oninput: (event) => {
          const value = Number(event.target.value);
          out.textContent = `${value}${unit}`;
          setBgSetting(key, value);
        },
      }),
    );
  };
  const toggle = (label, key) =>
    h(
      "label",
      { class: "bg-check" },
      h("input", {
        type: "checkbox",
        checked: app.bg[key],
        onchange: (event) => setBgSetting(key, event.target.checked),
      }),
      h("span", null, label),
    );
  return h(
    "div",
    { class: "bg-panel", onclick: (event) => event.stopPropagation() },
    h("b", null, "Background"),
    slider("Blur", "blur", 0, 30, "px"),
    slider("Opacity", "opacity", 0, 100, "%"),
    slider("Overlay Dimming", "dim", 0, 90, "%"),
    toggle("Bass bounce / reactive", "react"),
    toggle("Cover art fallback when no video", "art"),
    h(
      "button",
      { class: "small", onclick: () => resetBgSettings() },
      "Reset to defaults",
    ),
  );
}
