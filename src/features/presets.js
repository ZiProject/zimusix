import * as api from "../api.js";
import { act, toast } from "../lib/toast.js";
import { applyPreset, listEntries, reloadEntries } from "../presets/runtime.js";
import { renderMain } from "../ui/main-view.js";

/** Add presets from a directory (single preset folder or directory containing multiple preset folders). */
export async function importPresetFolder(path) {
  const result = await act(() => api.post("/presets/import", { path }));
  if (!result) return;
  await reloadEntries();
  const names = result.imported.map((p) => p.name).join(", ");
  toast(`Preset added: ${names}`, "ok");
  for (const failed of result.failed ?? [])
    toast(`${failed.dir}: ${failed.error}`, "error", 9000);
  renderMain();
}

export async function pickPresetFolder() {
  if (!api.isTauri())
    return toast("Folder selection is only available in the Tauri app. You can paste the path below.", "error");
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false, title: "Select preset folder" });
  if (picked) await importPresetFolder(Array.isArray(picked) ? picked[0] : picked);
}

export async function removeUserPreset(entry) {
  if (entry.source !== "user") return;
  const done = await act(() => api.post("/presets/remove", { id: entry.id }), `Deleted preset "${entry.id}"`);
  if (!done) return;
  await reloadEntries(); // if currently using this preset, runtime falls back to default
  renderMain();
}

export async function usePreset(entry) {
  const ok = await applyPreset(entry.key);
  if (!ok) toast("Preset could not be used: " + (entry.errors[0] ?? "unknown error"), "error");
  return ok;
}

export async function refreshPresets() {
  await reloadEntries();
  renderMain();
  toast(`Loaded ${listEntries().length} preset(s)`, "info");
}
