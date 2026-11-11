import { SOURCE_LABEL } from "../lib/constants.js";
import { fmtTime, h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app } from "../state.js";

export function trackCover(track, size = 44) {
  const box = h("div", {
    class: "cover",
    style: { width: `${size}px`, height: `${size}px` },
  });
  if (track?.thumbnail)
    box.append(
      h("img", {
        src: track.thumbnail,
        alt: "",
        loading: "lazy",
        draggable: false,
      }),
    );
  else box.append(icon("music", Math.round(size * 0.5)));
  return box;
}

export function badge(source) {
  return h(
    "span",
    { class: `badge ${source ?? ""}` },
    SOURCE_LABEL[source] ?? source ?? "?",
  );
}

export function trackRow(track, { actions }) {
  return h(
    "div",
    { class: "row" },
    trackCover(track),
    h(
      "div",
      { class: "row-main" },
      h("div", { class: "row-title", title: track.title }, track.title),
      h(
        "div",
        { class: "row-sub" },
        badge(track.source),
        track.author ? ` ${track.author}` : "",
        track.isLive
          ? " · LIVE"
          : track.duration
            ? ` · ${fmtTime(track.duration)}`
            : "",
      ),
    ),
    h("div", { class: "row-actions" }, actions),
  );
}

export const iconButton = (name, title, onclick, extra = "") =>
  h(
    "button",
    { class: `icon-btn ${extra}`, title, "aria-label": title, onclick },
    icon(name, 18),
  );

export function targetLabel() {
  if (app.target === "local") return "Máy này (trong app)";
  const guild = app.guilds.find((g) => g.id === app.target);
  return `Discord · ${guild?.name ?? app.target}`;
}
