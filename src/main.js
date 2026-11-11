import { WebAudioClient } from "@ziplayer/client";
import * as api from "./api.js";
import "./style.css";

/* ------------------------------------------------------------------ helpers */

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  search:
    '<path d="M10 4a6 6 0 1 0 3.5 10.9l4.8 4.8 1.4-1.4-4.8-4.8A6 6 0 0 0 10 4zm0 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8z"/>',
  folder:
    '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z"/>',
  queue:
    '<path d="M3 6h14v2H3V6zm0 5h14v2H3v-2zm0 5h9v2H3v-2zm13-1v-5l5 2.5-5 2.5z"/>',
  discord:
    '<path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>',
  next: '<path d="M6 18l8.500-6L6 6v12zM16 6v12h2V6h-2z"/>',
  prev: '<path d="M6 6h2v12H6zm3.500 6 8.500 6V6z"/>',
  shuffle:
    '<path d="M10.600 9.200 7.500 6.100A5 5 0 0 0 4 4.700H2v2h2c.8 0 1.600.3 2.100.9l3.100 3.100 1.400-1.500zM14.500 4.700l2.300 2.300L3.600 20.200 5 21.600 18.200 8.400l2.300 2.300V4.700h-6zM14.800 13.900l-1.400 1.400 3.400 3.400-2.300 2.300h6v-6l-2.300 2.300-3.400-3.400z"/>',
  repeat:
    '<path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/>',
  infinity:
    '<path d="M18.600 6.600c-1.800 0-3.100 1-4.500 2.600l-1.100 1.300-1.100-1.300C10.500 7.600 9.200 6.600 7.400 6.600a5.400 5.400 0 0 0 0 10.800c1.800 0 3.100-1 4.500-2.600l1.100-1.300 1.100 1.300c1.400 1.600 2.700 2.600 4.500 2.600a5.400 5.400 0 0 0 0-10.800zM7.400 15.400a3.400 3.400 0 0 1 0-6.800c1 0 1.800.6 3 2l.9 1.100-.9 1.100c-1.200 1.400-2 2.100-3 2.100zm11.200 0c-1 0-1.800-.7-3-2.100l-.9-1.100.9-1.100c1.200-1.400 2-2 3-2a3.400 3.400 0 0 1 0 6.200z"/>',
  volume:
    '<path d="M3 9v6h4l5 5V4L7 9H3zm13.500 3a4.500 4.500 0 0 0-2.500-4v8a4.500 4.500 0 0 0 2.500-4z"/>',
  headphones:
    '<path d="M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-8H5v-1a7 7 0 0 1 14 0v1h-2v8h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z"/>',
  plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5z"/>',
  x: '<path d="M6.400 5 5 6.400 10.600 12 5 17.600 6.400 19 12 13.400 17.600 19 19 17.600 13.400 12 19 6.400 17.600 5 12 10.600z"/>',
  up: '<path d="m12 8-6 6 1.400 1.400L12 10.800l4.600 4.600L18 14z"/>',
  down: '<path d="m12 16 6-6-1.400-1.400L12 13.200 7.400 8.600 6 10z"/>',
  music: '<path d="M12 3v10.600A4 4 0 1 0 14 17V7h4V3h-6z"/>',
  sparkles:
    '<path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4zm7 13l1.2 2.8L23 19l-2.8 1.2L19 23l-1.2-2.8L15 19l2.8-1.2zm-14 0l1.2 2.8L9 19l-2.8 1.2L5 23l-1.2-2.8L1 19l2.8-1.2z"/>',
  mic: '<path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>',
  link: '<path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>',
  video:
    '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>',
  sidebar:
    '<path d="M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm5 2v12h12V6H8zM4 6v12h2V6H4z"/>',
  fullscreen:
    '<path d="M4 4h6v2H6v4H4V4zm10 0h6v6h-2V6h-4V4zM4 14h2v4h4v2H4v-6zm14 0h2v6h-6v-2h4v-4z"/>',
  refresh:
    '<path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>',
};

function icon(name, size = 20) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = ICONS[name] ?? "";
  return svg;
}

/** Tạo DOM an toàn (không dùng innerHTML với dữ liệu từ bài hát). */
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key.startsWith("on"))
      el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "style" && typeof value === "object")
      Object.assign(el.style, value);
    else if (key in el) el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
  for (const kid of kids.flat(Infinity))
    if (kid != null && kid !== false)
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

const fmtTime = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
};

const SOURCE_LABEL = {
  youtube: "YouTube",
  soundcloud: "SoundCloud",
  spotify: "Spotify",
  attachments: "File",
};
const AUDIO_EXTENSIONS = [
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "flac",
  "aac",
  "wma",
  "opus",
  "webm",
];

/* -------------------------------------------------------------------- state */

const app = {
  target: "local", // "local" hoặc guildId
  state: null,
  view: "search",
  source: "all",
  query: "",
  results: [],
  searching: false,
  listen: true, // nghe âm thanh ngay trong app
  addMode: "end", // end | now (khi thêm file local)
  discord: {
    status: "logged-out",
    user: null,
    hasSavedToken: false,
    error: null,
  },
  guilds: [],
  voiceByGuild: {}, // guildId -> {channelId, channelName}
  stateByTarget: {},
  dragging: false,
  receivedAt: 0,
  videoBg: true, // video background bằng player.saveVideo
  videoOpacity: 100,
  sidebarHidden: false,
  lyrics: null, // lời bài hát đồng bộ
  lyricsLoading: false,
  wiringOpen: false,
  webAudioSourceTarget: "local",
};

const root = document.getElementById("app");
const refs = {};
let stopWatching = null;
let activeWireDrag = null;

/* --------------------------------------------------------------------- toast */

function toast(message, kind = "info", duration) {
  let box = document.querySelector(".toasts");
  if (!box) box = document.body.appendChild(h("div", { class: "toasts" }));
  const el = h("div", { class: `toast ${kind}` }, message);
  box.append(el);
  setTimeout(() => el.remove(), duration ?? (kind === "error" ? 6000 : 3000));
}

async function act(fn, okMessage) {
  try {
    const result = await fn();
    if (okMessage)
      toast(
        typeof okMessage === "function" ? okMessage(result) : okMessage,
        "ok",
      );
    return result;
  } catch (error) {
    toast(error.message || String(error), "error");
    return null;
  }
}

/* --------------------------------------------------------------- audio (app) */

let audio = null;
let audioTarget = null;
let audioBusy = false;
let reconnectTimer = null;

async function syncAudio() {
  if (audioBusy) return;
  const want = app.listen ? app.target : null;
  if (want === audioTarget && (want === null || audio)) return;
  audioBusy = true;
  try {
    if (audio) {
      const old = audio;
      audio = null;
      audioTarget = null;
      await old.disconnect().catch(() => {});
    }
    if (!want) return;
    const client = new WebAudioClient({ analyserOptions: { fftSize: 1024 } });
    client.addEventListener("error", ({ detail }) =>
      console.warn("[audio]", detail?.error),
    );
    client.addEventListener("close", () => {
      if (audio !== client) return;
      audio = null;
      audioTarget = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(syncAudio, 1500);
    });
    await client.connect({
      gatewayUrl: api.wsBase(),
      token: api.token(),
      sessionId: want,
    });
    audio = client;
    audioTarget = want;
    resumeAudio();
  } catch (error) {
    console.warn("[audio] không kết nối được:", error);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(syncAudio, 3000);
  } finally {
    audioBusy = false;
  }
}

