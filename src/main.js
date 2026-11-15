import "./styles/index.css";
import "./events.js";
import * as api from "./api.js";
import { syncAudio } from "./features/audio.js";
import { applyBackgroundEffect } from "./features/background.js";
import { loadDiscord, loadRpc } from "./features/discord.js";
import { setupDragDrop } from "./features/files.js";
import { loadLyrics, lyricsOnScreen } from "./features/lyrics.js";
import { initMediaSession } from "./features/media-session.js";
import { watch } from "./features/playback.js";
import { h } from "./lib/dom.js";
import { setupTray } from "./features/window.js";
import { toast } from "./lib/toast.js";
import { initPresets, onPresetChange } from "./presets/runtime.js";
import { app, refs, root } from "./state.js";
import { renderMain } from "./ui/main-view.js";
import { mascotImg } from "./ui/mascot.js";
import { buildPlayer, renderPlayer } from "./ui/player.js";
import { renderSidebar } from "./ui/sidebar.js";
import { drawViz } from "./ui/visualizer.js";

function showFatal(message) {
  root.replaceChildren(
    h(
      "div",
      { class: "fatal" },
      mascotImg("error", "fatal-mascot"),
      h("h1", { class: "brand-name" }, "Zimusix"),
      h("p", null, message),
      h(
        "button",
        { class: "primary", onclick: () => location.reload() },
        "Retry",
      ),
    ),
  );
}

/** If FFmpeg is missing, most sources (local files, seek, filters) cannot play: report clearly up front. */
async function checkFfmpeg(health) {
  if (health?.ffmpeg?.ok !== false) return;
  // Sidecar might be auto-downloading binary: re-check after delay before notifying
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  const now = await api.get("/health").catch(() => null);
  if (now?.ffmpeg?.ok === false) {
    toast(
      `${now.ffmpeg.error}\nPlease install FFmpeg to PATH, or set the FFMPEG_PATH environment variable, then restart the app.`,
      "error",
      30_000,
      "error",
    );
  }
}

async function boot() {
  let health = null;
  root.replaceChildren(
    h(
      "div",
      { class: "fatal" },
      mascotImg("loading", "fatal-mascot"),
      h("h1", { class: "brand-name" }, "Zimusix"),
      h("p", { id: "boot-msg" }, "Starting music player…"),
    ),
  );
  try {
    health = await api.initBackend((attempt) => {
      if (attempt === 6)
        document
          .getElementById("boot-msg")
          ?.replaceChildren(
            "Waiting for ZiPlayer backend… (first run may take longer)",
          );
    });
  } catch (error) {
    showFatal(error.message || String(error));
    return;
  }

  // Presets (layout, cover, background, visualizer, lyrics...) must be ready before rendering UI.
  // Preset errors must not block the app: runtime falls back to default preset (classic).
  try {
    await initPresets();
  } catch (error) {
    console.warn("[presets] initialization failed, using default:", error);
  }

  refs.sidebar = h("aside", { class: "sidebar" });
  refs.main = h("main", { class: "main" });
  refs.player = h("footer", { class: "player" });
  root.replaceChildren(refs.sidebar, refs.main, refs.player);
  root.classList.toggle("sidebar-hidden", app.sidebarHidden);
  root.classList.toggle("content-hidden", app.contentHidden);

  initMediaSession();
  setupTray();
  buildPlayer();
  renderSidebar();
  renderMain();
  applyBackgroundEffect();
  onPresetChange((_config, { reason }) => {
    root.classList.toggle("sidebar-hidden", app.sidebarHidden);
    applyBackgroundEffect();
    renderPlayer();
    renderSidebar();
    // Keep page intact while dragging sliders
    if (reason !== "setting") renderMain();
    if (lyricsOnScreen()) loadLyrics();
  });
  watch();
  drawViz();
  syncAudio();
  setupDragDrop().catch((error) => console.warn("drag-drop:", error));

  checkFfmpeg(health);
  await loadDiscord();
  await loadRpc();
  // Bot auto-login using saved token: poll until done.
  for (let i = 0; i < 20 && app.discord.status === "connecting"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await loadDiscord();
  }
}

boot();
