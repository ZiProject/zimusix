"use strict";
/**
 * User preset store manager.
 *
 *   <DATA_DIR>/presets/<id>/preset.json   ← each installed preset is a directory
 *
 * When user "adds folder" → sidecar validates then COPIES it into <DATA_DIR>/presets
 * (preset continues working if original folder is deleted/moved). Presets are declarative data:
 * only JSON, CSS, images, fonts, video, and documents are allowed — NO JS/HTML.
 *
 * Detailed specification: docs/PRESETS.md
 */
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_FILE = "preset.json";
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/;
const SCHEMA_VERSION = 2;

const LIMITS = {
  files: 200,
  bytes: 30 * 1024 * 1024,
  depth: 6,
  manifestBytes: 128 * 1024,
  presetsPerImport: 50,
};

/** Allowed file extensions + MIME when serving. */
const MIME = {
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** OS generated files: silently ignore. */
const IGNORED = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);

class PresetError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const isInside = (parent, child) => {
  const rel = path.relative(parent, child);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/** Normalize posix relative path; return null if unsafe. */
function safeRelPath(input) {
  if (typeof input !== "string" || !input || input.length > 200) return null;
  if (input.includes("\0") || input.includes("\\") || input.includes(":"))
    return null;
  if (input.startsWith("/")) return null;
  const normalized = path.posix.normalize(input);
  if (normalized === "." || normalized.startsWith("../") || normalized === "..")
    return null;
  return normalized;
}

function readManifest(dir) {
  const file = path.join(dir, MANIFEST_FILE);
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new PresetError(`Missing ${MANIFEST_FILE} in "${dir}"`, 422);
  }
  if (!stat.isFile() || stat.size > LIMITS.manifestBytes)
    throw new PresetError(
      `${MANIFEST_FILE} is invalid or too large (> ${LIMITS.manifestBytes / 1024} KB)`,
      422,
    );
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new PresetError(`${MANIFEST_FILE} has invalid JSON syntax: ${error.message}`, 422);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    throw new PresetError(`${MANIFEST_FILE} must be a JSON object`, 422);
  if (typeof manifest.id !== "string" || !ID_RE.test(manifest.id))
    throw new PresetError(
      'Field "id" must consist of lowercase letters, numbers, "-" or "_" (2–48 characters, starting with alphanumeric)',
      422,
    );
  if (typeof manifest.name !== "string" || !manifest.name.trim())
    throw new PresetError('Missing "name" field', 422);
  if (
    manifest.schema !== undefined &&
    (!Number.isInteger(manifest.schema) || manifest.schema > SCHEMA_VERSION)
  )
    throw new PresetError(
      `Preset uses schema ${manifest.schema}, but this app only supports up to ${SCHEMA_VERSION}`,
      422,
    );
  return manifest;
}

const COMPANION_BYTES = 256 * 1024;

/** `modules`, `hooks`, `draw` name JSON files in the preset folder: they must exist, be small and parse. */
function checkCompanions(src, manifest) {
  for (const field of ["modules", "hooks", "draw"]) {
    const rel = manifest[field];
    if (rel === undefined) continue;
    if (
      typeof rel !== "string" ||
      !rel.endsWith(".json") ||
      path.isAbsolute(rel) ||
      rel.split(/[\\/]/).includes("..")
    )
      throw new PresetError(`Field "${field}" must be a relative path to a .json file`, 422);
    const file = path.join(src, rel);
    if (!fs.existsSync(file)) throw new PresetError(`"${field}" file not found: ${rel}`, 422);
    if (fs.statSync(file).size > COMPANION_BYTES)
      throw new PresetError(`${rel} is too large (> ${COMPANION_BYTES / 1024} KB)`, 422);
    try {
      JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    } catch (error) {
      throw new PresetError(`${rel} has invalid JSON syntax: ${error.message}`, 422);
    }
  }
}

/** Traverse directory, check limits and file extensions. Returns list of files to copy. */
function collectFiles(root) {
  const files = [];
  let bytes = 0;
  const walk = (dir, depth) => {
    if (depth > LIMITS.depth)
      throw new PresetError(`Folder nested deeper than ${LIMITS.depth} levels`, 422);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const lower = entry.name.toLowerCase();
      if (IGNORED.has(lower)) continue;
      if (entry.isSymbolicLink())
        throw new PresetError(`Symbolic links (symlinks) are not allowed: ${entry.name}`, 422);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(lower);
      if (!MIME[ext])
        throw new PresetError(
          `File "${path.relative(root, full)}" has a disallowed extension (${ext || "none"}). ` +
            "Preset only allows: " +
            Object.keys(MIME).join(", "),
          422,
        );
      const size = fs.statSync(full).size;
      bytes += size;
      files.push({ full, rel: path.relative(root, full), size });
      if (files.length > LIMITS.files)
        throw new PresetError(`Preset has more than ${LIMITS.files} files`, 422);
      if (bytes > LIMITS.bytes)
        throw new PresetError(
          `Preset size exceeds ${Math.round(LIMITS.bytes / 1024 / 1024)} MB`,
          422,
        );
    }
  };
  walk(root, 0);
  return files;
}