function resumeAudio() {
  const context = audio?.getAudioContext?.();
  if (context && context.state === "suspended")
    context.resume().catch(() => {});
}

async function ensureAudio() {
  await syncAudio();
  resumeAudio();
}
// WebView có thể chặn AudioContext tới khi người dùng chạm vào app.
document.addEventListener("pointerdown", () => ensureAudio(), {
  capture: true,
});

/* --------------------------------------------------------------- state sync */

function switchView(view) {
  app.view = view;
  renderSidebar();
  renderMain();
  if (view === "lyrics") loadLyrics();
}

function toggleSidebar() {
  app.sidebarHidden = !app.sidebarHidden;
  root.classList.toggle("sidebar-hidden", app.sidebarHidden);
  renderMain();
}

/* -------------------------------------------------------- video background */

function seekVideoIfBuffered(video, targetSec) {
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

function updateVideoBg() {
  let bgVideo = document.getElementById("bg-video");
  let bgOverlay = document.getElementById("bg-overlay");
  if (!bgVideo) {
    bgVideo = h("video", {
      id: "bg-video",
      class: "bg-video",
      autoplay: true,
      muted: true,
      loop: true,
      playsinline: true,
    });
    bgVideo.muted = true;
    bgVideo.defaultMuted = true;
    bgOverlay = h("div", { id: "bg-overlay", class: "bg-overlay" });
    document.body.prepend(bgOverlay);
    document.body.prepend(bgVideo);
    bgVideo.addEventListener("error", () => {
      bgVideo.style.opacity = "0";
    });
    bgVideo.addEventListener("playing", () => {
      if (app.videoBg) bgVideo.style.opacity = String(app.videoOpacity / 100);
    });
    bgVideo.addEventListener("canplay", () => {
      if (app.videoBg && app.state?.isPlaying && !app.state?.isPaused) {
        bgVideo.play().catch(() => {});
      }
    });
  }

  const track = app.state?.currentTrack;
  if (!app.videoBg || !track) {
    bgVideo.style.opacity = "0";
    bgVideo.pause();
    return;
  }

  // Nếu cùng bài hát: giữ nguyên stream, không reload lại từ đầu
  if (bgVideo.dataset.currentKey === track.key) {
    if (app.state?.isPlaying && !app.state?.isPaused) {
      seekVideoIfBuffered(bgVideo, currentPosition() / 1000);
      bgVideo.play().catch(() => {});
      bgVideo.style.opacity = String(app.videoOpacity / 100);
    } else {
      bgVideo.pause();
    }
    return;
  }

  // Khác bài hát: nạp video mới
  bgVideo.dataset.currentKey = track.key;
  bgVideo.src = `${api.httpBase()}/video/stream?target=${encodeURIComponent(app.target)}&key=${encodeURIComponent(track.key)}&token=${encodeURIComponent(api.token())}`;
  bgVideo.play().catch(() => {});
}

function toggleVideoBg() {
  app.videoBg = !app.videoBg;
  toast(
    app.videoBg
      ? "Đã bật Video Background (player.saveVideo)"
      : "Đã tắt Video Background",
    "info",
  );
  updateVideoBg();
  renderPlayer();
}

function setVideoOpacity(value) {
  app.videoOpacity = Number(value);
  const output = document.querySelector(".video-opacity-value");
  if (output) output.textContent = `${app.videoOpacity}%`;
  const bgVideo = document.getElementById("bg-video");
  if (bgVideo && app.videoBg && app.state?.currentTrack)
    bgVideo.style.opacity = String(app.videoOpacity / 100);
}

async function toggleFullscreen() {
  await act(async () => {
    if (api.isTauri()) {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const window = getCurrentWindow();
      await window.setFullscreen(!(await window.isFullscreen()));
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await root.requestFullscreen();
    }
  });
}

/* ------------------------------------------------------------------ lyrics */

let lastLyricsKey = null;
let lastActiveLyricIdx = -1;

async function loadLyrics(force = false) {
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

function updateLyricsSync() {
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

/* ------------------------------------------------------------- voice link */

async function linkVoiceAction(sourceTarget, guildId, channelId) {
  if (!sourceTarget || !guildId || !channelId)
    return toast("Vui lòng chọn nguồn phát và kênh thoại đích", "error");
  const state = await act(
    () =>
      api.post("/voice/link", {
        target: sourceTarget,
        guildId,
        channelId,
      }),
    "Đã nối nguồn phát tới Discord Voice",
  );
  if (!state) {
    const [sourceState, destinationState] = await Promise.all([
      act(() => api.get(`/state?target=${encodeURIComponent(sourceTarget)}`)),
      act(() => api.get(`/state?target=${encodeURIComponent(guildId)}`)),
    ]);
    if (sourceState) {
      app.stateByTarget[sourceTarget] = sourceState;
      if (sourceTarget === app.target) setState(sourceState);
    }
    if (destinationState) {
      app.stateByTarget[guildId] = destinationState;
      app.voiceByGuild[guildId] = destinationState.voice ?? undefined;
    }
    renderSidebar();
    renderPlayer();
    return;
  }
  const activeTarget = state.activeTarget || sourceTarget;
  if (activeTarget !== app.target) await setTarget(activeTarget);
  if (state.sourceState)
    app.stateByTarget[state.sourceState.target] = state.sourceState;
  app.voiceByGuild[guildId] = {
    channelId,
    channelName: state.linkedVoice?.channelName,
  };
  if (state.target === app.target) setState(state);
  else app.stateByTarget[state.target] = state;
  if (state.destinationState)
    app.stateByTarget[state.destinationState.target] = state.destinationState;
  renderSidebar();
  renderPlayer();
}

async function unlinkVoiceAction(target = app.target) {
  const state = await act(
    () => api.post("/voice/unlink", { target }),
    "Đã rút dây kết nối Voice",
  );
  if (!state) return;
  app.stateByTarget[target] = state;
  if (state.relatedState)
    app.stateByTarget[state.relatedState.target] = state.relatedState;
  if (state.target === app.target) setState(state);
  renderSidebar();
  renderPlayer();
}

async function connectToApp(sourceTarget) {
  if (sourceTarget !== app.target) await setTarget(sourceTarget);
  app.webAudioSourceTarget = sourceTarget;
  app.listen = true;
  renderPlayer();
  await syncAudio();
  toast("Đã nối nguồn phát tới ứng dụng", "ok");
}

/* ----------------------------------------------------------------- related */

async function refreshRelated() {
  const res = await act(
    () => api.post("/related/refresh", { target: app.target }),
    "Đã làm mới danh sách gợi ý",
  );
  if (res?.tracks) {
    if (app.state) app.state.related = res.tracks;
    renderMain();
  }
}

async function enqueueRelatedAll(tracks) {
  if (!tracks?.length) return;
  for (const t of tracks) {
    await api.post("/play", {
      target: app.target,
      trackKey: t.key,
      mode: "end",
    });
  }
  toast(`Đã thêm ${tracks.length} bài gợi ý vào hàng đợi`, "ok");
  renderMain();
}

function setState(state) {
  if (!state || state.target !== app.target) return;
  const prevTrackKey = app.state?.currentTrack?.key;
  const trackChanged = prevTrackKey !== state.currentTrack?.key;
  app.state = state;
  app.stateByTarget[state.target] = state;
  app.receivedAt = performance.now();
  if (state.target !== "local")
    app.voiceByGuild[state.target] = state.voice ?? undefined;
  renderPlayer();
  renderSidebar();
  updateVideoBg();
  if (trackChanged) {
    lastActiveLyricIdx = -1;
    loadLyrics();
  }
  if (
    ["queue", "related"].includes(app.view) ||
    (app.view === "lyrics" && trackChanged)
  ) {
    renderMain();
  }
}

function watch() {
  stopWatching?.();
  app.state = null;
  stopWatching = api.watchState(app.target, setState, ({ message, track }) =>
    toast(track ? `${track}: ${message}` : message, "error", 10_000),
  );
}

async function setTarget(target) {
  if (target === app.target) return;
  app.target = target;
  app.listen = target === app.webAudioSourceTarget;
  lastActiveLyricIdx = -1;
  watch();
  renderSidebar();
  renderPlayer();
  updateVideoBg();
  loadLyrics();
  if (["queue", "related", "lyrics"].includes(app.view))
    renderMain();
  await syncAudio();
}

const control = (action, extra = {}) =>
  act(async () => {
    const state = await api.post("/control", {
      target: app.target,
      action,
      ...extra,
    });
    setState(state);
    return state;
  });

async function playTrack(track, mode) {
  await ensureAudio();
  const okMessage =
    mode === "now"
      ? null
      : mode === "next"
        ? "Sẽ phát tiếp theo"
        : "Đã thêm vào hàng đợi";
  const state = await act(
    () => api.post("/play", { target: app.target, trackKey: track.key, mode }),
    okMessage,
  );
  if (state) setState(state);
}

async function addLocal(paths) {
  if (!paths?.length) return;
  await ensureAudio();
  const state = await act(
    () => api.post("/play", { target: app.target, paths, mode: app.addMode }),
    (result) => `Đã thêm ${result?.added ?? ""} bài`.replace("  ", " "),
  );
  if (state) setState(state);
}

/* --------------------------------------------------------------- local files */

async function pickFiles() {
  if (!api.isTauri())
    return toast(
      "Chọn file chỉ khả dụng trong app Tauri. Có thể dán đường dẫn vào ô tìm kiếm.",
      "error",
    );
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({
    multiple: true,
    filters: [{ name: "Âm thanh", extensions: AUDIO_EXTENSIONS }],
  });
  if (picked) await addLocal(Array.isArray(picked) ? picked : [picked]);
}

async function pickFolder() {
  if (!api.isTauri())
    return toast("Chọn thư mục chỉ khả dụng trong app Tauri.", "error");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });
  if (picked) await addLocal([picked]);
}

async function setupDragDrop() {
  if (!api.isTauri()) return;
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  await getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === "enter" || payload.type === "over") {
      if (!app.dragging) {
        app.dragging = true;
        root.classList.add("dragging");
      }
    } else {
      app.dragging = false;
      root.classList.remove("dragging");
      if (payload.type === "drop") addLocal(payload.paths);
    }
  });
}

