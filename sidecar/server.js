"use strict";
/**
 * Zimusix sidecar — chạy ZiPlayer trong Node.js và phục vụ cho app Tauri.
 *
 *  - HTTP JSON API  (Bearer token)  : search / play / queue / control / discord
 *  - SSE  /events                   : đẩy trạng thái player realtime
 *  - WS   /listen?sessionId=...     : relay Opus (Wire Format v1) cho @ziplayer/client trong WebView
 *
 * Chỉ bind 127.0.0.1. Mọi request đều cần token do Tauri (Rust) sinh ngẫu nhiên mỗi lần chạy app.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer } = require("ws");
const { PlayerManager, WebAudioConnection } = require("ziplayer");
const { YouTubePlugin, SoundCloudPlugin, SpotifyPlugin, AttachmentsPlugin } = require("@ziplayer/plugin");

const HOST = "127.0.0.1";
const PORT = Number(process.env.ZIMUSIX_PORT || 0);
const TOKEN = process.env.ZIMUSIX_TOKEN || crypto.randomBytes(24).toString("hex");
const DATA_DIR = process.env.ZIMUSIX_DATA_DIR || path.join(__dirname, ".data");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const REQUESTER = "zimusix";
const LOCAL_TARGET = "local";
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".m4a", ".flac", ".aac", ".wma", ".opus", ".webm"]);
const SEARCH_SOURCES = ["youtube", "soundcloud", "spotify"];
const ALLOWED_ORIGIN = /^(tauri:\/\/localhost|https?:\/\/(tauri\.localhost|localhost(:\d+)?|127\.0\.0\.1(:\d+)?))$/;

/* ------------------------------------------------------------------ settings */

fs.mkdirSync(DATA_DIR, { recursive: true });
let settings = { discordToken: "", volume: 80 };
try {
	settings = { ...settings, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")) };
} catch {}
function saveSettings() {
	try {
		fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), { mode: 0o600 });
	} catch (error) {
		console.error("Không lưu được settings:", error.message);
	}
}

/* ------------------------------------------------------------------ ffmpeg */

/**
 * ziplayer/prism-media cần FFmpeg cho file local, seek, filter... prism-media chỉ thử `ffmpeg-static`
 * rồi `ffmpeg` trong PATH (không đọc FFMPEG_PATH), còn ziplayer đọc FFMPEG_PATH.
 * npm mới chặn script cài đặt của ffmpeg-static nếu chưa khai báo allowScripts → binary không được tải.
 */
let ffmpeg = { ok: false, source: null, error: "chưa kiểm tra" };

function detectFfmpeg() {
	const exists = (p) => p && fs.existsSync(p);
	const system = () => require("node:child_process").spawnSync("ffmpeg", ["-version"], { windowsHide: true }).status === 0;
	let bundled = null;
	try {
		const mod = require("ffmpeg-static");
		bundled = mod?.path ?? mod;
	} catch {}

	if (exists(process.env.FFMPEG_PATH)) {
		// prism-media tìm theo PATH → thêm thư mục chứa binary người dùng chỉ định
		if (/^ffmpeg(\.exe)?$/i.test(path.basename(process.env.FFMPEG_PATH))) {
			process.env.PATH = `${path.dirname(process.env.FFMPEG_PATH)}${path.delimiter}${process.env.PATH ?? ""}`;
		}
		return { ok: true, source: "FFMPEG_PATH", path: process.env.FFMPEG_PATH };
	}
	if (exists(bundled)) {
		process.env.FFMPEG_PATH = bundled;
		return { ok: true, source: "ffmpeg-static", path: bundled };
	}
	if (system()) return { ok: true, source: "system", path: "ffmpeg" };
	return { ok: false, source: null, error: "Không tìm thấy FFmpeg (ffmpeg-static chưa tải binary và hệ thống không có ffmpeg)." };
}

