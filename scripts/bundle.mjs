// Prepare resources for packaging: sidecar + node_modules (production only) + currently running Node.js binary.
// Executed automatically by `npm run build` (beforeBuildCommand). Network needed for ffmpeg-static to download FFmpeg binary.
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

for (const file of ["server.js", "presets.js", "discord-rpc.js", "package.json", "package-lock.json"]) {
	fs.copyFileSync(path.join(root, "sidecar", file), path.join(sidecarOut, file));
}

console.log("→ installing production dependencies for sidecar…");
// Use npm-cli.js from current Node to avoid relying on shell/npm.cmd.
const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const npmArgs = ["ci", "--omit=dev", "--no-audit", "--no-fund"];
if (fs.existsSync(npmCli)) execFileSync(process.execPath, [npmCli, ...npmArgs], { cwd: sidecarOut, stdio: "inherit" });
else execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", npmArgs, { cwd: sidecarOut, stdio: "inherit", shell: process.platform === "win32" });

// .bin only contains symlinks, unnecessary when running `node server.js`
fs.rmSync(path.join(sidecarOut, "node_modules", ".bin"), { recursive: true, force: true });

const ffmpeg = path.join(sidecarOut, "node_modules", "ffmpeg-static", `ffmpeg${exe}`);
if (!fs.existsSync(ffmpeg)) {
	console.error(`✗ Missing FFmpeg binary (${ffmpeg}). Check network/GitHub and retry; local playback will fail without it.`);
	process.exit(1);
}

const nodeTarget = path.join(nodeOut, `node${exe}`);
fs.copyFileSync(process.execPath, nodeTarget);
fs.chmodSync(nodeTarget, 0o755);
console.log(`✓ prepared ${path.relative(root, out)} (Node ${process.version}, ${process.platform}-${process.arch})`);
