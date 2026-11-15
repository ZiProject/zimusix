import * as api from "../api.js";
import { act, toast } from "../lib/toast.js";
import { applyPreset, listEntries, reloadEntries } from "../presets/runtime.js";
import { renderMain } from "../ui/main-view.js";

/** Thêm preset từ một thư mục (thư mục preset, hoặc thư mục chứa nhiều preset con). */
export async function importPresetFolder(path) {
  const result = await act(() => api.post("/presets/import", { path }));
  if (!result) return;
  await reloadEntries();
  const names = result.imported.map((p) => p.name).join(", ");
  toast(`Đã thêm preset: ${names}`, "ok");
  for (const failed of result.failed ?? [])
    toast(`${failed.dir}: ${failed.error}`, "error", 9000);
  renderMain();
}

export async function pickPresetFolder() {
  if (!api.isTauri())
    return toast("Chọn thư mục chỉ khả dụng trong app Tauri. Có thể dán đường dẫn vào ô bên dưới.", "error");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false, title: "Chọn thư mục preset" });
  if (picked) await importPresetFolder(Array.isArray(picked) ? picked[0] : picked);
}

export async function removeUserPreset(entry) {
  if (entry.source !== "user") return;
  const done = await act(() => api.post("/presets/remove", { id: entry.id }), `Đã xoá preset "${entry.id}"`);
  if (!done) return;
  await reloadEntries(); // nếu đang dùng preset này, runtime tự về mặc định
  renderMain();
}

export async function usePreset(entry) {
  const ok = await applyPreset(entry.key);
  if (!ok) toast("Preset này không dùng được: " + (entry.errors[0] ?? "lỗi không rõ"), "error");
  return ok;
}

export async function refreshPresets() {
  await reloadEntries();
  renderMain();
  toast(`Đã nạp ${listEntries().length} preset`, "info");
}
