import { BG_DEFAULTS } from "../lib/constants.js";
import * as api from "../api.js";
import { audio } from "./audio.js";
import { clamp, h } from "../lib/dom.js";
import { toast } from "../lib/toast.js";
import { app } from "../state.js";
import { renderMain } from "../ui/main-view.js";
import { currentPosition, renderPlayer } from "../ui/player.js";

function saveBgSettings() {
  try {
    localStorage.setItem("zimusix-bg", JSON.stringify(app.bg));
  } catch (_) {}
}

/** Đẩy cài đặt nền vào CSS variables: blur/độ đậm/độ tối đổi tức thì, không cần render lại. */
function applyBgSettings() {
  const { opacity, blur, dim } = app.bg;
  const style = document.documentElement.style;
  style.setProperty("--bg-opacity", (opacity / 100).toFixed(2));
  style.setProperty("--bg-blur", String(blur));
  style.setProperty("--bg-dim", (dim / 100).toFixed(2));
  // blur càng lớn càng phải phóng to để mép ảnh không lộ viền trong suốt
  style.setProperty("--bg-scale", (1.04 + (blur / 30) * 0.1).toFixed(3));
}

export function setBgSetting(key, value) {
  app.bg[key] = value;
  saveBgSettings();
  applyBgSettings();
  if (key === "art") updateVideoBg();
}

export function resetBgSettings() {
  app.bg = { ...BG_DEFAULTS };
  saveBgSettings();
  applyBgSettings();
  updateVideoBg();
  renderMain();
}

export function seekVideoIfBuffered(video, targetSec) {
  if (!video || !video.buffered || !video.buffered.length) return false;
  try {
    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i);
      const end = video.buffered.end(i);
      if (targetSec >= start && targetSec <= end - 0.5) {
        video.currentTime = targetSec;
        return true;
      }
    }
  } catch (_) {}
  return false;
}

const videoStreamUrl = (track, mode) =>
  `${api.httpBase()}/video/stream?target=${encodeURIComponent(app.target)}&key=${encodeURIComponent(track.key)}&token=${encodeURIComponent(api.token())}${mode ? `&mode=${mode}` : ""}`;

function ensureBgLayer() {
  let layer = document.getElementById("bg-layer");
  if (layer) return layer;
  const art = h("img", { id: "bg-art", class: "bg-art", alt: "" });
  art.addEventListener("load", () => art.classList.add("loaded"));
  art.addEventListener("error", () => art.classList.remove("loaded"));
  const video = h("video", {
    id: "bg-video",
    class: "bg-video",
    autoplay: true,
    muted: true,
    loop: true,
    playsinline: true,
  });
  video.muted = true;
  video.defaultMuted = true;
  video.addEventListener("error", () => {
    video.classList.remove("ready");
    layer?.classList.remove("has-video");
    video.dataset.failed = video.dataset.currentKey || "1";
  });
  video.addEventListener("loadeddata", () => {
    // tới đây video mới có hình: fade vào, ảnh bìa mờ dần
    video.classList.add("ready");
    layer.classList.add("has-video");
    syncBgVideo(true);
  });
  video.addEventListener("loadedmetadata", () => {
    // đổi từ stream trực tiếp sang file cache: nhảy về đúng vị trí nhạc
    if (video.dataset.resumeAt) {
      const at = Number(video.dataset.resumeAt);
      delete video.dataset.resumeAt;
      try {
        const d = video.duration;
        video.currentTime = Number.isFinite(d) && d > 0 ? at % d : at;
      } catch (_) {}
    }
  });
  layer = h(
    "div",
    { id: "bg-layer", class: "bg-layer" },
    art,
    video,
    h("div", { id: "bg-overlay", class: "bg-overlay" }),
  );
  document.body.prepend(layer);
  applyBgSettings();
  return layer;
}

export function updateVideoBg() {
  const layer = ensureBgLayer();
  const bgVideo = document.getElementById("bg-video");
  const bgArt = document.getElementById("bg-art");
  const track = app.state?.currentTrack;

  // Ảnh bìa: nền nền tảng, hiện ngay cả khi chưa/không có video
  if (app.bg.art && track?.thumbnail) {
    if (bgArt.dataset.src !== track.thumbnail) {
      bgArt.classList.remove("loaded");
      bgArt.dataset.src = track.thumbnail;
      bgArt.src = track.thumbnail;
    }
    bgArt.classList.add("on");
  } else {
    bgArt.classList.remove("on");
  }

  if (!app.videoBg || !track) {
    bgVideo.classList.remove("ready");
    layer.classList.remove("has-video");
    bgVideo.pause();
    delete bgVideo.dataset.currentKey;
    return;
  }

  // Khác bài hát: nạp video mới (cùng bài thì giữ nguyên stream)
  if (bgVideo.dataset.currentKey !== track.key) {
    bgVideo.classList.remove("ready");
    layer.classList.remove("has-video");
    bgVideo.dataset.currentKey = track.key;
    bgVideo.dataset.mode = "live";
    delete bgVideo.dataset.failed;
    delete bgVideo.dataset.resumeAt;
    bgVideo.dataset.statusCheckedAt = "0";
    bgVideo.src = videoStreamUrl(track);
    bgVideo.playbackRate = 1;
  }
  syncBgVideo(true);
}

