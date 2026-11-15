import { SOURCE_LABEL } from "../lib/constants.js";
import { fmtTime, h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { cfg } from "../presets/runtime.js";
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

/**
 * Track card (grid item): square cover, duration/source overlay, 2-line title, artist.
 *   primary  — main action when clicking the cover (usually "play")
 *   actions  — extra icon buttons shown over the cover on hover/focus
 *   index    — optional position badge (queue)
 */
export function trackCard(track, { primary, actions = [], index } = {}) {
  const meta = track.isLive ? "LIVE" : track.duration ? fmtTime(track.duration) : "";
  const art = h(
    "div",
    {
      class: "track-art",
      role: primary ? "button" : null,
      tabindex: primary ? "0" : null,
      "aria-label": primary ? `Play ${track.title}` : null,
      onclick: primary ? () => primary() : null,
      onkeydown: primary
        ? (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              primary();
            }
          }
        : null,
    },
    track.thumbnail
      ? h("img", { src: track.thumbnail, alt: "", loading: "lazy", draggable: false })
      : icon("music", 36),
    index != null ? h("span", { class: "track-index" }, index) : null,
    primary ? h("span", { class: "track-play" }, icon("play", 22)) : null,
    actions.length
      ? h("div", { class: "track-actions", onclick: (event) => event.stopPropagation() }, actions)
      : null,
    h("div", { class: "track-meta" }, badge(track.source), h("span", { class: "track-time" }, meta)),
  );
  return h(
    "article",
    { class: "track-card" },
    art,
    h("div", { class: "track-title", title: track.title }, track.title),
    track.author ? h("div", { class: "track-author", title: track.author }, track.author) : null,
  );
}

/**
 * Subtitle parts for track info based on preset `info.show` (artist · source · duration).
 * Returns array of DOM nodes to insert into .np-sub / .stage-sub.
 */
export function trackSubParts(track) {
  const show = cfg().info.show;
  const parts = [];
  if (show.includes("source")) parts.push(badge(track.source));
  if (show.includes("artist") && track.author)
    parts.push(show.includes("source") ? ` ${track.author}` : track.author);
  if (show.includes("duration")) {
    const text = track.isLive ? "LIVE" : track.duration ? fmtTime(track.duration) : "";
    if (text) parts.push(parts.length ? ` · ${text}` : text);
  }
  return parts;
}

export { setMarqueeText } from "../lib/marquee.js";

export const iconButton = (name, title, onclick, extra = "") =>
  h(
    "button",
    { class: `icon-btn ${extra}`, title, "aria-label": title, onclick },
    icon(name, 18),
  );

export function targetLabel() {
  if (app.target === "local") return "This device (in-app)";
  const guild = app.guilds.find((g) => g.id === app.target);
  return `Discord · ${guild?.name ?? app.target}`;
}
