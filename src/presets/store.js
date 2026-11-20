/** Persist preset choice + user customized values (localStorage). */
const KEY = "zimusix-preset";

export const DEFAULT_PRESET_KEY = "classic";

/**
 * @returns {{ active: string,
 *             values: Record<string, Record<string, any>>,     per preset: { [settingKey]: value }
 *             overrides: Record<string, Record<string, any>> }} per preset: { "section.param": value } (advanced editor)
 */
export function loadPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    return {
      active: typeof raw.active === "string" ? raw.active : DEFAULT_PRESET_KEY,
      values: obj(raw.values),
      overrides: obj(raw.overrides),
    };
  } catch {
    return { active: DEFAULT_PRESET_KEY, values: {}, overrides: {} };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch (_) {}
}
