#!/usr/bin/env node
/**
 * Tools for preset authors.
 *
 *   node scripts/presets.mjs index              update public/presets/index.json (built-in presets list)
 *   node scripts/presets.mjs check [dirs...]    validate presets (default: public/presets/* and docs/preset-template)
 *   node scripts/presets.mjs eject <dir>        copy the full core schema into <dir>/modules.json (and point preset.json at it)
 *   node scripts/presets.mjs hooks              print every hook (live value) presets can read
 *
 * `check` uses the app's validator (src/presets/schema.js) + physical file checks
 * (preview, style.css, file extensions, size limits) matching sidecar behavior when adding folders.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizePresetCss } from "../src/presets/css.js";
import { buildPreset } from "../src/presets/build.js";
import { HOOK_ROOTS } from "../src/presets/hook-catalog.js";
import { DEFAULT_PREVIEW, MANIFEST_FILE } from "../src/presets/schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builtinDir = path.join(root, "public", "presets");
const corePath = path.join(root, "public", "schema", "core.json");
const core = JSON.parse(fs.readFileSync(corePath, "utf8"));
const ALLOWED = new Set([".json", ".css", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".svg", ".woff", ".woff2", ".ttf", ".otf", ".mp4", ".webm", ".md", ".txt"]);
const MAX_BYTES = 30 * 1024 * 1024;
const MAX_FILES = 200;

const presetDirs = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, MANIFEST_FILE))).map((e) => e.name)
    : [];

function writeIndex() {
  const ids = presetDirs(builtinDir).sort((a, b) => (a === "classic" ? -1 : b === "classic" ? 1 : a.localeCompare(b)));
  const next = JSON.stringify({ presets: ids }, null, 2) + "\n";
  const file = path.join(builtinDir, "index.json");
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== next) fs.writeFileSync(file, next);
  console.log(`index.json: ${ids.length} presets (${ids.join(", ")})`);
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

/** @returns {{errors: string[], warnings: string[]}} */
function checkOne(dir) {
  const errors = [];
  const warnings = [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST_FILE), "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    return { errors: [`${MANIFEST_FILE}: ${e.message}`], warnings };
  }
  const readJson = (rel) => {
    try {
      return { value: JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8").replace(/^\uFEFF/, "")) };
    } catch (e) {
      return { error: `${rel}: ${e.message}` };
    }
  };
  const files = { manifest: raw };
  for (const field of ["modules", "hooks", "draw"]) {
    if (typeof raw[field] !== "string") continue;
    const r = readJson(raw[field]);
    if (r.error) errors.push(r.error);
    else files[field] = r.value;
  }
  const result = buildPreset(files, { core });
  errors.push(...result.errors);
  warnings.push(...result.warnings);
  if (!result.ok) return { errors, warnings };
  const m = result.manifest;
  if (m.id !== path.basename(dir)) warnings.push(`Directory name "${path.basename(dir)}" should match id "${m.id}"`);
  if (!m.files.modules) warnings.push('No "modules" file: the preset uses the shared core schema. Run `node scripts/presets.mjs eject <dir>` to own and extend it.');
  // asset parameters must point at real files
  for (const [sname, sec] of Object.entries(m.modules.sections))
    for (const [key, spec] of Object.entries(sec.params))
      if (spec.type === "asset" && m.sections[sname][key] && !fs.existsSync(path.join(dir, m.sections[sname][key])))
        errors.push(`${sname}.${key}: asset file "${m.sections[sname][key]}" not found`);
  for (const f of m.fonts) if (!fs.existsSync(path.join(dir, f.file))) errors.push(`fonts: file "${f.file}" not found`);

  const allFiles = walk(dir);
  if (allFiles.length > MAX_FILES) errors.push(`Exceeds maximum of ${MAX_FILES} files`);
  const total = allFiles.reduce((n, f) => n + fs.statSync(f).size, 0);
  if (total > MAX_BYTES) errors.push(`Exceeds ${MAX_BYTES / 1024 / 1024} MB size limit`);
  for (const f of allFiles) {
    const ext = path.extname(f).toLowerCase();
    if (!ALLOWED.has(ext) && !["thumbs.db", "desktop.ini", ".ds_store"].includes(path.basename(f).toLowerCase()))
      errors.push(`Disallowed file: ${path.relative(dir, f)} (${ext || "no extension"})`);
  }
  if (!fs.existsSync(path.join(dir, m.preview)))
    (m.previewDeclared || true) && warnings.push(`Missing preview image "${m.preview}" (default ${DEFAULT_PREVIEW}, recommended 640×360)`);
  if (m.style) {
    const cssFile = path.join(dir, m.style);
    if (!fs.existsSync(cssFile)) errors.push(`Style file not found "${m.style}"`);
    else {
      const { notes } = sanitizePresetCss(fs.readFileSync(cssFile, "utf8"), (r) => r, path.dirname(m.style) === "." ? "" : path.dirname(m.style));
      for (const n of notes) warnings.push(`${m.style}: ${n}`);
    }
  }
  return { errors, warnings };
}