/** Nếu thiếu binary: thử chạy script cài đặt của ffmpeg-static (cần mạng tới GitHub). */
async function ensureFfmpeg() {
	ffmpeg = detectFfmpeg();
	if (ffmpeg.ok) return;
	try {
		const dir = path.dirname(require.resolve("ffmpeg-static/package.json"));
		console.warn("[ffmpeg] thiếu binary, đang tải qua ffmpeg-static/install.js …");
		await new Promise((resolve, reject) => {
			const child = require("node:child_process").spawn(process.execPath, ["install.js"], { cwd: dir, stdio: "inherit" });
			const timer = setTimeout(() => (child.kill(), reject(new Error("tải FFmpeg quá thời gian"))), 120_000);
			child.on("exit", (code) => (clearTimeout(timer), code === 0 ? resolve() : reject(new Error(`install.js thoát với mã ${code}`))));
			child.on("error", reject);
		});
		// prism-media cache kết quả getInfo; tải xong chưa cần reset vì chưa có phát nào thành công trước đó
		ffmpeg = detectFfmpeg();
	} catch (error) {
		ffmpeg = { ok: false, source: null, error: `${ffmpeg.error} Tự tải thất bại: ${error.message}` };
	}
	if (!ffmpeg.ok) console.error("[ffmpeg]", ffmpeg.error);
}

/* ------------------------------------------------------------------ ziplayer */

const manager = new PlayerManager({
	plugins: [new YouTubePlugin({ preferYoutubei: true }), new SoundCloudPlugin(), new SpotifyPlugin(), new AttachmentsPlugin()],
	autoCleanup: false,
	enableSearchCache: true,
	debugLevel: process.env.ZIMUSIX_DEBUG_LEVEL || "time",
	extractorTimeout: Number(process.env.EXTRACTOR_TIMEOUT_MS || 30_000),
});
manager.on("debug", (...args) => console.log("[ziplayer]", ...args));
manager.on("error", (_p, error) => console.error("[ziplayer]", error));

const sessions = new Map(); // sessionId -> { config, listeners:Set<WebSocket> }
const trackCache = new Map(); // key -> Track (full object, giữ metadata cho plugin)
const TRACK_CACHE_MAX = 800;

const playerId = (p) => p?.id ?? p?.playerId;

function durationMs(track) {
	const d = Number(track?.duration) || 0;
	return Math.floor(d > 1000 ? d : d * 1000);
}

function trackKey(track) {
	return `${track.source}|${track.id ?? ""}|${track.url ?? ""}`;
}

function remember(track) {
	const key = trackKey(track);
	trackCache.delete(key);
	trackCache.set(key, track);
	if (trackCache.size > TRACK_CACHE_MAX) trackCache.delete(trackCache.keys().next().value);
	return key;
}

function serializeTrack(track) {
	if (!track) return null;
	return {
		key: remember(track),
		title: track.title ?? "Không có tiêu đề",
		author: track.author ?? null,
		url: track.url ?? null,
		thumbnail: track.thumbnail ?? null,
		source: track.source ?? null,
		duration: durationMs(track),
		isLive: Boolean(track.isLive),
	};
}

/* ------------------------------------------------- relay Opus → WebView (WS) */

function getSession(sessionId) {
	let session = sessions.get(sessionId);
	if (!session) {
		session = { config: null, listeners: new Set() };
		sessions.set(sessionId, session);
	}
	return session;
}

/** Socket "in-process" mà WebAudioConnection ghi vào; frame được chuyển thẳng tới các listener WS. */
class RelaySocket {
	constructor(session) {
		this.session = session;
		this.readyState = 1;
		this.bufferedAmount = 0;
	}
	send(data) {
		if (typeof data === "string") {
			this.session.config = data; // audio:config — cache cho listener vào sau
			for (const ws of this.session.listeners) if (ws.readyState === 1) ws.send(data);
			return;
		}
		for (const ws of this.session.listeners) {
			// listener chậm thì bỏ frame, không làm nghẽn player
			if (ws.readyState === 1 && ws.bufferedAmount < 512 * 1024) ws.send(data, { binary: true });
		}
	}
	close() {
		this.readyState = 3;
	}
}

/* ------------------------------------------------------------ player lifecycle */

/** manager.create trả lại player đã có nếu trùng id; ở đây chỉ gắn thêm output "trong app" đúng một lần. */
async function ensurePlayer(target) {
	const player = await manager.create(target, {
		leaveOnEnd: false,
		leaveOnEmpty: false,
		selfDeaf: true,
		volume: settings.volume ?? 80,
		userdata: { target },
	});
	player.userdata ??= { target };
	player.userdata.appOutput ??= attachAppOutput(player, target);
	await player.userdata.appOutput;
	return player;
}

