"use strict";
/**
 * Quản lý thư mục Preset của người dùng.
 *
 *   <DATA_DIR>/presets/<id>/preset.json   ← mỗi preset đã cài là một thư mục
 *
 * Người dùng "thêm thư mục" → sidecar kiểm tra rồi SAO CHÉP vào <DATA_DIR>/presets
 * (preset vẫn chạy nếu thư mục gốc bị xoá/di chuyển). Preset là dữ liệu khai báo:
 * chỉ cho phép JSON, CSS, ảnh, font, video và tài liệu — KHÔNG có JS/HTML.
 *
 * Quy ước chi tiết: docs/PRESETS.md
 */
const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_FILE = "preset.json";
const ID_RE = /^[a-z0-9][a-z0-9_-]{1,47}$/;
const SCHEMA_VERSION = 1;

const LIMITS = {
  files: 200,
  bytes: 30 * 1024 * 1024,
  depth: 6,
  manifestBytes: 128 * 1024,
  presetsPerImport: 50,
};

/** Đuôi file được phép + MIME khi phục vụ. */
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

/** File hệ điều hành hay sinh ra: bỏ qua im lặng. */
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

/** Chuẩn hoá đường dẫn tương đối kiểu posix; trả null nếu không an toàn. */
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
    throw new PresetError(`Thiếu ${MANIFEST_FILE} trong "${dir}"`, 422);
  }
  if (!stat.isFile() || stat.size > LIMITS.manifestBytes)
    throw new PresetError(
      `${MANIFEST_FILE} không hợp lệ hoặc quá lớn (> ${LIMITS.manifestBytes / 1024} KB)`,
      422,
    );
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new PresetError(`${MANIFEST_FILE} sai cú pháp JSON: ${error.message}`, 422);
  }
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest))
    throw new PresetError(`${MANIFEST_FILE} phải là một object JSON`, 422);
  if (typeof manifest.id !== "string" || !ID_RE.test(manifest.id))
    throw new PresetError(
      'Trường "id" phải gồm chữ thường, số, "-" hoặc "_" (2–48 ký tự, bắt đầu bằng chữ/số)',
      422,
    );
  if (typeof manifest.name !== "string" || !manifest.name.trim())
    throw new PresetError('Thiếu trường "name"', 422);
  if (
    manifest.schema !== undefined &&
    (!Number.isInteger(manifest.schema) || manifest.schema > SCHEMA_VERSION)
  )
    throw new PresetError(
      `Preset dùng schema ${manifest.schema}, app này chỉ hỗ trợ tới ${SCHEMA_VERSION}`,
      422,
    );
  return manifest;
}

/** Duyệt thư mục, kiểm tra giới hạn và đuôi file. Trả về danh sách file cần sao chép. */
function collectFiles(root) {
  const files = [];
  let bytes = 0;
  const walk = (dir, depth) => {
    if (depth > LIMITS.depth)
      throw new PresetError(`Thư mục lồng quá ${LIMITS.depth} cấp`, 422);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const lower = entry.name.toLowerCase();
      if (IGNORED.has(lower)) continue;
      if (entry.isSymbolicLink())
        throw new PresetError(`Không chấp nhận liên kết (symlink): ${entry.name}`, 422);
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".")) continue;
        walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(lower);
      if (!MIME[ext])
        throw new PresetError(
          `File "${path.relative(root, full)}" có đuôi không được phép (${ext || "không có"}). ` +
            "Preset chỉ gồm: " +
            Object.keys(MIME).join(", "),
          422,
        );
      const size = fs.statSync(full).size;
      bytes += size;
      files.push({ full, rel: path.relative(root, full), size });
      if (files.length > LIMITS.files)
        throw new PresetError(`Preset có quá ${LIMITS.files} file`, 422);
      if (bytes > LIMITS.bytes)
        throw new PresetError(
          `Preset nặng quá ${Math.round(LIMITS.bytes / 1024 / 1024)} MB`,
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

  /** Danh sách preset đã cài. Preset hỏng vẫn được liệt kê kèm `error` để UI cho xoá. */
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
   * Thêm preset từ một thư mục. `src` có thể là:
   *   - một thư mục preset (chứa preset.json), hoặc
   *   - một thư mục chứa nhiều thư mục preset con (mỗi con có preset.json).
   */
  function importFrom(src) {
    if (typeof src !== "string" || !path.isAbsolute(src))
      throw new PresetError("Cần đường dẫn tuyệt đối tới thư mục preset");
    let resolved;
    try {
      resolved = fs.realpathSync(src);
    } catch {
      throw new PresetError("Không tìm thấy thư mục đã chọn", 404);
    }
    if (!fs.statSync(resolved).isDirectory())
      throw new PresetError("Đường dẫn phải là một thư mục");
    const realRoot = fs.realpathSync(root);
    if (resolved === realRoot || isInside(realRoot, resolved))
      throw new PresetError(
        "Thư mục này đã nằm trong kho preset của app. Hãy chọn thư mục preset gốc.",
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
        `Không thấy ${MANIFEST_FILE} trong thư mục này hoặc trong các thư mục con của nó`,
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
      throw new PresetError("id preset không hợp lệ");
    const dir = dirOf(id);
    if (!fs.existsSync(dir)) throw new PresetError("Preset không tồn tại", 404);
    fs.rmSync(dir, { recursive: true, force: true });
    return { removed: id };
  }

  /** Tìm file trong preset; từ chối mọi đường dẫn thoát khỏi thư mục preset. */
  function resolveFile(id, rel) {
    if (typeof id !== "string" || !ID_RE.test(id))
      throw new PresetError("id preset không hợp lệ");
    const safe = safeRelPath(rel);
    if (!safe) throw new PresetError("Đường dẫn file không hợp lệ");
    const ext = path.extname(safe).toLowerCase();
    const mime = MIME[ext];
    if (!mime) throw new PresetError("Loại file không được phép", 403);
    let base;
    let file;
    try {
      base = fs.realpathSync(dirOf(id));
      file = fs.realpathSync(path.join(base, ...safe.split("/")));
    } catch {
      throw new PresetError("Không tìm thấy file", 404);
    }
    if (!isInside(base, file)) throw new PresetError("Đường dẫn file không hợp lệ", 403);
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new PresetError("Không tìm thấy file", 404);
    return { file, mime, size: stat.size };
  }

  /** Gửi file (hỗ trợ Range cho video nền). `headers` là CORS header do server.js cung cấp. */
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
