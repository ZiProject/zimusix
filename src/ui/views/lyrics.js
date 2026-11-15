import { seekVideoIfBuffered } from "../../features/background.js";
import { loadLyrics } from "../../features/lyrics.js";
import { control } from "../../features/playback.js";
import { fmtTime, h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";

/** Danh sách dòng lyric đồng bộ (dùng cho cả tab Lời bài hát và khu Đang phát). */
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
          title: "Bấm để nhảy tới đoạn này",
        },
        h("span", { class: "line-time" }, fmtTime(line.timeMs)),
        h("span", { class: "line-text" }, line.text),
      ),
    ),
  );
}

/**
 * Phần thân lời bài hát (trạng thái trống / đang tải / lỗi / đồng bộ / thường).
 * `embedded` = nhúng trong khu Đang phát: bỏ tiêu đề, dùng mascot gọn.
 */
export function lyricsBody({ embedded = false } = {}) {
  const track = app.state?.currentTrack;
  if (!track)
    return mascotState("idle", "Chưa phát bài nào. Hãy chọn bài để xem lời đồng bộ.");
  if (app.lyricsLoading)
    return mascotState("loading", "Đang tìm kiếm lời bài hát đồng bộ từ LRCLIB...");
  const lyr = app.lyrics;
  if (!lyr || lyr.error)
    return mascotState("noResult", lyr?.error || "Không tìm thấy lời bài hát cho bài này.", {
      action: embedded
        ? h("button", { class: "small", onclick: () => loadLyrics(true) }, icon("refresh", 14), " Thử lại")
        : null,
    });
  if (lyr.lines?.length) return lyricsList(lyr);
  return h("div", { class: "plain-lyrics" }, lyr.text || "Chưa có lời bài hát.");
}

export function viewLyrics() {
  const track = app.state?.currentTrack;
  if (!track) {
    return h(
      "section",
      { class: "view lyrics-view" },
      h("h2", null, "Lời bài hát (Lyrics)"),
      lyricsBody(),
    );
  }

  const lyr = app.lyrics;
  const synced = !app.lyricsLoading && lyr && !lyr.error && lyr.lines?.length > 0;
  const failed = !app.lyricsLoading && (!lyr || lyr.error);

  const title = app.lyricsLoading
    ? "Lời bài hát (Sync)"
    : failed
      ? "Lời bài hát"
      : synced
        ? "Lời bài hát (Đồng bộ theo nhạc)"
        : "Lời bài hát";
  const subtitle = synced
    ? `${lyr.trackName || track.title} · ${lyr.artistName || track.author || ""}`
    : `${track.title} · ${track.author || ""}`;

  let actions = null;
  if (failed)
    actions = h(
      "button",
      { onclick: () => loadLyrics(true) },
      icon("refresh", 16),
      " Thử lại",
    );
  else if (synced)
    actions = h(
      "div",
      { class: "button-row" },
      h("span", { class: "badge lrclib" }, "Sync LRC"),
      h(
        "button",
        { onclick: () => loadLyrics(true), title: "Tải lại lời bài hát" },
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