/* ------------------------------------------------------------------- search */

let searchSeq = 0;
async function doSearch() {
  const query = app.query.trim();
  if (!query) return;
  const seq = ++searchSeq;
  app.searching = true;
  renderMain();
  try {
    const { tracks } = await api.post("/search", { query, source: app.source });
    if (seq !== searchSeq) return;
    app.results = tracks;
    if (!tracks.length) toast("Không tìm thấy kết quả", "info");
  } catch (error) {
    if (seq !== searchSeq) return;
    app.results = [];
    toast(error.message, "error");
  } finally {
    if (seq === searchSeq) {
      app.searching = false;
      renderMain();
    }
  }
}

/* ------------------------------------------------------------------ discord */

async function loadDiscord() {
  try {
    app.discord = await api.get("/discord/status");
  } catch {}
  if (app.discord.status === "ready") await loadGuilds();
  renderSidebar();
  if (app.view === "discord") renderMain();
}

async function loadGuilds() {
  try {
    const { guilds } = await api.get("/discord/guilds");
    app.guilds = guilds;
    const states = await Promise.all(
      guilds.map((g) => api.get(`/state?target=${g.id}`).catch(() => null)),
    );
    states.forEach(
      (s, i) => {
        app.voiceByGuild[guilds[i].id] = s?.voice ?? undefined;
        if (s) app.stateByTarget[guilds[i].id] = s;
      },
    );
  } catch (error) {
    app.guilds = [];
    toast(error.message, "error");
  }
}

async function discordLogin(token) {
  const status = await act(
    () => api.post("/discord/login", { token, remember: true }),
    "Bot Discord đã đăng nhập",
  );
  if (status) app.discord.error = null;
  await loadDiscord();
}

async function discordLogout() {
  await act(
    () => api.post("/discord/logout", { forget: true }),
    "Đã đăng xuất bot",
  );
  app.guilds = [];
  app.voiceByGuild = {};
  if (app.target !== "local") await setTarget("local");
  await loadDiscord();
}

async function discordJoin(guildId, channelId) {
  const state = await act(
    () => api.post("/discord/join", { guildId, channelId }),
    "Bot đã vào kênh thoại",
  );
  if (!state) return;
  app.voiceByGuild[guildId] = state.voice ?? undefined;
  await setTarget(guildId);
  if (app.view === "discord") renderMain();
}

async function discordLeave(guildId) {
  await act(
    () => api.post("/discord/leave", { guildId }),
    "Bot đã rời kênh thoại",
  );
  app.voiceByGuild[guildId] = undefined;
  if (app.target === guildId) await setTarget("local");
  renderSidebar();
  if (app.view === "discord") renderMain();
}

function joinedTargets() {
  return app.guilds
    .filter((g) => app.voiceByGuild[g.id])
    .map((g) => ({
      id: g.id,
      name: g.name,
      channel: app.voiceByGuild[g.id].channelName,
    }));
}

/* ------------------------------------------------------------------- render */

