import * as api from "../api.js";
import { app } from "../state.js";
import { renderMain } from "../ui/main-view.js";
import { currentPosition } from "../ui/player.js";

let lastLyricsKey = null;

let lastActiveLyricIdx = -1;

export async function loadLyrics(force = false) {
  const track = app.state?.currentTrack;
  if (!track) {
    app.lyrics = null;
    lastLyricsKey = null;
    lastActiveLyricIdx = -1;
    if (app.view === "lyrics") renderMain();
    return;
  }
  if (!force && lastLyricsKey === track.key && app.lyrics) return;

  lastLyricsKey = track.key;
  lastActiveLyricIdx = -1;
  app.lyricsLoading = true;
  if (app.view === "lyrics") renderMain();

  try {
    const res = await api.get(
      `/lyrics?target=${encodeURIComponent(app.target)}&key=${encodeURIComponent(track.key)}`,
    );
    if (res.ok) {
      app.lyrics = res;
    } else {
      app.lyrics = { error: res.error || "Không tìm thấy lời bài hát" };
    }
  } catch (err) {
    app.lyrics = { error: err.message };
  } finally {
    app.lyricsLoading = false;
    if (app.view === "lyrics") renderMain();
  }
}

export function updateLyricsSync() {
  if (app.view !== "lyrics" || !app.lyrics?.lines?.length) return;
  const pos = currentPosition();
  const lines = app.lyrics.lines;
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= pos) activeIdx = i;
    else break;
  }

  if (activeIdx === lastActiveLyricIdx) return;
  lastActiveLyricIdx = activeIdx;

  const container = document.querySelector(".lyrics-list");
  if (!container) return;
  const lineEls = container.querySelectorAll(".lyric-line");

  lineEls.forEach((el, idx) => {
    if (idx === activeIdx) {
      if (!el.classList.contains("active")) {
        el.classList.add("active");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } else {
      el.classList.remove("active");
    }
    if (idx < activeIdx) el.classList.add("past");
    else el.classList.remove("past");
  });
}

/** Đặt lại mốc dòng lyric đang sáng (khi đổi bài / đổi đích phát). */
export function resetLyricsSync() {
  lastActiveLyricIdx = -1;
}
