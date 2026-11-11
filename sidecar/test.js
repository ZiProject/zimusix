"use strict";
// Test tích hợp: chạy sidecar thật, phát file local, nhận frame Opus qua WS, điều khiển player.
// Cần ffmpeg (hệ thống hoặc ffmpeg-static) để sinh file âm thanh thử.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WebSocket } = require("ws");

const TOKEN = "test-token";
let child, base, dir, fileA, fileB;

function ffmpegPath() {
  if (spawnSync("ffmpeg", ["-version"]).status === 0) return "ffmpeg";
  return require("ffmpeg-static");
}

function makeTone(file, freq, seconds) {
  const r = spawnSync(ffmpegPath(), [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${freq}:duration=${seconds}`,
    "-c:a",
    "libmp3lame",
    file,
  ]);
  assert.equal(r.status, 0, "ffmpeg phải sinh được file thử");
}

const api = async (method, route, body, token = TOKEN) => {
  const res = await fetch(base + route, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error("waitFor timeout");
}

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zimusix-"));
  fileA = path.join(dir, "Tone A.mp3");
  fileB = path.join(dir, "Tone B.mp3");
  makeTone(fileA, 440, 20);
  makeTone(fileB, 660, 20);

  // Có thể trỏ tới bản đã đóng gói: ZIMUSIX_TEST_NODE / ZIMUSIX_TEST_SERVER / ZIMUSIX_TEST_PATH (PATH rỗng để chứng minh không dựa vào hệ thống)
  const serverFile =
    process.env.ZIMUSIX_TEST_SERVER || path.join(__dirname, "server.js");
  child = spawn(
    process.env.ZIMUSIX_TEST_NODE || process.execPath,
    [serverFile],
    {
      cwd: path.dirname(serverFile),
      env: {
        ...process.env,
        ...(process.env.ZIMUSIX_TEST_PATH
          ? { PATH: process.env.ZIMUSIX_TEST_PATH }
          : {}),
        ZIMUSIX_PORT: "0",
        ZIMUSIX_TOKEN: TOKEN,
        ZIMUSIX_DATA_DIR: path.join(dir, "data"),
      },
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("sidecar không khởi động")),
      30000,
    );
    child.stdout.on("data", (chunk) => {
      const m = /ZIMUSIX_READY (\{.*\})/.exec(chunk.toString());
      if (m) (clearTimeout(timer), resolve(JSON.parse(m[1]).port));
    });
    child.on("exit", (code) =>
      reject(new Error(`sidecar thoát sớm (${code})`)),
    );
  });
  base = `http://127.0.0.1:${port}`;
});

after(() => {
  child?.kill();
  fs.rmSync(dir, { recursive: true, force: true });
});

test("từ chối request không có token", async () => {
  const r = await api("GET", "/health", null, "sai");
  assert.equal(r.status, 401);
});

test("health liệt kê đủ plugin", async () => {
  const r = await api("GET", "/health");
  assert.equal(r.status, 200);
  for (const name of ["youtube", "soundcloud", "spotify", "attachments"])
    assert.ok(
      r.json.plugins.includes(name),
      `thiếu plugin ${name}: ${r.json.plugins}`,
    );
  assert.equal(
    r.json.ffmpeg.ok,
    true,
    `FFmpeg phải khả dụng: ${JSON.stringify(r.json.ffmpeg)}`,
  );
});

test("phát file local + nhận Opus qua WebSocket", async () => {
  const frames = [];
  let config = null;
  const ws = new WebSocket(
    `${base.replace("http", "ws")}/listen?sessionId=local&token=${TOKEN}`,
  );
  ws.binaryType = "arraybuffer";
  ws.on("message", (data, isBinary) => {
    if (!isBinary) config = JSON.parse(data.toString());
    else frames.push(new Uint8Array(data));
  });
  await new Promise(
    (resolve, reject) => (ws.once("open", resolve), ws.once("error", reject)),
  );

  const play = await api("POST", "/play", { paths: [fileA] });
  assert.equal(play.status, 200, JSON.stringify(play.json));
  assert.match(play.json.currentTrack?.title ?? "", /Tone A/);

  await waitFor(() => frames.length >= 25);
  assert.equal(config.type, "audio:config");
  assert.equal(config.codec, "opus");
  assert.equal(config.sessionId, "local");
  assert.equal(frames[0][0], 0x5a); // 'Z'
  assert.equal(frames[0][1], 0x49); // 'I'
  ws.close();
});

test("hàng đợi: thêm cuối, phát ngay, điều khiển", async () => {
  let r = await api("POST", "/play", { paths: [fileB], mode: "end" });
  assert.equal(r.json.queue.length, 1);
  assert.match(r.json.queue[0].title, /Tone B/);

  r = await api("POST", "/control", { action: "pause" });
  assert.equal(r.json.isPaused, true);
  r = await api("POST", "/control", { action: "resume" });
  assert.equal(r.json.isPaused, false);

  r = await api("POST", "/control", { action: "volume", volume: 55 });
  assert.equal(r.json.volume, 55);

  r = await api("POST", "/control", { action: "loop", mode: "queue" });
  assert.equal(r.json.loop, "queue");

  r = await api("POST", "/control", { action: "seek", positionMs: 5000 });
  assert.ok(r.status === 200, JSON.stringify(r.json));

  // "phát ngay" bài A lần nữa → bài hiện tại đổi
  r = await api("POST", "/play", { paths: [fileA], mode: "now" });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  await waitFor(async () =>
    /Tone A/.test((await api("GET", "/state")).json.currentTrack?.title ?? ""),
  );

  r = await api("POST", "/control", { action: "clear" });
  assert.equal(r.json.queue.length, 0);
  r = await api("POST", "/control", { action: "stop" });
  assert.ok(r.status === 200 || r.status === 409);
});

test("tìm bằng đường dẫn file trả về thời lượng và tag", async () => {
  const r = await api("POST", "/search", { query: fileB });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.tracks[0].source, "attachments");
  assert.equal(r.json.tracks[0].duration, 20000);
});