function trackCover(track, size = 44) {
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

function badge(source) {
  return h(
    "span",
    { class: `badge ${source ?? ""}` },
    SOURCE_LABEL[source] ?? source ?? "?",
  );
}

function renderSidebar() {
  const nav = [
    ["search", "search", "Tìm kiếm"],
    ["library", "folder", "File local"],
    ["queue", "queue", "Hàng đợi"],
    ["related", "sparkles", "Gợi ý"],
    ["lyrics", "mic", "Lời bài hát"],
    ["discord", "discord", "Discord"],
  ];
  const targets = [
    { id: "local", name: "Máy này", channel: "Phát trong app" },
    ...joinedTargets(),
  ];

  refs.sidebar.replaceChildren(
    h(
      "div",
      { class: "brand" },
      h("span", { class: "logo" }, icon("music", 18)),
      "Zimusix",
    ),
    h(
      "nav",
      null,
      nav.map(([view, ic, label]) =>
        h(
          "button",
          {
            class: `nav-item ${app.view === view ? "active" : ""}`,
            onclick: () => switchView(view),
          },
          icon(ic, 18),
          label,
          view === "queue" && app.state?.queue?.length
            ? h("span", { class: "count" }, app.state.queue.length)
            : null,
          view === "related" && app.state?.related?.length
            ? h("span", { class: "count" }, app.state.related.length)
            : null,
        ),
      ),
    ),
    h("div", { class: "section-title" }, "Phát tới"),
    h(
      "div",
      { class: "targets" },
      targets.map((t) =>
        h(
          "button",
          {
            class: `target ${app.target === t.id ? "active" : ""}`,
            onclick: () => setTarget(t.id),
          },
          h("span", { class: "dot" }),
          h(
            "span",
            { class: "target-text" },
            h("b", null, t.name),
            h(
              "small",
              null,
              t.id === "local" ? t.channel : `# ${t.channel ?? "kênh thoại"}`,
            ),
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "discord-pill" },
      h("span", { class: `dot ${app.discord.status}` }),
      app.discord.status === "ready"
        ? `Bot: ${app.discord.user?.tag ?? "đã đăng nhập"}`
        : app.discord.status === "connecting"
          ? "Bot đang đăng nhập…"
          : "Bot chưa đăng nhập",
    ),
  );
}

function trackRow(track, { actions }) {
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

const iconButton = (name, title, onclick, extra = "") =>
  h(
    "button",
    { class: `icon-btn ${extra}`, title, "aria-label": title, onclick },
    icon(name, 18),
  );

function viewSearch() {
  const input = h("input", {
    type: "search",
    placeholder:
      "Tìm bài hát, dán link YouTube / SoundCloud / Spotify hoặc đường dẫn file…",
    value: app.query,
    autofocus: true,
    oninput: (e) => (app.query = e.target.value),
    onkeydown: (e) => e.key === "Enter" && doSearch(),
  });
  const sources = [
    ["all", "Tất cả"],
    ["youtube", "YouTube"],
    ["soundcloud", "SoundCloud"],
    ["spotify", "Spotify"],
  ];
  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "searchbar" },
      icon("search", 18),
      input,
      h(
        "button",
        { class: "primary", onclick: doSearch, disabled: app.searching },
        app.searching ? "Đang tìm…" : "Tìm",
      ),
    ),
    h(
      "div",
      { class: "chips" },
      sources.map(([id, label]) =>
        h(
          "button",
          {
            class: `chip ${app.source === id ? "active" : ""}`,
            onclick: () => ((app.source = id), renderMain()),
          },
          label,
        ),
      ),
    ),
    app.results.length
      ? h(
          "div",
          { class: "list" },
          app.results.map((track) =>
            trackRow(track, {
              actions: [
                iconButton(
                  "play",
                  "Phát ngay",
                  () => playTrack(track, "now"),
                  "accent",
                ),
                iconButton("next", "Phát tiếp theo", () =>
                  playTrack(track, "next"),
                ),
                iconButton("plus", "Thêm vào hàng đợi", () =>
                  playTrack(track, "end"),
                ),
              ],
            }),
          ),
        )
      : h(
          "div",
          { class: "empty" },
          app.searching
            ? "Đang tìm kiếm…"
            : "Nhập từ khoá để tìm nhạc từ các plugin, hoặc dán link / đường dẫn file.",
        ),
  );
}

function viewLibrary() {
  return h(
    "section",
    { class: "view" },
    h("h2", null, "File local"),
    h(
      "p",
      { class: "muted" },
      "Chọn file hoặc thư mục nhạc trên máy (mp3, flac, wav, ogg, m4a, aac, opus…). Có thể kéo thả trực tiếp vào cửa sổ.",
    ),
    h(
      "div",
      { class: "segmented" },
      h(
        "button",
        {
          class: app.addMode === "end" ? "active" : "",
          onclick: () => ((app.addMode = "end"), renderMain()),
        },
        "Thêm vào hàng đợi",
      ),
      h(
        "button",
        {
          class: app.addMode === "now" ? "active" : "",
          onclick: () => ((app.addMode = "now"), renderMain()),
        },
        "Phát ngay",
      ),
    ),
    h(
      "div",
      { class: "drop-zone" },
      icon("folder", 36),
      h("div", null, "Kéo thả file / thư mục vào đây"),
      h(
        "div",
        { class: "button-row" },
        h("button", { class: "primary", onclick: pickFiles }, "Chọn file…"),
        h("button", { onclick: pickFolder }, "Chọn thư mục…"),
      ),
    ),
    h("p", { class: "muted small" }, `Đang phát tới: ${targetLabel()}`),
  );
}

function targetLabel() {
  if (app.target === "local") return "Máy này (trong app)";
  const guild = app.guilds.find((g) => g.id === app.target);
  return `Discord · ${guild?.name ?? app.target}`;
}

function viewQueue() {
  const state = app.state;
  const queue = state?.queue ?? [];
  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "view-head" },
      h("h2", null, "Hàng đợi"),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          { onclick: () => control("shuffle"), disabled: queue.length < 2 },
          "Trộn",
        ),
        h(
          "button",
          { onclick: () => control("clear"), disabled: !queue.length },
          "Xoá hết",
        ),
      ),
    ),
    state?.currentTrack
      ? h(
          "div",
          { class: "now-playing-card" },
          h("small", null, "Đang phát"),
          trackRow(state.currentTrack, { actions: [] }),
        )
      : null,
    queue.length
      ? h(
          "div",
          { class: "list" },
          queue.map((track, index) =>
            trackRow(track, {
              actions: [
                iconButton(
                  "play",
                  "Phát bài này",
                  () => control("skip", { index }),
                  "accent",
                ),
                iconButton(
                  "up",
                  "Lên",
                  () =>
                    index > 0 &&
                    control("move", { from: index, to: index - 1 }),
                ),
                iconButton(
                  "down",
                  "Xuống",
                  () =>
                    index < queue.length - 1 &&
                    control("move", { from: index, to: index + 1 }),
                ),
                iconButton("x", "Xoá", () => control("remove", { index })),
              ],
            }),
          ),
        )
      : h("div", { class: "empty" }, "Hàng đợi trống."),
    state?.related?.length
      ? h(
          "div",
          { class: "related-section" },
          h(
            "div",
            { class: "related-title" },
            icon("sparkles", 16),
            "Gợi ý tiếp theo (Related Tracks)",
          ),
          h(
            "div",
            { class: "list" },
            state.related.slice(0, 5).map((track) =>
              trackRow(track, {
                actions: [
                  iconButton(
                    "play",
                    "Phát ngay",
                    () => playTrack(track, "now"),
                    "accent",
                  ),
                  iconButton("plus", "Thêm vào hàng đợi", () =>
                    playTrack(track, "end"),
                  ),
                ],
              }),
            ),
          ),
        )
      : null,
  );
}

function viewRelated() {
  const state = app.state;
  const related = state?.related ?? [];
  const current = state?.currentTrack;

  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "view-head" },
      h(
        "div",
        null,
        h("h2", null, "Gợi ý liên quan (Related Tracks)"),
        h(
          "p",
          { class: "muted" },
          current
            ? `Gợi ý tự động cho bài: ${current.title}`
            : "Tự động gợi ý các bài hát tương tự",
        ),
      ),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          { onclick: refreshRelated, title: "Làm mới gợi ý bài liên quan" },
          icon("refresh", 16),
          " Làm mới",
        ),
        related.length
          ? h(
              "button",
              { class: "primary", onclick: () => enqueueRelatedAll(related) },
              "Phát tất cả",
            )
          : null,
      ),
    ),
    related.length
      ? h(
          "div",
          { class: "list" },
          related.map((track) =>
            trackRow(track, {
              actions: [
                iconButton(
                  "play",
                  "Phát ngay",
                  () => playTrack(track, "now"),
                  "accent",
                ),
                iconButton("next", "Phát tiếp theo", () =>
                  playTrack(track, "next"),
                ),
                iconButton("plus", "Thêm vào hàng đợi", () =>
                  playTrack(track, "end"),
                ),
              ],
            }),
          ),
        )
      : h(
          "div",
          { class: "empty" },
          current
            ? "Đang tải bài hát liên quan... Bấm 'Làm mới' nếu cần tìm thêm."
            : "Chưa có bài nào đang phát. Hãy phát một bài nhạc để nhận gợi ý.",
        ),
  );
}

