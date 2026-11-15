import * as api from "../api.js";
import { act } from "../lib/toast.js";
import { root } from "../state.js";
import { onPlayPause } from "../ui/player.js";

export async function toggleFullscreen() {
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

/** System tray menu (Rust) emits "tray-play-pause" event on "Play / Pause" click. */
export async function setupTray() {
  if (!api.isTauri()) return;
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen("tray-play-pause", () => onPlayPause());
  } catch (error) {
    console.warn("tray:", error);
  }
}
