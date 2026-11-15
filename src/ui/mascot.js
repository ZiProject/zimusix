import { h } from "../lib/dom.js";

/** Mascot states (images in public/mascot/). */
export const MASCOT = {
  loading: "/mascot/loading.png", // loading / searching
  empty: "/mascot/empty.png", // no tracks (empty queue...)
  idle: "/mascot/sleepy.png", // idle waiting for track selection
  noResult: "/mascot/noresult.png", // no results / no lyrics
  error: "/mascot/error.png", // fatal error, retry
  success: "/mascot/success.png", // success
  curious: "/mascot/curious.png", // informational
  confused: "/mascot/confused.png", // mild error
  angry: "/mascot/angry.png", // playback error
};

export function mascotImg(mood, className = "mascot") {
  return h("img", {
    class: `${className} mascot-${mood}`,
    src: MASCOT[mood] ?? MASCOT.idle,
    alt: "",
    draggable: false,
  });
}

/**
 * Empty/status state with mascot: image + optional title + message + optional action.
 * `action` is a pre-rendered button element via h("button", ...).
 */
export function mascotState(mood, text, { title, action } = {}) {
  return h(
    "div",
    { class: `empty mascot-state mood-${mood}` },
    mascotImg(mood, "mascot-art"),
    title ? h("div", { class: "mascot-title" }, title) : null,
    h("div", { class: "mascot-text" }, text),
    action ?? null,
  );
}