function viewLyrics() {
  const track = app.state?.currentTrack;
  if (!track) {
    return h(
      "section",
      { class: "view lyrics-view" },
      h("h2", null, "Lời bài hát (Lyrics)"),
      h(
        "div",
        { class: "empty" },
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
      h(
        "div",
        { class: "empty" },
        "Đang tìm kiếm lời bài hát đồng bộ từ LRCLIB...",
      ),
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
      h(
        "div",
        { class: "empty" },
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

function viewDiscord() {
  const d = app.discord;
  if (d.status !== "ready") {
    const tokenInput = h("input", {
      type: "password",
      placeholder: d.hasSavedToken
        ? "Dùng token đã lưu (để trống)"
        : "Dán token bot Discord",
      autocomplete: "off",
    });
    return h(
      "section",
      { class: "view" },
      h("h2", null, "Bot Discord"),
      h(
        "p",
        { class: "muted" },
        "Zimusix chạy bot của bạn để phát nhạc vào kênh thoại. Token được lưu cục bộ trên máy này.",
      ),
      d.error ? h("p", { class: "error-text" }, d.error) : null,
      h(
        "div",
        { class: "form-row" },
        tokenInput,
        h(
          "button",
          {
            class: "primary",
            disabled: d.status === "connecting",
            onclick: () => discordLogin(tokenInput.value.trim()),
          },
          d.status === "connecting" ? "Đang đăng nhập…" : "Đăng nhập",
        ),
      ),
      h(
        "ol",
        { class: "help" },
        h(
          "li",
          null,
          "Tạo ứng dụng + bot tại Discord Developer Portal, copy Bot Token.",
        ),
        h(
          "li",
          null,
          "Mời bot vào server bằng OAuth2 URL với scope ",
          h("code", null, "bot"),
          " và quyền Connect + Speak + View Channels.",
        ),
        h(
          "li",
          null,
          "Quay lại đây, đăng nhập và chọn kênh thoại để bot tham gia.",
        ),
      ),
    );
  }
  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "view-head" },
      h("h2", null, "Discord"),
      h(
        "div",
        { class: "button-row" },
        h("button", { onclick: loadDiscord }, "Làm mới"),
        h(
          "button",
          { class: "danger", onclick: discordLogout },
          "Đăng xuất bot",
        ),
      ),
    ),
    app.guilds.length
      ? app.guilds.map((guild) => {
          const joined = app.voiceByGuild[guild.id];
          return h(
            "div",
            { class: "guild" },
            h(
              "div",
              { class: "guild-head" },
              guild.icon
                ? h("img", { src: guild.icon, alt: "" })
                : h("span", { class: "guild-ph" }, guild.name[0]),
              h("b", null, guild.name),
              joined
                ? h(
                    "button",
                    {
                      class: "danger small",
                      onclick: () => discordLeave(guild.id),
                    },
                    "Rời kênh",
                  )
                : null,
            ),
            h(
              "div",
              { class: "channels" },
              guild.channels.length
                ? guild.channels.map((channel) =>
                    h(
                      "button",
                      {
                        class: `channel ${joined?.channelId === channel.id ? "active" : ""}`,
                        onclick: () => discordJoin(guild.id, channel.id),
                      },
                      `🔊 ${channel.name}`,
                      channel.members
                        ? h("small", null, ` ${channel.members}`)
                        : null,
                    ),
                  )
                : h("small", { class: "muted" }, "Không có kênh thoại"),
            ),
          );
        })
      : h(
          "div",
          { class: "empty" },
          "Bot chưa ở trong server nào. Hãy mời bot vào server rồi bấm Làm mới.",
        ),
  );
}

function renderMain() {
  const views = {
    search: viewSearch,
    library: viewLibrary,
    queue: viewQueue,
    related: viewRelated,
    lyrics: viewLyrics,
    discord: viewDiscord,
  };
  // giữ focus & vị trí con trỏ của ô tìm kiếm khi re-render
  const hadFocus = document.activeElement?.matches?.('input[type="search"]');
  refs.main.replaceChildren(
    h(
      "div",
      { class: "main-toolbar" },
      h(
        "label",
        { class: "video-opacity-control", title: "Độ mờ video nền" },
        h("span", null, "Độ đậm"),
        h("input", {
          type: "range",
          min: 0,
          max: 100,
          value: app.videoOpacity,
          "aria-label": "Độ mờ video nền",
          oninput: (event) => setVideoOpacity(event.target.value),
        }),
        h("output", { class: "video-opacity-value" }, `${app.videoOpacity}%`),
      ),
      h(
        "button",
        {
          class: "icon-btn",
          title: app.sidebarHidden ? "Hiện thanh bên" : "Ẩn thanh bên",
          "aria-label": app.sidebarHidden ? "Hiện thanh bên" : "Ẩn thanh bên",
          onclick: () => toggleSidebar(),
        },
        icon("sidebar", 18),
      ),
      h(
        "button",
        {
          class: "icon-btn",
          title: "Bật / tắt toàn màn hình",
          "aria-label": "Bật / tắt toàn màn hình",
          onclick: () => toggleFullscreen(),
        },
        icon("fullscreen", 18),
      ),
    ),
    views[app.view](),
  );
  if (hadFocus) refs.main.querySelector('input[type="search"]')?.focus();
}

/* ------------------------------------------------------------------- player */

let dragging = false;

function wireSources() {
  return [
    {
      id: "local",
      label: "Ứng dụng",
      detail: app.stateByTarget.local?.currentTrack?.title ?? "Player trong app",
    },
    ...joinedTargets().map((target) => ({
      id: target.id,
      label: target.name,
      detail: `#${target.channel}`,
    })),
  ];
}

function routeWire(sourceTarget, destination) {
  if (destination.type === "app") {
    void connectToApp(sourceTarget);
    return;
  }
  if (sourceTarget === destination.guildId) {
    toast("Chọn một server voice khác với đầu ra nguồn", "error");
    return;
  }
  linkVoiceAction(sourceTarget, destination.guildId, destination.channelId);
}

function parseWireDestination(event) {
  const element = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest("[data-wire-destination]");
  if (!element || element.disabled) return null;
  const [type, guildId, channelId] =
    element.dataset.wireDestination.split(":");
  return type === "app" ? { type } : { type, guildId, channelId };
}

function drawWires() {
  const board = refs.wiringBoard;
  const svg = refs.wireSvg;
  if (!board || !svg || !app.wiringOpen) return;
  const bounds = board.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  svg.replaceChildren();

  const addCable = (sourceTarget, x2, y2, className) => {
    const sourcePort = board.querySelector(
      `[data-wire-source-id="${CSS.escape(sourceTarget)}"] .wire-source-port`,
    );
    if (!sourcePort) return;
    const rect = sourcePort.getBoundingClientRect();
    const x1 = rect.right - bounds.left;
    const y1 = rect.top + rect.height / 2 - bounds.top;
    const bend = Math.max(32, Math.abs(x2 - x1) * 0.4);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute(
      "d",
      `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
    );
    path.setAttribute("class", className);
    svg.append(path);
  };

  for (const source of wireSources()) {
    const link = app.stateByTarget[source.id]?.linkedVoice;
    if (
      !link?.guildId ||
      !link.channelId ||
      (link.sourceTarget && link.sourceTarget !== source.id)
    )
      continue;
    const destinationPort = board.querySelector(
      `[data-wire-destination="voice:${CSS.escape(link.guildId)}:${CSS.escape(link.channelId)}"] .wire-destination-port`,
    );
    if (!destinationPort) continue;
    const rect = destinationPort.getBoundingClientRect();
    addCable(
      source.id,
      rect.left + rect.width / 2 - bounds.left,
      rect.top + rect.height / 2 - bounds.top,
      "wire-cable connected",
    );
  }

  if (app.listen && app.webAudioSourceTarget) {
    const appPort = board.querySelector(
      '[data-wire-destination="app"] .wire-destination-port',
    );
    if (appPort) {
      const rect = appPort.getBoundingClientRect();
      addCable(
        app.webAudioSourceTarget,
        rect.left + rect.width / 2 - bounds.left,
        rect.top + rect.height / 2 - bounds.top,
        "wire-cable connected",
      );
    }
  }

  if (activeWireDrag) {
    addCable(
      activeWireDrag.sourceTarget,
      activeWireDrag.x - bounds.left,
      activeWireDrag.y - bounds.top,
      "wire-cable dragging",
    );
  }
}

function startWireDrag(event) {
  if (event.button !== 0 || !event.target.closest(".wire-source-port")) return;
  const source = event.target.closest("[data-wire-source-id]");
  if (!source) return;
  event.preventDefault();
  app.wireSourceTarget = source.dataset.wireSourceId;
  activeWireDrag = {
    sourceTarget: app.wireSourceTarget,
    x: event.clientX,
    y: event.clientY,
  };
  refs.wiringBoard?.classList.add("wiring");
  drawWires();
}

function moveWireDrag(event) {
  if (!activeWireDrag) return;
  activeWireDrag.x = event.clientX;
  activeWireDrag.y = event.clientY;
  const target = document.elementFromPoint(event.clientX, event.clientY)
    ?.closest("[data-wire-destination]");
  refs.wiringBoard
    ?.querySelectorAll(".drop-target")
    .forEach((element) => element.classList.remove("drop-target"));
  target?.classList.add("drop-target");
  drawWires();
}

function finishWireDrag(event) {
  if (!activeWireDrag) return;
  const sourceTarget = activeWireDrag.sourceTarget;
  const destination = parseWireDestination(event);
  activeWireDrag = null;
  refs.wiringBoard?.classList.remove("wiring");
  refs.wiringBoard
    ?.querySelectorAll(".drop-target")
    .forEach((element) => element.classList.remove("drop-target"));
  drawWires();
  if (destination) routeWire(sourceTarget, destination);
}

function renderWiringPanel() {
  const sources = wireSources();
  if (!sources.some((source) => source.id === app.wireSourceTarget)) {
    app.wireSourceTarget = sources[0]?.id ?? "local";
  }
  const sourceLinkedVoice =
    app.stateByTarget[app.wireSourceTarget]?.linkedVoice;

  const destination = (
    name,
    subtitle,
    route,
    linked = false,
    disabled = false,
  ) =>
    h(
      "button",
      {
        class: `wire-destination ${linked ? "linked" : ""}`,
        disabled,
        "data-wire-destination":
          route.type === "app"
            ? "app"
            : `voice:${route.guildId}:${route.channelId}`,
        onclick: () => routeWire(app.wireSourceTarget, route),
      },
      h(
        "span",
        { class: "wire-destination-icon" },
        icon(route.type === "app" ? "headphones" : "discord", 18),
      ),
      h(
        "span",
        { class: "wire-destination-text" },
        h("b", null, name),
        h("small", null, subtitle),
      ),
      h(
        "span",
        { class: "wire-destination-port-wrap" },
        h("span", { class: "wire-destination-port" }),
      ),
    );

  const channels = app.guilds.flatMap((guild) =>
    guild.channels.map((channel) => ({
      guild,
      channel,
    })),
  );

  return h(
    "section",
    { class: "wiring-panel", "aria-label": "Bảng nối đầu ra âm thanh" },
    h(
      "header",
      { class: "wiring-head" },
      h(
        "div",
        null,
        h("b", null, "Nối đầu ra"),
        h(
          "small",
          { class: "muted" },
          "Chọn một đầu ra bên trái, rồi kéo dây tới đầu vào bên phải",
        ),
      ),
    ),
    h(
      "div",
      {
        class: "wiring-board",
        onpointerdown: startWireDrag,
      },
      (() => {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "wire-cables");
        svg.setAttribute("aria-hidden", "true");
        refs.wireSvg = svg;
        return svg;
      })(),
      h(
        "div",
        { class: "wire-source-column" },
        h("span", { class: "wire-label" }, "Đầu ra · kéo từ trái sang phải"),
        sources.map((source) => {
          const linked = app.stateByTarget[source.id]?.linkedVoice;
          return h(
            "button",
            {
              class: `wire-source ${app.wireSourceTarget === source.id ? "selected" : ""}`,
              "data-wire-source-id": source.id,
              title: `${source.label} · ${source.detail}`,
              onclick: () => {
                app.wireSourceTarget = source.id;
                renderPlayer();
              },
            },
            h("span", { class: "wire-source-status" }),
            h(
              "span",
              { class: "wire-source-text" },
              h("b", null, source.label),
              h("small", null, source.detail),
            ),
            linked
              ? h("span", { class: "wire-source-linked" }, "Đang nối")
              : null,
            h("span", { class: "wire-source-port" }),
          );
        }),
      ),
      h(
        "div",
        { class: "wire-destinations" },
        h("span", { class: "wire-label" }, "Đầu vào · thả dây tại đây"),
        destination(
          "Ứng dụng",
          app.webAudioSourceTarget === app.target && app.listen
            ? "Đang nghe bằng loa / tai nghe"
            : "Kéo dây tới đây để nghe trên máy",
          { type: "app" },
          app.webAudioSourceTarget === app.wireSourceTarget && app.listen,
        ),
        app.discord.status !== "ready"
          ? h(
              "button",
              {
                class: "wire-destination wire-login",
                onclick: () => switchView("discord"),
              },
              icon("discord", 18),
              h(
                "span",
                { class: "wire-destination-text" },
                h("b", null, "Discord Voice"),
                h("small", null, "Đăng nhập bot để kết nối"),
              ),
            )
          : channels.length
            ? channels.map(({ guild, channel }) =>
                destination(
                  `#${channel.name}`,
                  guild.name,
                  {
                    type: "voice",
                    guildId: guild.id,
                    channelId: channel.id,
                  },
                  sources.some(
                    (source) =>
                      app.stateByTarget[source.id]?.linkedVoice?.sourceTarget ===
                        source.id &&
                      app.stateByTarget[source.id]?.linkedVoice?.guildId ===
                        guild.id &&
                      app.stateByTarget[source.id]?.linkedVoice?.channelId ===
                        channel.id,
                  ),
                  app.wireSourceTarget === guild.id,
                ),
              )
            : h(
                "small",
                { class: "muted" },
                "Bot chưa có quyền truy cập kênh thoại nào.",
              ),
      ),
      h(
        "p",
        { class: "wire-hint" },
        "Voice → Voice: player đích subscribe đầu ra của player nguồn. Voice → Ứng dụng: chỉ phát web khi kéo dây vào Ứng dụng.",
      ),
    ),
    sourceLinkedVoice
      ? h(
          "button",
          {
            class: "danger small wire-unlink",
            onclick: () => unlinkVoiceAction(app.wireSourceTarget),
          },
          `Rút dây khỏi #${sourceLinkedVoice.channelName || "Voice"}`,
        )
      : null,
  );
}