async function attachAppOutput(player, target) {
	// Output "trong app": luôn gắn sẵn, frame chỉ đi khi có listener.
	const conn = new WebAudioConnection({ sessionId: target });
	conn.attachSocket(new RelaySocket(getSession(target)));
	await player.connect(conn, { id: `app-${target}`, name: "Zimusix app" });

	const report = (kind) => (error, track) => {
		const message = String(error?.message ?? error);
		console.error(`[${target}] ${kind}${track ? ` (${track.title})` : ""}:`, message);
		sendEvent(target, "playback-error", { message: explainError(message), track: track?.title ?? null });
	};
	player.on("playerError", report("lỗi phát"));
	player.on("streamError", report("lỗi stream"));
}

function explainError(message) {
	if (/ffmpeg/i.test(message)) return `${message} — thiếu FFmpeg, xem hướng dẫn trong README (mục FFmpeg).`;
	return message;
}

const STATE_EVENTS = [
	"trackStart",
	"trackEnd",
	"queueEnd",
	"queueAdd",
	"queueAddList",
	"queueRemove",
	"volumeChange",
	"playerPause",
	"playerResume",
	"playerStop",
	"seek",
	"willPlay",
	"connectionChange",
];
for (const event of STATE_EVENTS) manager.on(event, (player) => publishState(playerId(player)));
manager.on("playerDestroy", (player) => publishState(playerId(player)));

function voiceInfo(player) {
	const cfg = player.connection?.joinConfig;
	if (!cfg?.channelId) return null;
	const channel = discord.client?.channels?.cache?.get(cfg.channelId);
	return { guildId: cfg.guildId, channelId: cfg.channelId, channelName: channel?.name ?? null };
}

function playerState(target) {
	const player = manager.get(target);
	if (!player) return { target, exists: false };
	const time = player.getTime();
	return {
		target,
		exists: true,
		currentTrack: serializeTrack(player.currentTrack),
		queue: player.upcomingTracks.map(serializeTrack),
		isPlaying: player.isPlaying,
		isPaused: player.isPaused,
		volume: player.volume,
		loop: player.loop(),
		autoPlay: player.autoPlay(),
		position: time.current,
		duration: time.total,
		voice: voiceInfo(player),
		ts: Date.now(),
	};
}

/* ------------------------------------------------------------------- SSE */

const sseClients = new Set(); // { res, target }

function sendEvent(target, event, data) {
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	for (const client of sseClients) if (client.target === target) client.res.write(payload);
}

function publishState(target, followUp = true) {
	if (!target || sseClients.size === 0) return;
	setImmediate(() => {
		const payload = `event: state\ndata: ${JSON.stringify(playerState(target))}\n\n`;
		for (const client of sseClients) if (client.target === target) client.res.write(payload);
	});
	// Sự kiện như trackStart đến trước khi AudioPlayer thật sự chuyển sang "playing":
	// đẩy bù để UI không phải chờ nhịp heartbeat.
	if (followUp) {
		setTimeout(() => publishState(target, false), 600).unref();
		setTimeout(() => publishState(target, false), 2000).unref();
	}
}
setInterval(() => {
	for (const client of sseClients) client.res.write(`event: state\ndata: ${JSON.stringify(playerState(client.target))}\n\n`);
}, 5_000).unref();

/* --------------------------------------------------------------- tìm kiếm */

