// Chuẩn bị tài nguyên để đóng gói: sidecar + node_modules (chỉ production) + bản Node.js đang chạy script này.
// Chạy tự động bởi `npm run build` (beforeBuildCommand). Cần mạng để ffmpeg-static tải binary FFmpeg.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "src-tauri", "resources");
const sidecarOut = path.join(out, "sidecar");
const nodeOut = path.join(out, "node");
const exe = process.platform === "win32" ? ".exe" : "";

fs.rmSync(sidecarOut, { recursive: true, force: true });
fs.rmSync(nodeOut, { recursive: true, force: true });
fs.mkdirSync(sidecarOut, { recursive: true });
fs.mkdirSync(nodeOut, { recursive: true });

for (const file of ["server.js", "package.json", "package-lock.json"]) {
	fs.copyFileSync(path.join(root, "sidecar", file), path.join(sidecarOut, file));
}

console.log("→ cài dependency production cho sidecar…");
// Dùng npm-cli.js của chính Node đang chạy để không phụ thuộc shell/npm.cmd.
const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const npmArgs = ["ci", "--omit=dev", "--no-audit", "--no-fund"];
if (fs.existsSync(npmCli)) execFileSync(process.execPath, [npmCli, ...npmArgs], { cwd: sidecarOut, stdio: "inherit" });
else execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", npmArgs, { cwd: sidecarOut, stdio: "inherit", shell: process.platform === "win32" });

// .bin chỉ chứa symlink, không cần khi chạy `node server.js`
fs.rmSync(path.join(sidecarOut, "node_modules", ".bin"), { recursive: true, force: true });

const ffmpeg = path.join(sidecarOut, "node_modules", "ffmpeg-static", `ffmpeg${exe}`);
if (!fs.existsSync(ffmpeg)) {
	console.error(`✗ Thiếu binary FFmpeg (${ffmpeg}). Kiểm tra mạng/GitHub rồi chạy lại; bản build sẽ không phát được file local nếu thiếu.`);
	process.exit(1);
}

const nodeTarget = path.join(nodeOut, `node${exe}`);
fs.copyFileSync(process.execPath, nodeTarget);
fs.chmodSync(nodeTarget, 0o755);
console.log(`✓ đã chuẩn bị ${path.relative(root, out)} (Node ${process.version}, ${process.platform}-${process.arch})`);