function buildPlayer() {
  document.addEventListener("pointermove", moveWireDrag);
  document.addEventListener("pointerup", finishWireDrag);
  refs.cover = h("div", { class: "cover-slot" });
  refs.title = h("div", { class: "np-title" }, "Chưa phát");
  refs.sub = h("div", { class: "np-sub" });
  refs.btnPlay = h("button", {
    class: "play-btn",
    title: "Phát / Tạm dừng",
    onclick: () => onPlayPause(),
  });
  refs.btnLoop = h("button", {
    class: "icon-btn",
    title: "Lặp",
    onclick: () => cycleLoop(),
  });
  refs.btnAuto = h(
    "button",
    {
      class: "icon-btn",
      title: "Tự động phát bài liên quan",
      onclick: () => control("autoplay", { enabled: !app.state?.autoPlay }),
    },
    icon("infinity", 18),
  );
  refs.btnListen = h(
    "button",
    {
      class: "icon-btn",
      title: "Nghe trong app",
      onclick: () => {
        if (app.target !== "local" && app.webAudioSourceTarget !== app.target) {
          app.wiringOpen = true;
          app.wireSourceTarget = app.target;
          renderPlayer();
          return;
        }
        app.listen = !app.listen;
        renderPlayer();
        syncAudio();
      },
    },
    icon("headphones", 18),
  );
  refs.btnLyrics = h(
    "button",
    {
      class: "icon-btn",
      title: "Lời bài hát (Sync)",
      onclick: () => switchView("lyrics"),
    },
    icon("mic", 18),
  );
  refs.btnVideo = h(
    "button",
    {
      class: "icon-btn",
      title: "Video Background (player.saveVideo)",
      onclick: () => toggleVideoBg(),
    },
    icon("video", 18),
  );
  refs.btnVoiceLink = h(
    "button",
    {
      class: "icon-btn wire-toggle",
      title: "Nối đầu ra Voice",
      onclick: () => {
        app.wiringOpen = !app.wiringOpen;
        if (app.wiringOpen) app.wireSourceTarget = app.target;
        renderPlayer();
      },
    },
    icon("link", 18),
  );
  refs.wiringPanel = h("div", { class: "wiring-popover" });
  refs.cur = h("span", { class: "time" }, "0:00");
  refs.dur = h("span", { class: "time" }, "0:00");
  refs.seek = h("input", {
    type: "range",
    min: 0,
    max: 1000,
    value: 0,
    class: "seek",
    oninput: () => {
      dragging = true;
      refs.cur.textContent = fmtTime(
        (refs.seek.value / 1000) * (app.state?.duration ?? 0),
      );
    },
    onchange: async () => {
      const positionMs = (refs.seek.value / 1000) * (app.state?.duration ?? 0);
      await control("seek", { positionMs });
      dragging = false;
      seekVideoIfBuffered(
        document.getElementById("bg-video"),
        positionMs / 1000,
      );
    },
  });
  refs.volume = h("input", {
    type: "range",
    min: 0,
    max: 100,
    value: 80,
    class: "volume",
    oninput: (e) => control("volume", { volume: Number(e.target.value) }),
  });
  refs.viz = h("canvas", { class: "viz", width: 160, height: 44 });

  refs.player.replaceChildren(
    refs.wiringPanel,
    h(
      "div",
      { class: "np" },
      refs.cover,
      h("div", { class: "np-text" }, refs.title, refs.sub),
    ),
    h(
      "div",
      { class: "transport" },
      h(
        "div",
        { class: "buttons" },
        h(
          "button",
          {
            class: "icon-btn",
            title: "Trộn hàng đợi",
            onclick: () => control("shuffle"),
          },
          icon("shuffle", 18),
        ),
        h(
          "button",
          {
            class: "icon-btn big",
            title: "Bài trước",
            onclick: () => control("previous"),
          },
          icon("prev", 22),
        ),
        refs.btnPlay,
        h(
          "button",
          {
            class: "icon-btn big",
            title: "Bài tiếp",
            onclick: () => control("skip"),
          },
          icon("next", 22),
        ),
        refs.btnLoop,
        refs.btnAuto,
      ),
      h("div", { class: "progress" }, refs.cur, refs.seek, refs.dur),
    ),
    h(
      "div",
      { class: "extras" },
      refs.viz,
      refs.btnLyrics,
      refs.btnVideo,
      refs.btnVoiceLink,
      refs.btnListen,
      icon("volume", 18),
      refs.volume,
    ),
  );
  renderPlayer();
}