const withTimeout = (promise, ms, label) =>
	Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} quá thời gian`)), ms).unref())]);

const looksLikeUrl = (q) => /^https?:\/\//i.test(q);
const looksLikePath = (q) => /^[a-zA-Z]:[\\/]/.test(q) || q.startsWith("/") || q.startsWith("file://") || q.startsWith("~");

async function searchTracks(query, source = "all") {
	query = String(query || "").trim();
	if (!query) return [];
	const searcher = await ensurePlayer(LOCAL_TARGET);

	// URL / đường dẫn: ziplayer tự chọn plugin phù hợp (YouTube/SoundCloud/Spotify/Attachments)
	if (looksLikeUrl(query) || looksLikePath(query)) {
		const result = await withTimeout(searcher.search(query, { requestedBy: REQUESTER }), 30_000, "Tìm kiếm");
		const tracks = result?.tracks ?? [];
		// file local tìm bằng đường dẫn: đọc tag/thời lượng như khi chọn bằng hộp thoại
		for (const track of tracks) {
			if (track.source === "attachments" && track.url && !looksLikeUrl(track.url)) {
				await enrichLocalTrack(track, track.url.replace(/^file:\/\//, ""));
			}
		}
		return tracks;
	}

	const names = source === "all" ? SEARCH_SOURCES : [source];
	const settled = await Promise.allSettled(
		names.map((plugin) => withTimeout(searcher.search(query, { plugin, requestedBy: REQUESTER }), 20_000, plugin)),
	);

	const errors = [];
	const lists = settled.map((r, i) => {
		if (r.status === "fulfilled") return (r.value?.tracks ?? []).slice(0, 12);
		errors.push(`${names[i]}: ${r.reason?.message ?? r.reason}`);
		return [];
	});
	if (errors.length) console.warn("[search]", errors.join(" | "));

	// xen kẽ kết quả giữa các nguồn để danh sách đa dạng
	const merged = [];
	for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) merged.push(l[i]);
	if (!merged.length && errors.length === names.length) throw new Error(errors.join("; "));
	return merged;
}

/* -------------------------------------------------------------- file local */

function expandLocalPaths(inputs) {
	const files = [];
	const walk = (p, depth) => {
		let stat;
		try {
			stat = fs.statSync(p);
		} catch {
			return;
		}
		if (stat.isDirectory()) {
			if (depth > 3 || files.length >= 1000) return;
			for (const name of fs.readdirSync(p).sort()) walk(path.join(p, name), depth + 1);
		} else if (stat.isFile() && AUDIO_EXTENSIONS.has(path.extname(p).toLowerCase())) {
			files.push(p);
		}
	};
	for (const input of inputs) walk(String(input).replace(/^file:\/\//, ""), 0);
	return files.slice(0, 1000);
}

/** Đọc tag + thời lượng + ảnh bìa nhúng để UI hiển thị đẹp và seek hoạt động (plugin trả duration = 0). */
async function enrichLocalTrack(track, file) {
	try {
		const { parseFile, selectCover } = await import("music-metadata");
		const meta = await parseFile(file, { duration: true });
		if (meta.format.duration) track.duration = Math.round(meta.format.duration); // giây
		if (meta.common.title) track.title = meta.common.title;
		const artist = meta.common.artist || meta.common.albumartist;
		if (artist) track.author = artist;
		const cover = selectCover(meta.common.picture);
		if (cover?.data?.length && cover.data.length < 400 * 1024) {
			track.thumbnail = `data:${cover.format || "image/jpeg"};base64,${Buffer.from(cover.data).toString("base64")}`;
		}
	} catch (error) {
		console.warn(`[local] không đọc được tag của ${file}: ${error.message}`);
	}
	return track;
}

async function resolveLocalTracks(paths) {
	const searcher = await ensurePlayer(LOCAL_TARGET);
	const tracks = [];
	for (const file of expandLocalPaths(paths)) {
		try {
			const result = await searcher.search(file, { plugin: "attachments", requestedBy: REQUESTER });
			if (result?.tracks?.[0]) tracks.push(await enrichLocalTrack(result.tracks[0], file));
		} catch (error) {
			console.warn(`[local] bỏ qua ${file}: ${error.message}`);
		}
	}
	return tracks;
}

/* -------------------------------------------------------------------- phát */

/** Lấy Track đầy đủ từ key (kết quả search) hoặc từ query chuỗi. */
async function resolveTracks({ trackKey: key, trackKeys, query, paths }) {
	if (paths?.length) return resolveLocalTracks(paths);
	const keys = trackKeys ?? (key ? [key] : []);
	if (keys.length) {
		const tracks = keys.map((k) => trackCache.get(k)).filter(Boolean);
		if (!tracks.length) throw httpError(410, "Kết quả tìm kiếm đã hết hạn, hãy tìm lại");
		return tracks;
	}
	if (query) {
		const tracks = await searchTracks(query, "all");
		return tracks.slice(0, 1);
	}
	throw httpError(400, "Thiếu trackKey, query hoặc paths");
}

/**
 * mode = "now"  → phát ngay (bài hiện tại nhường chỗ)
 * mode = "next" → xếp ngay sau bài đang phát
 * mode = "end"  → thêm cuối hàng đợi (mặc định)
 */
async function enqueue(player, tracks, mode) {
	if (!tracks.length) throw httpError(422, "Không tìm thấy bài nào có thể phát");
	const busy = Boolean(player.currentTrack) && !player.isIdle;

	if (!busy) {
		const first = await player.play(tracks[0], { requestedBy: REQUESTER });
		if (!first) throw httpError(422, "Không phát được bài này");
		if (tracks.length > 1) player.queue.addMultiple(tracks.slice(1));
		return;
	}
	if (mode === "now") {
		// chèn các bài lên đầu hàng đợi rồi chuyển sang bài đầu tiên
		for (let i = 0; i < tracks.length; i++) await player.insert(tracks[i], i, REQUESTER);
		await player.skip();
		return;
	}
	if (mode === "next") {
		for (let i = 0; i < tracks.length; i++) await player.insert(tracks[i], i, REQUESTER);
		return;
	}
	player.queue.addMultiple(tracks);
}

async function control(player, action, body) {
	switch (action) {
		case "pause":
			return player.pause();
		case "resume":
			return player.resume();
		case "toggle":
			return player.isPaused ? player.resume() : player.pause();
		case "stop":
			return player.stop();
		case "skip":
			return Number.isInteger(body.index) ? player.skip(body.index) : player.skip();
		case "previous":
			return player.previous();
		case "seek":
			if (!Number.isFinite(body.positionMs)) throw httpError(400, "positionMs không hợp lệ");
			return player.seek(Math.max(0, Math.floor(body.positionMs)));
		case "volume": {
			const volume = Math.min(200, Math.max(0, Number(body.volume)));
			if (!Number.isFinite(volume)) throw httpError(400, "volume không hợp lệ");
			settings.volume = volume;
			saveSettings();
			return player.setVolume(volume);
		}
		case "loop":
			if (!["off", "track", "queue"].includes(body.mode)) throw httpError(400, "mode phải là off | track | queue");
			return player.loop(body.mode);
		case "autoplay":
			return player.autoPlay(Boolean(body.enabled));
		case "shuffle":
			return player.shuffle();
		case "clear":
			return player.clearQueue();
		case "remove":
			return player.queue.remove(Number(body.index));
		case "move":
			return player.queue.move(Number(body.from), Number(body.to));
		default:
			throw httpError(400, `Hành động không hỗ trợ: ${action}`);
	}
}

/* ----------------------------------------------------------------- discord */

const discord = { client: null, status: "logged-out", error: null, user: null };

async function discordLogin(token) {
	await discordLogout();
	const { Client, GatewayIntentBits } = require("discord.js");
	const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
	discord.status = "connecting";
	discord.error = null;
	try {
		await new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("Đăng nhập Discord quá thời gian")), 30_000);
			client.once("clientReady", () => (clearTimeout(timer), resolve()));
			client.once("ready", () => (clearTimeout(timer), resolve()));
			client.login(token).catch((error) => (clearTimeout(timer), reject(error)));
		});
	} catch (error) {
		client.destroy();
		discord.status = "error";
		discord.error = error.message;
		throw error;
	}
	client.on("error", (error) => console.error("[discord]", error.message));
	client.on("voiceStateUpdate", (oldState, newState) => {
		if (newState.id !== client.user.id) return;
		// bot bị kick/di chuyển → cập nhật UI
		publishState(newState.guild.id);
	});
	discord.client = client;
	discord.status = "ready";
	discord.user = { id: client.user.id, tag: client.user.tag, avatar: client.user.displayAvatarURL({ size: 64 }) };
}

async function discordLogout() {
	for (const player of manager.getAll()) {
		const target = playerId(player);
		if (target === LOCAL_TARGET) continue;
		try {
			await manager.destroy(target);
		} catch {}
	}
	if (discord.client) {
		try {
			await discord.client.destroy();
		} catch {}
	}
	discord.client = null;
	discord.status = "logged-out";
	discord.user = null;
}

function requireDiscord() {
	if (!discord.client || discord.status !== "ready") throw httpError(409, "Bot Discord chưa đăng nhập");
	return discord.client;
}

function listGuilds() {
	const client = requireDiscord();
	const { ChannelType } = require("discord.js");
	return [...client.guilds.cache.values()]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((guild) => ({
			id: guild.id,
			name: guild.name,
			icon: guild.iconURL({ size: 64 }),
			channels: [...guild.channels.cache.values()]
				.filter((c) => c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice)
				.sort((a, b) => a.rawPosition - b.rawPosition)
				.map((c) => ({ id: c.id, name: c.name, members: c.members?.filter((m) => !m.user.bot).size ?? 0 })),
		}));
}

async function discordJoin(guildId, channelId) {
	const client = requireDiscord();
	const channel = await client.channels.fetch(channelId).catch(() => null);
	if (!channel || channel.guildId !== guildId || !channel.isVoiceBased()) throw httpError(404, "Không tìm thấy kênh thoại");
	const me = channel.guild.members.me;
	const perms = me && channel.permissionsFor(me);
	if (perms && !(perms.has("Connect") && perms.has("Speak"))) throw httpError(403, "Bot thiếu quyền Connect/Speak ở kênh này");
	const player = await ensurePlayer(guildId);
	await withTimeout(player.connect(channel, { selfDeaf: true }), 20_000, "Kết nối kênh thoại");
	publishState(guildId);
}

/* -------------------------------------------------------------------- HTTP */

function httpError(statusCode, message) {
	return Object.assign(new Error(message), { statusCode });
}

function corsHeaders(req) {
	const origin = req.headers.origin;
	if (!origin || !ALLOWED_ORIGIN.test(origin)) return {};
	return {
		"access-control-allow-origin": origin,
		"access-control-allow-headers": "authorization, content-type",
		"access-control-allow-methods": "GET, POST, OPTIONS",
		vary: "origin",
	};
}

function sendJson(req, res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...corsHeaders(req) });
	res.end(JSON.stringify(body));
}

function readJson(req, limit = 2 * 1024 * 1024) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on("data", (chunk) => {
			size += chunk.length;
			if (size > limit) {
				reject(httpError(413, "Body quá lớn"));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on("end", () => {
			if (!chunks.length) return resolve({});
			try {
				resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
			} catch {
				reject(httpError(400, "JSON không hợp lệ"));
			}
		});
		req.on("error", reject);
	});
}

function authorized(req, url) {
	const header = req.headers.authorization ?? "";
	const given = header.startsWith("Bearer ") ? header.slice(7) : url.searchParams.get("token") || "";
	const a = Buffer.from(given);
	const b = Buffer.from(TOKEN);
	return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const validTarget = (t) => typeof t === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(t);

const routes = {
	"GET /health": async () => ({ status: "ok", plugins: manager.getPlugins().map((p) => p.name), ffmpeg }),

	"GET /state": async (_req, url) => playerState(url.searchParams.get("target") || LOCAL_TARGET),

	"POST /search": async (_req, _url, body) => {
		const tracks = await searchTracks(body.query, body.source || "all");
		return { tracks: tracks.map(serializeTrack) };
	},

	"POST /play": async (_req, _url, body) => {
		const target = body.target || LOCAL_TARGET;
		if (!validTarget(target)) throw httpError(400, "target không hợp lệ");
		if (target !== LOCAL_TARGET && !manager.get(target)?.connection) throw httpError(409, "Bot chưa vào kênh thoại của server này");
		const player = await ensurePlayer(target);
		const tracks = await resolveTracks(body);
		await enqueue(player, tracks, ["now", "next", "end"].includes(body.mode) ? body.mode : "end");
		return { ...playerState(target), added: tracks.length };
	},

	"POST /control": async (_req, _url, body) => {
		const target = body.target || LOCAL_TARGET;
		const player = manager.get(target);
		if (!player) throw httpError(404, "Player chưa được tạo");
		const result = await control(player, body.action, body);
		if (result === false) throw httpError(409, `Không thực hiện được "${body.action}" ở trạng thái hiện tại`);
		return playerState(target);
	},

	"GET /discord/status": async () => ({
		status: discord.status,
		error: discord.error,
		user: discord.user,
		hasSavedToken: Boolean(settings.discordToken),
	}),

	"POST /discord/login": async (_req, _url, body) => {
		const token = String(body.token || settings.discordToken || "").trim();
		if (!token) throw httpError(400, "Thiếu token bot");
		try {
			await discordLogin(token);
		} catch (error) {
			throw httpError(401, `Đăng nhập thất bại: ${error.message}`);
		}
		if (body.remember !== false) {
			settings.discordToken = token;
			saveSettings();
		}
		return { status: discord.status, user: discord.user };
	},

	"POST /discord/logout": async (_req, _url, body) => {
		await discordLogout();
		if (body.forget) {
			settings.discordToken = "";
			saveSettings();
		}
		return { status: discord.status };
	},

	"GET /discord/guilds": async () => ({ guilds: listGuilds() }),

	"POST /discord/join": async (_req, _url, body) => {
		await discordJoin(String(body.guildId), String(body.channelId));
		return playerState(String(body.guildId));
	},

	"POST /discord/leave": async (_req, _url, body) => {
		const player = manager.get(String(body.guildId));
		if (player?.connection) await player.disconnect();
		publishState(String(body.guildId));
		return playerState(String(body.guildId));
	},
};

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", "http://localhost");
	if (req.method === "OPTIONS") {
		res.writeHead(204, corsHeaders(req));
		res.end();
		return;
	}
	if (!authorized(req, url)) return sendJson(req, res, 401, { error: "Unauthorized" });

	if (req.method === "GET" && url.pathname === "/events") {
		const target = url.searchParams.get("target") || LOCAL_TARGET;
		if (!validTarget(target)) return sendJson(req, res, 400, { error: "target không hợp lệ" });
		res.writeHead(200, {
			"content-type": "text/event-stream",
			"cache-control": "no-cache",
			connection: "keep-alive",
			...corsHeaders(req),
		});
		const client = { res, target };
		sseClients.add(client);
		res.write(`event: state\ndata: ${JSON.stringify(playerState(target))}\n\n`);
		req.on("close", () => sseClients.delete(client));
		return;
	}

	const handler = routes[`${req.method} ${url.pathname}`];
	if (!handler) return sendJson(req, res, 404, { error: "Not found" });
	try {
		const body = req.method === "POST" ? await readJson(req) : {};
		sendJson(req, res, 200, await handler(req, url, body));
	} catch (error) {
		const status = error.statusCode ?? 500;
		if (status === 500) console.error(`[${req.method} ${url.pathname}]`, error);
		if (!res.headersSent) sendJson(req, res, status, { error: error.message || "Lỗi không xác định" });
	}
});

/* --------------------------------------------------------------------- WS */

const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
server.on("upgrade", (req, socket, head) => {
	const url = new URL(req.url ?? "/", "http://localhost");
	const sessionId = url.searchParams.get("sessionId");
	const origin = req.headers.origin;
	if (
		url.pathname !== "/listen" ||
		!authorized(req, url) ||
		!validTarget(sessionId) ||
		(origin && !ALLOWED_ORIGIN.test(origin))
	) {
		socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
		return;
	}
	wss.handleUpgrade(req, socket, head, (ws) => {
		const session = getSession(sessionId);
		session.listeners.add(ws);
		if (session.config) ws.send(session.config);
		ws.on("close", () => session.listeners.delete(ws));
		ws.on("error", () => session.listeners.delete(ws));
	});
});

/* ------------------------------------------------------------------- main */

async function main() {
	ffmpeg = detectFfmpeg();
	await ensurePlayer(LOCAL_TARGET);
	await new Promise((resolve) => server.listen(PORT, HOST, resolve));
	const { port } = server.address();
	// Dòng này được Rust/test đọc để biết cổng thật.
	console.log(`ZIMUSIX_READY ${JSON.stringify({ port, token: process.env.ZIMUSIX_TOKEN ? undefined : TOKEN })}`);

	ensureFfmpeg().catch((error) => console.error("[ffmpeg]", error));
	if (settings.discordToken) {
		discordLogin(settings.discordToken).catch((error) => console.warn("[discord] tự đăng nhập thất bại:", error.message));
	}
}

async function shutdown() {
	try {
		await discordLogout();
		await manager.dispose?.();
	} finally {
		process.exit(0);
	}
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
// Khi app Tauri đóng, stdin của sidecar bị đóng → tự thoát để không bị treo process.
if (process.env.ZIMUSIX_EXIT_ON_STDIN_CLOSE === "1") {
	process.stdin.on("end", shutdown);
	process.stdin.resume();
}
process.on("uncaughtException", (error) => console.error("uncaughtException:", error));
process.on("unhandledRejection", (error) => console.error("unhandledRejection:", error));

if (require.main === module) {
	main().catch((error) => {
		console.error("Không khởi động được sidecar:", error);
		process.exit(1);
	});
}

module.exports = { main, server };