function check(args) {
  const targets = args.length
    ? args.map((a) => path.resolve(a))
    : [...presetDirs(builtinDir).map((n) => path.join(builtinDir, n)), path.join(root, "docs", "preset-template")];
  let bad = 0;
  for (const dir of targets) {
    if (!fs.existsSync(path.join(dir, MANIFEST_FILE))) {
      // directory containing multiple presets
      const kids = presetDirs(dir);
      if (!kids.length) {
        console.log(`✗ ${dir}: missing ${MANIFEST_FILE}`);
        bad++;
        continue;
      }
      for (const k of kids) targets.push(path.join(dir, k));
      continue;
    }
    const { errors, warnings } = checkOne(dir);
    const label = path.relative(root, dir) || dir;
    console.log(`${errors.length ? "✗" : "✓"} ${label}`);
    for (const e of errors) console.log(`    error: ${e}`);
    for (const w of warnings) console.log(`    warning: ${w}`);
    if (errors.length) bad++;
  }
  if (bad) process.exitCode = 1;
}

function eject(args) {
  const dir = path.resolve(args[0] ?? "");
  const file = path.join(dir, MANIFEST_FILE);
  if (!args[0] || !fs.existsSync(file)) return console.log("Usage: node scripts/presets.mjs eject <preset-dir>");
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const target = path.join(dir, "modules.json");
  if (fs.existsSync(target)) return console.log("modules.json already exists — nothing to do");
  fs.writeFileSync(target, JSON.stringify({ ...core, pack: path.basename(dir) }, null, 2) + "\n");
  if (!manifest.modules) {
    let text = fs.readFileSync(file, "utf8");
    manifest.schema = 2;
    text = text.replace(/"schema":\s*1/, '"schema": 2').replace(/(\n\s*)"id":/, '$1"modules": "modules.json",$1"id":');
    try {
      JSON.parse(text);
      fs.writeFileSync(file, text);
    } catch {
      console.log('Add  "modules": "modules.json"  to preset.json yourself.');
    }
  }
  console.log(`Wrote ${path.relative(root, target)} — edit it to add sections/parameters or change ranges and enum values.`);
}

function listHooks() {
  for (const [name, spec] of Object.entries(HOOK_ROOTS)) {
    console.log(`\n${name}  [${spec.cost}]  ${spec.doc}`);
    for (const [field, doc] of Object.entries(spec.fields ?? {})) console.log(`  ${name}.${field.padEnd(14)} ${doc}`);
  }
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "index") writeIndex();
else if (cmd === "check") check(rest);
else if (cmd === "eject") eject(rest);
else if (cmd === "hooks") listHooks();
else console.log("Usage: node scripts/presets.mjs index | check [directories...] | eject <dir> | hooks");