async function onPlayPause() {
  await ensureAudio();
  const s = app.state;
  if (s?.currentTrack && s.isPlaying && !s.isPaused) control("pause");
  else if (s?.currentTrack && s.isPaused) control("resume");
  else if (s?.currentTrack) control("resume");
  else toast("Chưa có bài nào. Hãy tìm nhạc hoặc thêm file local.", "info");
}

function cycleLoop() {
  const next = { off: "queue", queue: "track", track: "off" }[
    app.state?.loop ?? "off"
  ];
  control("loop", { mode: next });
}

function renderPlayer() {
  if (!refs.cover) return;
  const s = app.state;
  const track = s?.currentTrack;
  refs.cover.replaceChildren(trackCover(track, 56));
  refs.title.textContent = track?.title ?? "Chưa phát";
  refs.sub.replaceChildren(
    ...(track
      ? [badge(track.source), track.author ? ` ${track.author}` : ""]
      : [`Phát tới: ${targetLabel()}`]),
  );
  const playing = Boolean(track && s.isPlaying && !s.isPaused);
  refs.btnPlay.replaceChildren(icon(playing ? "pause" : "play", 26));
  refs.btnLoop.className = `icon-btn ${s?.loop && s.loop !== "off" ? "on" : ""}`;
  refs.btnLoop.title = `Lặp: ${{ off: "tắt", queue: "hàng đợi", track: "bài này" }[s?.loop ?? "off"]}`;
  refs.btnLoop.replaceChildren(
    ...[
      icon("repeat", 18),
      s?.loop === "track" ? h("sup", null, "1") : null,
    ].filter(Boolean),
  );
  refs.btnAuto.className = `icon-btn ${s?.autoPlay ? "on" : ""}`;
  refs.btnListen.className = `icon-btn ${app.listen ? "on" : ""}`;
  refs.btnListen.title = app.listen
    ? "Đang nghe trong app (bấm để tắt)"
    : "Nghe trong app";
  refs.btnLyrics.className = `icon-btn ${app.view === "lyrics" ? "on" : ""}`;
  refs.btnVideo.className = `icon-btn ${app.videoBg ? "on" : ""}`;
  refs.btnVideo.title = app.videoBg
    ? "Đang bật Video Background (player.saveVideo)"
    : "Video Background tắt";
  refs.btnVoiceLink.className = `icon-btn wire-toggle ${app.wiringOpen || s?.linkedVoice ? "on" : ""}`;
  refs.btnVoiceLink.title = s?.linkedVoice
    ? `Đang nối tới #${s.linkedVoice.channelName || "thoại"}`
    : "Nối đầu ra Voice";
  refs.wiringPanel.hidden = !app.wiringOpen;
  refs.wiringPanel.replaceChildren(
    ...(app.wiringOpen ? [renderWiringPanel()] : []),
  );
  refs.wiringBoard = refs.wiringPanel.querySelector(".wiring-board");
  if (app.wiringOpen) requestAnimationFrame(drawWires);
  if (s && document.activeElement !== refs.volume)
    refs.volume.value = Math.min(100, s.volume ?? 80);
  refs.seek.disabled = !track || track.isLive || !s.duration;
  updateProgress();
}