test("Discord: chưa đăng nhập thì báo lỗi rõ ràng", async () => {
  const s = await api("GET", "/discord/status");
  assert.equal(s.json.status, "logged-out");
  const invalidLink = await api("POST", "/voice/link", {
    target: "invalid target",
    guildId: "123",
    channelId: "456",
  });
  assert.equal(invalidLink.status, 400);
  const g = await api("GET", "/discord/guilds");
  assert.equal(g.status, 409);
  const j = await api("POST", "/play", {
    target: "123456789012345678",
    paths: [fileA],
  });
  assert.equal(j.status, 409);
  const link = await api("POST", "/voice/link", {
    target: "local",
    guildId: "123",
    channelId: "456",
  });
  assert.equal(link.status, 409);
});

test("state chứa thông tin related và linkedVoice", async () => {
  const s = await api("GET", "/state");
  assert.equal(s.status, 200);
  assert.ok(Array.isArray(s.json.related));
  assert.equal(typeof s.json.isVoiceLinked, "boolean");
  assert.equal(s.json.connectionState, "disconnected");
  assert.equal(s.json.voice, null);
  assert.equal(s.json.linkedVoice, null);

  const rel = await api("GET", "/related");
  assert.equal(rel.status, 200);
  assert.ok(Array.isArray(rel.json.tracks));
});

test("lyrics endpoint trả kết quả hoặc báo lỗi hợp lệ", async () => {
  const r = await api("GET", "/lyrics");
  assert.equal(r.status, 200);
  assert.equal(typeof r.json.ok, "boolean");
});

test("video stream endpoint xử lý đúng", async () => {
  const r = await fetch(base + "/video/stream?target=local&token=" + TOKEN);
  // Khi chưa phát bài có video thì trả 404
  assert.ok(r.status === 404 || r.status === 200);
});

test("search online (bỏ qua nếu sandbox không có mạng)", async (t) => {
  const r = await api("POST", "/search", {
    query: "lofi hip hop",
    source: "soundcloud",
  });
  if (r.status !== 200)
    return t.skip(`không có mạng/plugin lỗi: ${r.json.error}`);
  assert.ok(Array.isArray(r.json.tracks));
});
