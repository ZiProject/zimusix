import * as api from "../api.js";
import { act } from "../lib/toast.js";
import { root } from "../state.js";

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