function currentPosition() {
  const s = app.state;
  if (!s) return 0;
  const running = s.isPlaying && !s.isPaused;
  const pos = s.position + (running ? performance.now() - app.receivedAt : 0);
  return s.duration ? Math.min(pos, s.duration) : pos;
}

function updateProgress() {
  const s = app.state;
  if (!s?.currentTrack || dragging) return;
  const pos = currentPosition();
  refs.cur.textContent = s.currentTrack.isLive ? "LIVE" : fmtTime(pos);
  refs.dur.textContent = s.currentTrack.isLive ? "" : fmtTime(s.duration);
  refs.seek.value = s.duration ? Math.round((pos / s.duration) * 1000) : 0;
  updateLyricsSync();
}
setInterval(updateProgress, 250);

/* --------------------------------------------------------------- visualizer */

const bandBuffer = new Float32Array(32);
let bassAvg = 0;

function drawViz() {
  requestAnimationFrame(drawViz);
  const canvas = refs.viz;
  if (!canvas || document.hidden) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const s = app.state;
  const isAudioActive = Boolean(audio && s?.isPlaying && !s.isPaused);
  if (!isAudioActive) {
    document.documentElement.style.setProperty("--music-bass", "0");
    document.documentElement.style.setProperty("--music-energy", "0");
    if (refs.cover) {
      refs.cover.style.transform = "";
      refs.cover.style.filter = "";
    }
    return;
  }

  const bands = audio.getFrequencyBands?.({
    bands: bandBuffer.length,
    minHz: 30,
    maxHz: 16000,
    outputBuffer: bandBuffer,
  });
  if (!bands) return;

  // Calculate reactive parameters
  let bassSum = 0;
  for (let i = 0; i < 5; i++) bassSum += bands[i];
  const bass = Math.min(1, bassSum / 5);

  let totalSum = 0;
  for (let i = 0; i < bands.length; i++) totalSum += bands[i];
  const energy = Math.min(1, totalSum / bands.length);

  // Beat pulse
  bassAvg = bassAvg * 0.9 + bass * 0.1;

  // Update CSS reactive variables (hardware-accelerated GPU styling)
  document.documentElement.style.setProperty("--music-bass", bass.toFixed(3));
  document.documentElement.style.setProperty(
    "--music-energy",
    energy.toFixed(3),
  );

  // 1. Album cover react (pulse on bass)
  if (refs.cover) {
    const scale = 1 + bass * 0.08;
    const glow = Math.round(bass * 20);
    refs.cover.style.transform = `scale(${scale})`;
    refs.cover.style.filter = `drop-shadow(0 0 ${glow}px var(--accent))`;
  }

  // 2. Active lyric line react
  const activeLyric = document.querySelector(".lyric-line.active");
  if (activeLyric) {
    const glow = Math.round(bass * 16);
    const glow2 = Math.round(energy * 24);
    activeLyric.style.textShadow = `0 0 ${glow}px var(--accent-2), 0 0 ${glow2}px var(--accent)`;
  }

  // 3. Draw equalizer bars on canvas
  const gap = 2;
  const barWidth = (width - gap * (bands.length - 1)) / bands.length;
  const accent =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#7c5cff";
  const accent2 =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-2")
      .trim() || "#a78bfa";

  const grad = ctx.createLinearGradient(0, height, 0, 0);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, accent2);
  ctx.fillStyle = grad;

  for (let i = 0; i < bands.length; i++) {
    const barHeight = Math.max(2, bands[i] * height);
    ctx.fillRect(i * (barWidth + gap), height - barHeight, barWidth, barHeight);
  }
}

/* ---------------------------------------------------------------------- boot */

document.addEventListener("keydown", (event) => {
  if (
    event.code === "Space" &&
    !event.target.matches?.("input, textarea, button")
  ) {
    event.preventDefault();
    onPlayPause();
  }
});

document.addEventListener("contextmenu", (event) => event.preventDefault());

function showFatal(message) {
  root.replaceChildren(
    h(
      "div",
      { class: "fatal" },
      h("h1", null, "Zimusix"),
      h("p", null, message),
      h(
        "button",
        { class: "primary", onclick: () => location.reload() },
        "Thử lại",
      ),
    ),
  );
}

/** FFmpeg thiếu thì phần lớn nguồn (file local, seek, filter) sẽ không phát được: báo rõ ngay từ đầu. */
async function checkFfmpeg(health) {
  if (health?.ffmpeg?.ok !== false) return;
  // sidecar có thể đang tự tải binary: kiểm tra lại sau một lúc rồi mới báo
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  const now = await api.get("/health").catch(() => null);
  if (now?.ffmpeg?.ok === false) {
    toast(
      `${now.ffmpeg.error}\nHãy cài FFmpeg vào PATH, hoặc đặt biến môi trường FFMPEG_PATH, rồi mở lại app.`,
      "error",
      30_000,
    );
  }
}

async function boot() {
  let health = null;
  root.replaceChildren(
    h(
      "div",
      { class: "fatal" },
      h("h1", null, "Zimusix"),
      h("p", { id: "boot-msg" }, "Đang khởi động bộ phát nhạc…"),
    ),
  );
  try {
    health = await api.initBackend((attempt) => {
      if (attempt === 6)
        document
          .getElementById("boot-msg")
          ?.replaceChildren(
            "Đang chờ backend ZiPlayer… (lần đầu có thể lâu hơn)",
          );
    });
  } catch (error) {
    showFatal(error.message || String(error));
    return;
  }

  refs.sidebar = h("aside", { class: "sidebar" });
  refs.main = h("main", { class: "main" });
  refs.player = h("footer", { class: "player" });
  root.replaceChildren(refs.sidebar, refs.main, refs.player);
  root.classList.toggle("sidebar-hidden", app.sidebarHidden);

  buildPlayer();
  renderSidebar();
  renderMain();
  updateVideoBg();
  watch();
  drawViz();
  syncAudio();
  setupDragDrop().catch((error) => console.warn("drag-drop:", error));

  checkFfmpeg(health);
  await loadDiscord();
  // Bot tự đăng nhập bằng token đã lưu: poll đến khi xong.
  for (let i = 0; i < 20 && app.discord.status === "connecting"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await loadDiscord();
  }
}

boot();