/**
 * Giữ video bám theo vị trí nhạc:
 *  - tạm dừng/tiếp tục theo player
 *  - lệch lớn: seek thẳng (file cache hỗ trợ Range) hoặc chuyển từ stream trực tiếp sang file cache
 *  - lệch nhỏ: chỉnh playbackRate nhẹ nhàng để không giật hình
 */
async function syncBgVideo(force = false) {
  const video = document.getElementById("bg-video");
  const track = app.state?.currentTrack;
  if (!video || !track || !app.videoBg) return;
  if (video.dataset.currentKey !== track.key || video.dataset.failed) return;

  const playing = Boolean(app.state.isPlaying && !app.state.isPaused);
  if (!playing) {
    if (!video.paused) video.pause();
    video.playbackRate = 1;
    return;
  }
  if (video.paused) video.play().catch(() => {});
  if (video.seeking || video.readyState < 2) return;

  const targetSec = currentPosition() / 1000;
  const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
  const wanted = duration ? targetSec % duration : targetSec;
  let drift = video.currentTime - wanted; // >0: video chạy trước nhạc
  if (duration && Math.abs(drift) > duration / 2)
    drift -= Math.sign(drift) * duration; // video đã lặp vòng

  const now = performance.now();
  const absDrift = Math.abs(drift);

  if (video.dataset.mode === "live") {
    // Stream trực tiếp không seek được: kiểm tra bản cache, khi xong thì chuyển sang file.
    if (
      (absDrift > 1.5 || force) &&
      now - Number(video.dataset.statusCheckedAt || 0) > 2500
    ) {
      video.dataset.statusCheckedAt = String(now);
      try {
        const res = await api.get(
          `/video/status?key=${encodeURIComponent(track.key)}`,
        );
        if (res.ready && video.dataset.currentKey === track.key && absDrift > 1.5) {
          video.dataset.mode = "file";
          video.dataset.resumeAt = String(currentPosition() / 1000);
          video.src = videoStreamUrl(track, "file");
          video.play().catch(() => {});
          return;
        }
      } catch (_) {}
    }
    if (absDrift > 0.25)
      video.playbackRate = clamp(1 - drift * 0.25, 0.8, 1.25);
    else if (video.playbackRate !== 1) video.playbackRate = 1;
    return;
  }

  // file cache: seek được
  if (absDrift > 1.2 && now - Number(video.dataset.lastSeek || 0) > 1500) {
    video.dataset.lastSeek = String(now);
    try {
      video.currentTime = wanted;
    } catch (_) {}
    video.playbackRate = 1;
    return;
  }
  if (absDrift > 0.2) video.playbackRate = clamp(1 - drift * 0.3, 0.85, 1.2);
  else if (video.playbackRate !== 1) video.playbackRate = 1;
}
setInterval(() => syncBgVideo(), 500);

/* Nhún nền theo bass (độc lập với canvas visualizer) */

let punchSmooth = 0;

let punchShown = -1;

function bgReactLoop() {
  requestAnimationFrame(bgReactLoop);
  if (document.hidden) return;
  const s = app.state;
  const active = Boolean(
    app.bg.react && audio && s?.isPlaying && !s.isPaused,
  );
  if (active) {
    const raw = audio.getBassEnergy?.({ minHz: 45, maxHz: 120 }) ?? 0;
    punchSmooth =
      raw > punchSmooth ? punchSmooth * 0.2 + raw * 0.8 : punchSmooth * 0.92;
  } else {
    punchSmooth *= 0.9;
  }
  const punch = punchSmooth < 0.01 ? 0 : Math.pow(punchSmooth, 1.5);
  if (Math.abs(punch - punchShown) < 0.004) return;
  punchShown = punch;
  document.documentElement.style.setProperty("--music-punch", punch.toFixed(3));
}
requestAnimationFrame(bgReactLoop);

export function toggleVideoBg() {
  app.videoBg = !app.videoBg;
  toast(
    app.videoBg ? "Đã bật Video Background" : "Đã tắt Video Background",
    "info",
  );
  updateVideoBg();
  renderPlayer();
}
