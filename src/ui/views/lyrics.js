import { seekVideoIfBuffered } from "../../features/background.js";
import { loadLyrics } from "../../features/lyrics.js";
import { control } from "../../features/playback.js";
import { fmtTime, h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";

/** Synchronized lyric lines list (used in both Lyrics tab and Now Playing stage). */
function lyricsList(lyr) {
  return h(
    "div",
    { class: "lyrics-list" },
    lyr.lines.map((line) =>
      h(
        "div",
        {
          class: "lyric-line",
          "data-time": line.timeMs,
          onclick: () => {
            control("seek", { positionMs: line.timeMs });
            seekVideoIfBuffered(
              document.getElementById("bg-video"),
              line.timeMs / 1000,
            );
          },
          title: "Click to jump to this lyric line",
        },
        h("span", { class: "line-time" }, fmtTime(line.timeMs)),
        h("span", { class: "line-text" }, line.text),
      ),
    ),
  );
}

/**
 * Lyrics body (empty / loading / error / synced / plain).
 * `embedded` = embedded in Now Playing stage: omit header, compact mascot.
 */
export function lyricsBody({ embedded = false } = {}) {
  const track = app.state?.currentTrack;
  if (!track)
    return mascotState("idle", "No track playing. Select a track to view synchronized lyrics.");
  if (app.lyricsLoading)
    return mascotState("loading", "Searching for synced lyrics from LRCLIB...");
  const lyr = app.lyrics;
  if (!lyr || lyr.error)
    return mascotState("noResult", lyr?.error || "No lyrics found for this track.", {
      action: embedded
        ? h("button", { class: "small", onclick: () => loadLyrics(true) }, icon("refresh", 14), " Retry")
        : null,
    });
  if (lyr.lines?.length) return lyricsList(lyr);
  return h("div", { class: "plain-lyrics" }, lyr.text || "No lyrics available.");
}

export function viewLyrics() {
  const track = app.state?.currentTrack;
  if (!track) {
    return h(
      "section",
      { class: "view lyrics-view" },
      h("h2", null, "Lyrics"),
      lyricsBody(),
    );
  }

  const lyr = app.lyrics;
  const synced = !app.lyricsLoading && lyr && !lyr.error && lyr.lines?.length > 0;
  const failed = !app.lyricsLoading && (!lyr || lyr.error);

  const title = app.lyricsLoading
    ? "Lyrics (Sync)"
    : failed
      ? "Lyrics"
      : synced
        ? "Lyrics (Synced)"
        : "Lyrics";
  const subtitle = synced
    ? `${lyr.trackName || track.title} · ${lyr.artistName || track.author || ""}`
    : `${track.title} · ${track.author || ""}`;

  let actions = null;
  if (failed)
    actions = h(
      "button",
      { onclick: () => loadLyrics(true) },
      icon("refresh", 16),
      " Retry",
    );
  else if (synced)
    actions = h(
      "div",
      { class: "button-row" },
      h("span", { class: "badge lrclib" }, "Sync LRC"),
      h(
        "button",
        { onclick: () => loadLyrics(true), title: "Reload lyrics" },
        icon("refresh", 16),
      ),
    );

  return h(
    "section",
    { class: "view lyrics-view" },
    h(
      "div",
      { class: "view-head" },
      h("div", null, h("h2", null, title), h("p", { class: "muted" }, subtitle)),
      actions,
    ),
    lyricsBody(),
  );
}
