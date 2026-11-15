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
    return toast("Please select an audio source and a target voice channel", "error");
  const state = await act(
    () =>
      api.post("/voice/link", {
        target: sourceTarget,
        guildId,
        channelId,
      }),
    "Connected audio source to Discord Voice",
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
  // Source remains the playing player: do not switch active target or detach app audio.
  // Discord is simply added as an additional output destination for that source.
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

/** Disconnect a Voice output (guildId) from source; omit guildId = disconnect all Voice outputs. */
export async function unlinkVoiceAction(target = app.target, guildId) {
  const state = await act(
    () => api.post("/voice/unlink", { target, guildId }),
    "Disconnected Voice connection",
  );
  if (!state) return;
  rememberState(state);
  for (const related of state.relatedStates ?? []) rememberState(related);
  renderSidebar();
  renderPlayer();
}

/** Disconnect app audio output: stop listening in app, Discord audio continues playing. */
export async function disconnectApp() {
  app.listen = false;
  renderPlayer();
  await syncAudio();
  toast("Disconnected audio from app", "ok");
}

/** Server reports bot lost voice / connection unlinked automatically. Source continues playing normally. */
export async function onVoiceUnlinked({ message, guildId }) {
  toast(message || "Voice connection was disconnected", "info", 6000);
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
    // Clicking/dragging again to connected port = disconnect.
    await disconnectApp();
    return;
  }
  if (sourceTarget !== app.target) await setTarget(sourceTarget);
  app.webAudioSourceTarget = sourceTarget;
  app.listen = true;
  renderPlayer();
  await syncAudio();
  toast("Connected audio source to app", "ok");
}
