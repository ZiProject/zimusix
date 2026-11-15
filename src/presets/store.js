/** Lưu lựa chọn preset + giá trị tuỳ chỉnh của người dùng (localStorage). */
const KEY = "zimusix-preset";

export const DEFAULT_PRESET_KEY = "classic";

/** @returns {{ active: string, values: Record<string, Record<string, any>> }} */
export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      active: typeof raw.active === "string" ? raw.active : DEFAULT_PRESET_KEY,
      values: raw.values && typeof raw.values === "object" ? raw.values : {},
    };
  } catch {
    return { active: DEFAULT_PRESET_KEY, values: {} };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (_) {}
}
