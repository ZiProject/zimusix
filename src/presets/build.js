/**
 * Assemble a whole preset from its folder's files (PURE — used by the app loader, scripts/ and tests).
 *
 *   preset.json  → values + settings       modules.json → schema      hooks.json → signals/bind/rules
 *   draw.json    → custom visualizers/backgrounds
 *
 * Never throws: `{ ok, errors, warnings, manifest, logic, draw }`.
 */
import { buildDraw } from "./draw.js";
import { buildLogic } from "./logic.js";
import { ENGINE, buildModules, isObject, normalizeManifest } from "./schema.js";

/**
 * @param {{ manifest: any, modules?: any, hooks?: any, draw?: any }} files  parsed JSON of each file (undefined if absent)
 * @param {{ core?: object, extraRoots?: string[] }} [options]  `core` = parsed public/schema/core.json
 */
export function buildPreset(files, { core, extraRoots = [] } = {}) {
  const errors = [];
  const warnings = [];
  const raw = files.manifest;
  if (!isObject(raw)) return { ok: false, errors: ["preset.json must be a JSON object"], warnings, manifest: null, logic: null, draw: null };

  const mod = buildModules(files.modules, core);
  warnings.push(...mod.warnings.map((w) => `modules.json: ${w}`));
  if (!mod.ok) return { ok: false, errors: mod.errors, warnings, manifest: null, logic: null, draw: null };

  const res = normalizeManifest(raw, { modules: mod.modules });
  errors.push(...res.errors);
  warnings.push(...res.warnings);
  if (!res.ok) return { ok: false, errors, warnings, manifest: null, logic: null, draw: null };
  const manifest = res.manifest;

  const draw = buildDraw(files.draw, { extraRoots });
  warnings.push(...draw.warnings.map((w) => `draw.json: ${w}`));
  const logic = buildLogic(files.hooks, { modules: mod.modules, extraRoots });
  warnings.push(...logic.warnings.map((w) => `hooks.json: ${w}`));
  if (!logic.ok) errors.push(...logic.errors);
  if (errors.length) return { ok: false, errors, warnings, manifest: null, logic: null, draw: null };

  // Cross checks: selectable renderers must exist.
  const viz = mod.modules.sections.visualizer?.params.type;
  if (viz?.type === "enum")
    for (const v of viz.values)
      if (!ENGINE.visualizers.includes(v) && !draw.draw.visualizers[v]) warnings.push(`visualizer.type "${v}" is selectable but neither the app nor draw.json provides it`);
  const bg = mod.modules.sections.background?.params.effect;
  if (bg?.type === "enum" && !manifest.style)
    for (const v of bg.values)
      if (!ENGINE.backgrounds.includes(v) && !draw.draw.backgrounds[v]) warnings.push(`background.effect "${v}" is selectable but neither the app, draw.json nor a style.css provides it`);

  return { ok: true, errors, warnings, manifest, logic: logic.logic, draw: draw.draw };
}
