// Media Session & Native SMTC integration:
// In browser mode: HTML5 Media Session API (using silent keepAlive audio to register playback).
// In Tauri desktop: native OS SMTC via Rust backend (souvlaki) bound to the app's HWND,
// preventing WebView2 from showing "Unknown app".
import * as api from "../api.js";
import { app } from "../state.js";
import { ensureAudio } from "./audio.js";
import { control } from "./playback.js";

const SEEK_STEP_MS = 10_000;

let keepAlive = null;
let lastTrackKey = null;
let lastTooltip = null;
let nativeInitialized = false;

/** Silent 8-bit mono WAV (value 128 = 0 for unsigned 8-bit PCM). */
function silentWavUrl(seconds = 10, sampleRate = 8000) {
  const dataLength = seconds * sampleRate;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);
  const text = (offset, value) =>
    [...value].forEach((ch, i) => view.setUint8(offset + i, ch.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  text(36, "data");
  view.setUint32(40, dataLength, true);
  new Uint8Array(buffer, 44).fill(128);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function position() {
  const s = app.state;
  if (!s) return 0;
  const running = s.isPlaying && !s.isPaused;
  const pos = s.position + (running ? performance.now() - app.receivedAt : 0);
  return s.duration ? Math.min(pos, s.duration) : pos;
}

function setHandler(action, handler) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // WebView does not support this action: ignore
  }
}

async function initNativeEvents() {
  if (nativeInitialized) return;
  nativeInitialized = true;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen("native-media-play", async () => {
      await ensureAudio();
      control("resume");
    });
    await listen("native-media-pause", () => control("pause"));
    await listen("native-media-toggle", async () => {
      const s = app.state;
      if (s?.isPlaying && !s?.isPaused) {
        control("pause");
      } else {
        await ensureAudio();
        control("resume");
      }
    });
    await listen("native-media-next", () => control("skip"));
    await listen("native-media-previous", () => control("previous"));
    await listen("native-media-seek", (event) => {
      if (typeof event.payload === "number") {
        control("seek", { positionMs: event.payload });
      }
    });
  } catch (err) {
    console.warn("native media events:", err);
  }
}

export function initMediaSession() {
  if (api.isTauri()) {
    initNativeEvents();
    return;
  }

  if (!("mediaSession" in navigator)) return;

  keepAlive = new Audio(silentWavUrl());
  keepAlive.loop = true;
  keepAlive.volume = 0.01; // still silent (all zeros) but not treated as "muted"

  setHandler("play", async () => {
    await ensureAudio();
    control("resume");
  });
  setHandler("pause", () => control("pause"));
  setHandler("stop", () => control("pause"));
  setHandler("previoustrack", () => control("previous"));
  setHandler("nexttrack", () => control("skip"));
  setHandler("seekto", (details) => {
    if (details.seekTime != null)
      control("seek", { positionMs: details.seekTime * 1000 });
  });
  setHandler("seekbackward", (details) =>
    control("seek", {
      positionMs: Math.max(
        0,
        position() - (details.seekOffset ?? SEEK_STEP_MS / 1000) * 1000,
      ),
    }),
  );
  setHandler("seekforward", (details) => {
    const duration = app.state?.duration ?? Infinity;
    control("seek", {
      positionMs: Math.min(
        duration,
        position() + (details.seekOffset ?? SEEK_STEP_MS / 1000) * 1000,
      ),
    });
  });
}

function artworkFor(track) {
  const fallback = new URL("/logo.png", location.href).href;
  return [{ src: track?.thumbnail || fallback }];
}

async function syncNativeMedia(track, playing, posMs, durationMs) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = {
      title: track?.title || "Zimusix",
      artist: track?.author || "Zimusix",
      album: "Zimusix",
      artwork: track?.thumbnail || null,
      duration_ms:
        track && !track.isLive && durationMs > 0
          ? Math.round(durationMs)
          : null,
      position_ms: track ? Math.round(posMs) : null,
      playing,
    };
    await invoke("update_native_media", { payload });
  } catch {
    // non-critical
  }
}

/** Called whenever player state updates (renderPlayer). Cheap: only updates metadata when track changes. */
export function syncMediaSession() {
  const s = app.state;
  const track = s?.currentTrack;
  const playing = Boolean(track && s.isPlaying && !s.isPaused);
  const pos = position();

  if (api.isTauri()) {
    syncNativeMedia(track, playing, pos, s?.duration);
    syncTrayTooltip(track, playing);
    return;
  }

  if (!("mediaSession" in navigator)) return;

  if ((track?.key ?? null) !== lastTrackKey) {
    lastTrackKey = track?.key ?? null;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({
          title: track.title || "Zimusix",
          artist: track.author || "Zimusix",
          album: "Zimusix",
          artwork: artworkFor(track),
        })
      : null;
  }

  navigator.mediaSession.playbackState = track
    ? playing
      ? "playing"
      : "paused"
    : "none";

  try {
    if (track && !track.isLive && s.duration > 0) {
      navigator.mediaSession.setPositionState({
        duration: s.duration / 1000,
        position: Math.min(pos, s.duration) / 1000,
        playbackRate: 1,
      });
    } else {
      navigator.mediaSession.setPositionState();
    }
  } catch {
    // temporary invalid values (e.g. duration not yet available): ignore
  }

  if (keepAlive) {
    if (playing && keepAlive.paused) keepAlive.play().catch(() => {});
    else if (!playing && !keepAlive.paused) keepAlive.pause();
  }

  syncTrayTooltip(track, playing);
}

/** Tooltip when hovering over system tray icon. */
async function syncTrayTooltip(track, playing) {
  if (!api.isTauri()) return;
  const text = track
    ? `${playing ? "▶" : "⏸"} ${track.title}${track.author ? ` — ${track.author}` : ""}`
    : "Zimusix";
  if (text === lastTooltip) return;
  lastTooltip = text;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_tray_tooltip", { text });
  } catch {
    // non-critical
  }
}
