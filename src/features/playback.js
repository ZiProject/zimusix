import * as api from "../api.js";
import { ensureAudio, syncAudio } from "./audio.js";
import { updateVideoBg } from "./background.js";
import { loadLyrics, resetLyricsSync } from "./lyrics.js";
import { onVoiceUnlinked } from "./voice.js";
import { act, toast } from "../lib/toast.js";
import { app } from "../state.js";
import { renderMain } from "../ui/main-view.js";
import { renderPlayer } from "../ui/player.js";
import { renderSidebar } from "../ui/sidebar.js";

let stopWatching = null;

export function setState(state) {
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
    resetLyricsSync();
    loadLyrics();
  }
  if (
    ["queue", "related"].includes(app.view) ||
    (app.view === "lyrics" && trackChanged)
  ) {
    renderMain();
  }
}

export function watch() {
  stopWatching?.();
  app.state = null;
  stopWatching = api.watchState(
    app.target,
    setState,
    ({ message, track }) =>
      toast(
        track ? `${track}: ${message}` : message,
        "error",
        10_000,
        "angry",
      ),
    onVoiceUnlinked,
  );
}

export async function setTarget(target) {
  if (target === app.target) return;
  app.target = target;
  resetLyricsSync();
  watch();
  renderSidebar();
  renderPlayer();
  updateVideoBg();
  loadLyrics();
  if (["queue", "related", "lyrics"].includes(app.view))
    renderMain();
  await syncAudio();
}

export const control = (action, extra = {}) =>
  act(async () => {
    const state = await api.post("/control", {
      target: app.target,
      action,
      ...extra,
    });
    setState(state);
    return state;
  });

export async function playTrack(track, mode) {
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
