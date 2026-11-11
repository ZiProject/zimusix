import { seekVideoIfBuffered } from "../../features/background.js";
import { loadLyrics } from "../../features/lyrics.js";
import { control } from "../../features/playback.js";
import { fmtTime, h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";

export function viewLyrics() {
  const track = app.state?.currentTrack;
  if (!track) {
    return h(
      "section",
      { class: "view lyrics-view" },
      h("h2", null, "Lời bài hát (Lyrics)"),
      mascotState(
        "idle",
        "Chưa phát bài nào. Hãy chọn bài để xem lời đồng bộ.",
      ),
    );
  }

  if (app.lyricsLoading) {
    return h(
      "section",
      { class: "view lyrics-view" },
      h(
        "div",
        { class: "view-head" },
        h(
          "div",
          null,
          h("h2", null, "Lời bài hát (Sync)"),
          h("p", { class: "muted" }, `${track.title} · ${track.author || ""}`),
        ),
      ),
      mascotState("loading", "Đang tìm kiếm lời bài hát đồng bộ từ LRCLIB..."),
    );
  }

  const lyr = app.lyrics;
  if (!lyr || lyr.error) {
    return h(
      "section",
      { class: "view lyrics-view" },
      h(
        "div",
        { class: "view-head" },
        h(
          "div",
          null,
          h("h2", null, "Lời bài hát"),
          h("p", { class: "muted" }, `${track.title} · ${track.author || ""}`),
        ),
        h(
          "button",
          { onclick: () => loadLyrics(true) },
          icon("refresh", 16),
          " Thử lại",
        ),
      ),
      mascotState(
        "noResult",
        lyr?.error || "Không tìm thấy lời bài hát cho bài này.",
      ),
    );
  }

  if (lyr.lines && lyr.lines.length > 0) {
    return h(
      "section",
      { class: "view lyrics-view" },
      h(
        "div",
        { class: "view-head" },
        h(
          "div",
          null,
          h("h2", null, "Lời bài hát (Đồng bộ theo nhạc)"),
          h(
            "p",
            { class: "muted" },
            `${lyr.trackName || track.title} · ${lyr.artistName || track.author || ""}`,
          ),
        ),
        h(
          "div",
          { class: "button-row" },
          h("span", { class: "badge lrclib" }, "Sync LRC"),
          h(
            "button",
            { onclick: () => loadLyrics(true), title: "Tải lại lời bài hát" },
            icon("refresh", 16),
          ),
        ),
      ),
      h(
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
              title: "Bấm để nhảy tới đoạn này",
            },
            h("span", { class: "line-time" }, fmtTime(line.timeMs)),
            h("span", { class: "line-text" }, line.text),
          ),
        ),
      ),
    );
  }

  return h(
    "section",
    { class: "view lyrics-view" },
    h(
      "div",
      { class: "view-head" },
      h(
        "div",
        null,
        h("h2", null, "Lời bài hát"),
        h("p", { class: "muted" }, `${track.title} · ${track.author || ""}`),
      ),
    ),
    h("div", { class: "plain-lyrics" }, lyr.text || "Chưa có lời bài hát."),
  );
}
