import * as api from "../api.js";
import { syncAudio } from "./audio.js";
import { setState, setTarget } from "./playback.js";
import { act, toast } from "../lib/toast.js";
import { app } from "../state.js";
import { renderPlayer } from "../ui/player.js";
import { renderSidebar } from "../ui/sidebar.js";

function rememberState(state) {
  if (!state?.target) return;
  app.stateByTarget[state.target] = state;
  if (state.target !== "local")
    app.voiceByGuild[state.target] = state.voice ?? undefined;
  if (state.target === app.target) setState(state);
}

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
      api.get(`/state?target=${encodeURIComponent(sourceTarget)}`).catch(() => null),
      api.get(`/state?target=${encodeURIComponent(guildId)}`).catch(() => null),
    ]);
    rememberState(sourceState);
    rememberState(destinationState);
    renderSidebar();
    renderPlayer();
    return;
  }
  // Nguồn vẫn là player đang phát: không đổi target, không dời dây của app.
  // Discord chỉ là thêm một đầu ra nữa của cùng nguồn đó.
  rememberState(state);
  rememberState(state.destinationState);
  app.voiceByGuild[guildId] = state.destinationState?.voice ?? {
    channelId,
    channelName: state.linkedVoices?.find((l) => l.guildId === guildId)
      ?.channelName,
  };
  renderSidebar();
  renderPlayer();
}

/** Rút một đầu ra Voice (guildId) khỏi nguồn; bỏ guildId = rút mọi đầu ra của nguồn. */
export async function unlinkVoiceAction(target = app.target, guildId) {
  const state = await act(
    () => api.post("/voice/unlink", { target, guildId }),
    "Đã rút dây kết nối Voice",
  );
  if (!state) return;
  rememberState(state);
  for (const related of state.relatedStates ?? []) rememberState(related);
  renderSidebar();
  renderPlayer();
}

/** Rút dây phía Ứng dụng: ngừng nghe trong app, nhạc ở Discord vẫn chạy. */
export async function disconnectApp() {
  app.listen = false;
  renderPlayer();
  await syncAudio();
  toast("Đã rút dây khỏi ứng dụng", "ok");
}

/** Server báo bot mất voice / dây bị rút tự động. Nguồn vẫn phát bình thường. */
export async function onVoiceUnlinked({ message, guildId }) {
  toast(message || "Dây nối Voice đã được rút", "info", 6000);
  delete app.voiceByGuild[guildId];
  const [local, guild] = await Promise.all([
    api.get("/state?target=local").catch(() => null),
    api.get(`/state?target=${encodeURIComponent(guildId)}`).catch(() => null),
  ]);
  rememberState(local);
  rememberState(guild);
  if (app.webAudioSourceTarget === guildId) {
    app.webAudioSourceTarget = "local";
    if (app.target === guildId) await setTarget("local");
    await syncAudio();
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
