#!/usr/bin/env node
/**
 * Tools for preset authors.
 *
 *   node scripts/presets.mjs index              update public/presets/index.json (built-in presets list)
 *   node scripts/presets.mjs check [dirs...]    validate presets (default: public/presets/* and docs/preset-template)
 *
 * `check` uses the app's validator (src/presets/schema.js) + physical file checks
 * (preview, style.css, file extensions, size limits) matching sidecar behavior when adding folders.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizePresetCss } from "../src/presets/css.js";
import { DEFAULT_PREVIEW, MANIFEST_FILE, normalizeManifest } from "../src/presets/schema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const builtinDir = path.join(root, "public", "presets");
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
  const result = normalizeManifest(raw);
  errors.push(...result.errors);
  warnings.push(...result.warnings);
  if (!result.ok) return { errors, warnings };
  const m = result.manifest;
  if (m.id !== path.basename(dir)) warnings.push(`Directory name "${path.basename(dir)}" should match id "${m.id}"`);

  const files = walk(dir);
  if (files.length > MAX_FILES) errors.push(`Exceeds maximum of ${MAX_FILES} files`);
  const total = files.reduce((n, f) => n + fs.statSync(f).size, 0);
  if (total > MAX_BYTES) errors.push(`Exceeds ${MAX_BYTES / 1024 / 1024} MB size limit`);
  for (const f of files) {
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

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "index") writeIndex();
else if (cmd === "check") check(rest);
else console.log("Usage: node scripts/presets.mjs index | check [directories...]");
