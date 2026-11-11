import { WebAudioClient } from "@ziplayer/client";
import * as api from "../api.js";
import { app } from "../state.js";

export let audio = null;

let audioTarget = null;

let audioBusy = false;

let reconnectTimer = null;

export async function syncAudio() {
  if (audioBusy) return;
  const want = app.listen ? app.webAudioSourceTarget : null;
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

export async function ensureAudio() {
  await syncAudio();
  resumeAudio();
}

// WebView có thể chặn AudioContext tới khi người dùng chạm vào app.
document.addEventListener("pointerdown", () => ensureAudio(), {
  capture: true,
});
