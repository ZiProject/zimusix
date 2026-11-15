import * as api from "../api.js";
import { cfg } from "../presets/runtime.js";
import { app } from "../state.js";
import { renderMain } from "../ui/main-view.js";
import { currentPosition } from "../ui/player.js";

let lastLyricsKey = null;

let lastActiveLyricIdx = -1;

/** Container lyric đã được tô sáng lần gần nhất (DOM mới sau khi render lại thì phải tô lại). */
let lastContainer = null;

/** Lời bài hát có đang nằm trên màn hình không (tab Lời bài hát, hoặc nhúng trong khu Đang phát). */
export function lyricsOnScreen() {
  return (
    app.view === "lyrics" ||
    (app.view === "nowplaying" && cfg().lyrics.placement === "stage")
  );
}

export async function loadLyrics(force = false) {
  const track = app.state?.currentTrack;
  if (!track) {
    app.lyrics = null;
    lastLyricsKey = null;
    lastActiveLyricIdx = -1;
    if (lyricsOnScreen()) renderMain();
    return;
  }
  if (!force && lastLyricsKey === track.key && app.lyrics) return;

  lastLyricsKey = track.key;
  lastActiveLyricIdx = -1;
  app.lyricsLoading = true;
  if (lyricsOnScreen()) renderMain();

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
    if (lyricsOnScreen()) renderMain();
  }
}

/** Cuộn dòng đang hát vào giữa khung lyric (chỉ cuộn trong khung, không kéo cả trang). */
function centerLine(container, el, smooth) {
  const top = el.offsetTop - container.clientHeight / 2 + el.offsetHeight / 2;
  container.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
}

export function updateLyricsSync() {
  if (!lyricsOnScreen() || !app.lyrics?.lines?.length) return;
  const container = document.querySelector(".lyrics-list");
  if (!container) return;

  const pos = currentPosition();
  const lines = app.lyrics.lines;
  let activeIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= pos) activeIdx = i;
    else break;
  }

  const freshContainer = container !== lastContainer;
  if (activeIdx === lastActiveLyricIdx && !freshContainer) return;
  lastActiveLyricIdx = activeIdx;
  lastContainer = container;

  const lineEls = container.querySelectorAll(".lyric-line");
  lineEls.forEach((el, idx) => {
    el.classList.toggle("active", idx === activeIdx);
    el.classList.toggle("past", idx < activeIdx);
    // khoảng cách tới dòng đang hát (0..4): các chế độ karaoke/focus dùng để làm mờ dần
    // chưa tới dòng đầu: coi hai dòng đầu là "sắp hát" để chế độ focus vẫn có chữ
    el.dataset.d =
      activeIdx < 0
        ? idx < 2
          ? String(idx + 1)
          : "4"
        : String(Math.min(Math.abs(idx - activeIdx), 4));
  });
  const active = lineEls[activeIdx];
  if (active) centerLine(container, active, !freshContainer);
  else if (freshContainer) container.scrollTo({ top: 0 });
}

/** Đặt lại mốc dòng lyric đang sáng (khi đổi bài / đổi đích phát). */
export function resetLyricsSync() {
  lastActiveLyricIdx = -1;
  lastContainer = null;
}