function createPresetStore(dataDir) {
  const root = path.join(dataDir, "presets");
  fs.mkdirSync(root, { recursive: true });

  const dirOf = (id) => path.join(root, id);

  /** List installed presets. Broken presets are still listed with `error` so UI allows deleting. */
  function list() {
    const items = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      try {
        const manifest = readManifest(dirOf(entry.name));
        items.push({ id: entry.name, manifest });
      } catch (error) {
        items.push({ id: entry.name, error: error.message });
      }
    }
    return items.sort((a, b) => a.id.localeCompare(b.id));
  }

  function installOne(src) {
    const manifest = readManifest(src);
    checkCompanions(src, manifest);
    const files = collectFiles(src);
    const id = manifest.id;
    const target = dirOf(id);
    const temp = path.join(root, `.tmp-${id}-${process.pid}-${Date.now()}`);
    try {
      for (const file of files) {
        const out = path.join(temp, file.rel);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.copyFileSync(file.full, out);
      }
      fs.rmSync(target, { recursive: true, force: true });
      fs.renameSync(temp, target);
    } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true });
      throw error;
    }
    return { id, name: String(manifest.name), files: files.length };
  }

  /**
   * Add preset from a folder. `src` can be:
   *   - a preset folder (containing preset.json), or
   *   - a folder containing multiple preset subfolders (each with preset.json).
   */
  function importFrom(src) {
    if (typeof src !== "string" || !path.isAbsolute(src))
      throw new PresetError("Absolute path to preset folder is required");
    let resolved;
    try {
      resolved = fs.realpathSync(src);
    } catch {
      throw new PresetError("Selected folder not found", 404);
    }
    if (!fs.statSync(resolved).isDirectory())
      throw new PresetError("Path must be a directory");
    const realRoot = fs.realpathSync(root);
    if (resolved === realRoot || isInside(realRoot, resolved))
      throw new PresetError(
        "This folder is already inside the app's preset store. Please select the original preset folder.",
      );

    let candidates = [];
    if (fs.existsSync(path.join(resolved, MANIFEST_FILE))) {
      candidates = [resolved];
    } else {
      candidates = fs
        .readdirSync(resolved, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => path.join(resolved, e.name))
        .filter((dir) => fs.existsSync(path.join(dir, MANIFEST_FILE)))
        .slice(0, LIMITS.presetsPerImport);
    }
    if (!candidates.length)
      throw new PresetError(
        `Could not find ${MANIFEST_FILE} in this folder or its subfolders`,
        422,
      );

    const imported = [];
    const failed = [];
    for (const dir of candidates) {
      try {
        imported.push(installOne(dir));
      } catch (error) {
        failed.push({ dir: path.basename(dir), error: error.message });
      }
    }
    if (!imported.length)
      throw new PresetError(failed.map((f) => `${f.dir}: ${f.error}`).join("\n"), 422);
    return { imported, failed };
  }

  function remove(id) {
    if (typeof id !== "string" || !ID_RE.test(id))
      throw new PresetError("Invalid preset id");
    const dir = dirOf(id);
    if (!fs.existsSync(dir)) throw new PresetError("Preset not found", 404);
    fs.rmSync(dir, { recursive: true, force: true });
    return { removed: id };
  }

  /** Find file inside preset; reject any path escaping the preset directory. */
  function resolveFile(id, rel) {
    if (typeof id !== "string" || !ID_RE.test(id))
      throw new PresetError("Invalid preset id");
    const safe = safeRelPath(rel);
    if (!safe) throw new PresetError("Invalid file path");
    const ext = path.extname(safe).toLowerCase();
    const mime = MIME[ext];
    if (!mime) throw new PresetError("File type not allowed", 403);
    let base;
    let file;
    try {
      base = fs.realpathSync(dirOf(id));
      file = fs.realpathSync(path.join(base, ...safe.split("/")));
    } catch {
      throw new PresetError("File not found", 404);
    }
    if (!isInside(base, file)) throw new PresetError("Invalid file path", 403);
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new PresetError("File not found", 404);
    return { file, mime, size: stat.size };
  }

  /** Serve file (supports Range for video backgrounds). `headers` are CORS headers provided by server.js. */
  function serveFile(req, res, info, headers = {}) {
    const base = {
      "content-type": info.mime,
      "accept-ranges": "bytes",
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
      ...headers,
    };
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? "");
    if (range && info.size > 0) {
      let start = range[1] === "" ? info.size - Number(range[2]) : Number(range[1]);
      let end = range[1] === "" || range[2] === "" ? info.size - 1 : Number(range[2]);
      start = Math.max(0, start);
      end = Math.min(info.size - 1, end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
        res.writeHead(416, { ...base, "content-range": `bytes */${info.size}` });
        return res.end();
      }
      res.writeHead(206, {
        ...base,
        "content-range": `bytes ${start}-${end}/${info.size}`,
        "content-length": end - start + 1,
      });
      return fs.createReadStream(info.file, { start, end }).pipe(res);
    }
    res.writeHead(200, { ...base, "content-length": info.size });
    fs.createReadStream(info.file).pipe(res);
  }

  return { root, list, importFrom, remove, resolveFile, serveFile };
}

module.exports = {
  createPresetStore,
  PresetError,
  safeRelPath,
  ID_RE,
  LIMITS,
  MIME,
  SCHEMA_VERSION,
};
