import * as api from "../api.js";
import { syncAudio } from "./audio.js";
import { setState, setTarget } from "./playback.js";
import { act, toast } from "../lib/toast.js";
import { app } from "../state.js";
import { renderPlayer } from "../ui/player.js";
import { renderSidebar } from "../ui/sidebar.js";

export async function linkVoiceAction(sourceTarget, guildId, channelId) {
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
  // Bài được chuyển sang player của guild: nếu app đang nghe nguồn cũ thì dời dây
  // sang player mới để app + Discord cùng phát, không bị im lặng.
  if (app.listen && app.webAudioSourceTarget === sourceTarget)
    app.webAudioSourceTarget = activeTarget;
  if (activeTarget !== app.target) await setTarget(activeTarget);
  await syncAudio();
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

export async function unlinkVoiceAction(target = app.target) {
  const state = await act(
    () => api.post("/voice/unlink", { target }),
    "Đã rút dây kết nối Voice",
  );
  if (!state) return;
  app.stateByTarget[target] = state;
  if (state.relatedState)
    app.stateByTarget[state.relatedState.target] = state.relatedState;
  if (state.restoredTo) await followRestoredPlayback(state.restoredTo);
  if (state.target === app.target) setState(state);
  renderSidebar();
  renderPlayer();
}

/** Bài đã được trả về player local (rút dây voice): app tiếp tục nghe, không bị im. */
async function followRestoredPlayback(restoredTo) {
  if (app.listen && app.webAudioSourceTarget !== restoredTo)
    app.webAudioSourceTarget = restoredTo;
  if (app.target !== restoredTo) await setTarget(restoredTo);
  await syncAudio();
}

/** Rút dây phía Ứng dụng: ngừng nghe trong app, nhạc ở Discord vẫn chạy. */
export async function disconnectApp() {
  app.listen = false;
  renderPlayer();
  await syncAudio();
  toast("Đã rút dây khỏi ứng dụng", "ok");
}

/** Server báo bot mất voice / dây bị rút tự động. */
export async function onVoiceUnlinked({ message, guildId }) {
  toast(message || "Dây nối Voice đã được rút", "info", 6000);
  delete app.voiceByGuild[guildId];
  const refreshed = await act(() => api.get("/state?target=local"));
  if (refreshed) {
    app.stateByTarget.local = refreshed;
    if (app.webAudioSourceTarget === guildId) {
      app.webAudioSourceTarget = "local";
      if (app.target === guildId) await setTarget("local");
      await syncAudio();
    }
    if (app.target === "local") setState(refreshed);
  }
  renderSidebar();
  renderPlayer();
}

export async function connectToApp(sourceTarget) {
  if (app.listen && app.webAudioSourceTarget === sourceTarget) {
    // Kéo/bấm lại vào cổng đã nối = rút dây.
    await disconnectApp();
    return;
  }
  if (sourceTarget !== app.target) await setTarget(sourceTarget);
  app.webAudioSourceTarget = sourceTarget;
  app.listen = true;
  renderPlayer();
  await syncAudio();
  toast("Đã nối nguồn phát tới ứng dụng", "ok");
}
