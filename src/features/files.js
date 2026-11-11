import * as api from "../api.js";
import { ensureAudio } from "./audio.js";
import { setState } from "./playback.js";
import { AUDIO_EXTENSIONS } from "../lib/constants.js";
import { act, toast } from "../lib/toast.js";
import { app, root } from "../state.js";

async function addLocal(paths) {
  if (!paths?.length) return;
  await ensureAudio();
  const state = await act(
    () => api.post("/play", { target: app.target, paths, mode: app.addMode }),
    (result) => `Đã thêm ${result?.added ?? ""} bài`.replace("  ", " "),
  );
  if (state) setState(state);
}

export async function pickFiles() {
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

export async function pickFolder() {
  if (!api.isTauri())
    return toast("Chọn thư mục chỉ khả dụng trong app Tauri.", "error");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });
  if (picked) await addLocal([picked]);
}

export async function setupDragDrop() {
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
