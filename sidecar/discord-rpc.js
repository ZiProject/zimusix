"use strict";
/**
 * Zimusix Discord Rich Presence (RPC) client.
 * Connects directly to the local Discord desktop client via Named Pipe (Windows)
 * or Unix Domain Socket (Linux/macOS) to broadcast now-playing status, timeline progress,
 * and cover artwork, with support for idle status when no music is playing.
 */
const net = require("node:net");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");

const OPCODES = {
  HANDSHAKE: 0,
  FRAME: 1,
  CLOSE: 2,
  PING: 3,
  PONG: 4,
};

const DEFAULT_CLIENT_ID = "383226320970055681";

function sanitizeString(str, minLen = 2, maxLen = 128) {
  if (typeof str !== "string") return undefined;
  const trimmed = str.trim();
  if (!trimmed) return undefined;
  if (trimmed.length < minLen) return trimmed.padEnd(minLen, " ");
  return trimmed.slice(0, maxLen);
}

function resolveExternalThumbnail(url) {
  if (typeof url !== "string") return undefined;
  try {
    const parsed = new URL(url);
    // If it's the sidecar's local Bilibili thumbnail proxy, extract the target URL
    if (
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
      parsed.searchParams.has("url")
    ) {
      const target = parsed.searchParams.get("url");
      const targetParsed = new URL(target);
      if (
        targetParsed.protocol === "http:" ||
        targetParsed.protocol === "https:"
      ) {
        return target;
      }
    }
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "localhost"
    ) {
      return url;
    }
  } catch {}
  return undefined;
}

class DiscordRPC extends EventEmitter {
  constructor(options = {}) {
    super();
    this.enabled = options.enabled !== false;
    this.clientId = options.clientId || DEFAULT_CLIENT_ID;
    this.activityType = options.activityType || "Listening"; // "Listening" | "Playing"
    this.showTimeline = options.showTimeline !== false;
    this.showThumbnail = options.showThumbnail !== false;
    this.showIdle = options.showIdle !== false;
    this.idleDetails = options.idleDetails || "Chờ phát nhạc";
    this.idleState = options.idleState || "Zimusix";

    this.socket = null;
    this.rxBuffer = Buffer.alloc(0);
    this.connected = false;
    this.user = null;
    this.currentActivity = null;
    this.reconnectTimer = null;
    this.destroyed = false;
    this.idleStartedAt = Date.now();

    if (this.enabled) {
      this.connect();
    }
  }

  getIpcPaths() {
    const paths = [];
    if (process.platform === "win32") {
      for (let i = 0; i < 10; i++) {
        paths.push(`\\\\?\\pipe\\discord-ipc-${i}`);
        paths.push(`\\\\.\\pipe\\discord-ipc-${i}`);
      }
    } else {
      const envDirs = [
        process.env.XDG_RUNTIME_DIR,
        process.env.TMPDIR,
        process.env.TMP,
        process.env.TEMP,
        "/tmp",
      ].filter(Boolean);

      for (const dir of envDirs) {
        for (let i = 0; i < 10; i++) {
          paths.push(path.join(dir, `discord-ipc-${i}`));
        }
      }
    }
    return paths;
  }

  connect() {
    if (!this.enabled || this.destroyed || this.socket || this.connected)
      return;

    const candidatePaths = this.getIpcPaths();
    let index = 0;

    const tryNext = () => {
      if (!this.enabled || this.destroyed || this.socket) return;
      if (index >= candidatePaths.length) {
        this.scheduleReconnect();
        return;
      }

      const ipcPath = candidatePaths[index++];
      const sock = net.connect(ipcPath);

      sock.once("connect", () => {
        this.socket = sock;
        this.rxBuffer = Buffer.alloc(0);
        this.setupSocket(sock);
        this.sendHandshake();
      });

      sock.once("error", () => {
        sock.destroy();
        tryNext();
      });
    };

    tryNext();
  }

  setupSocket(sock) {
    sock.on("data", (chunk) => {
      this.rxBuffer = Buffer.concat([this.rxBuffer, chunk]);
      while (this.rxBuffer.length >= 8) {
        const opcode = this.rxBuffer.readInt32LE(0);
        const length = this.rxBuffer.readInt32LE(4);
        if (this.rxBuffer.length < 8 + length) break;

        const payloadBytes = this.rxBuffer.subarray(8, 8 + length);
        this.rxBuffer = this.rxBuffer.subarray(8 + length);

        try {
          const text = payloadBytes.toString("utf8");
          const message = JSON.parse(text);
          this.handleMessage(opcode, message);
        } catch (err) {
          console.error("[discord-rpc] Frame parse error:", err.message);
        }
      }
    });

    sock.on("close", () => {
      this.onDisconnect();
    });

    sock.on("error", () => {
      this.onDisconnect();
    });
  }

  handleMessage(opcode, message) {
    if (opcode === OPCODES.FRAME) {
      if (message.evt === "READY") {
        this.connected = true;
        this.user = message.data?.user ?? null;
        this.emit("ready", this.user);
        this.emit("statusChange", this.getStatus());
        if (this.currentActivity) {
          this.sendActivity(this.currentActivity);
        } else {
          this.setIdleActivity();
        }
      } else if (message.evt === "ERROR") {
        console.warn("[discord-rpc] Discord error response:", message.data);
      }
    } else if (opcode === OPCODES.PING) {
      this.sendPacket(OPCODES.PONG, message);
    } else if (opcode === OPCODES.CLOSE) {
      this.disconnect();
      this.scheduleReconnect();
    }
  }

  sendHandshake() {
    this.sendPacket(OPCODES.HANDSHAKE, {
      v: 1,
      client_id: this.clientId,
    });
  }

  sendPacket(opcode, payload) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      const json = JSON.stringify(payload);
      const jsonBuf = Buffer.from(json, "utf8");
      const header = Buffer.alloc(8);
      header.writeInt32LE(opcode, 0);
      header.writeInt32LE(jsonBuf.length, 4);
      this.socket.write(Buffer.concat([header, jsonBuf]));
    } catch (err) {
      console.error("[discord-rpc] Send packet error:", err.message);
    }
  }

  sendActivity(activity) {
    if (!this.connected || !this.socket) return;
    this.sendPacket(OPCODES.FRAME, {
      cmd: "SET_ACTIVITY",
      args: {
        pid: process.pid,
        activity,
      },
      nonce: crypto.randomUUID(),
    });
  }

  setIdleActivity() {
    if (!this.enabled || !this.showIdle) {
      this.clearActivity();
      return;
    }

    if (!this.idleStartedAt) {
      this.idleStartedAt = Date.now();
    }

    const details = sanitizeString(this.idleDetails || "Chờ phát nhạc");
    const state = sanitizeString(this.idleState || "Zimusix");
    const assets = {
      large_text: sanitizeString(this.idleState || "Zimusix"),
    };

    const activity = {
      details,
      state,
      assets,
      timestamps: { start: this.idleStartedAt },
      type: this.activityType === "Playing" ? 0 : 2,
    };

    this.currentActivity = activity;
    this.emit("activity", activity);
    this.sendActivity(activity);
  }

  updateActivity(track, state = {}) {
    if (!this.enabled) return;
    if (!track) {
      this.setIdleActivity();
      return;
    }

    this.idleStartedAt = null;
    const {
      positionMs = 0,
      durationMs = 0,
      isPaused = false,
      isLive = false,
    } = state;
    const details = sanitizeString(track.title || "Untitled track");
    const authorText = track.author ? `by ${track.author}` : "Zimusix";
    const stateText = isPaused ? `${authorText} (Paused)` : authorText;
    const activityState = sanitizeString(stateText);

    let timestamps;
    if (this.showTimeline && !isPaused) {
      const start = Math.floor(Date.now() - Math.max(0, positionMs));
      timestamps = { start };
      if (durationMs > 0 && !isLive) {
        timestamps.end = Math.floor(start + durationMs);
      }
    }

    let largeImage;
    if (this.showThumbnail) {
      largeImage = resolveExternalThumbnail(track.thumbnail);
    }

    const assets = {
      large_image: largeImage,
      large_text: sanitizeString(track.title || "Zimusix"),
      small_image: isPaused ? "pause" : "play",
      small_text: isPaused ? "Paused" : "Playing",
    };

    const activity = {
      details,
      state: activityState,
      assets,
      type: this.activityType === "Playing" ? 0 : 2,
    };
    if (timestamps) activity.timestamps = timestamps;

    this.currentActivity = activity;
    this.emit("activity", activity);
    this.sendActivity(activity);
  }

  clearActivity() {
    this.currentActivity = null;
    this.emit("activity", null);
    if (!this.connected || !this.socket) return;
    this.sendActivity(null);
  }

  setOptions(opts = {}) {
    let needReconnect = false;

    if (typeof opts.enabled === "boolean" && opts.enabled !== this.enabled) {
      this.enabled = opts.enabled;
      if (!this.enabled) {
        this.clearActivity();
        this.disconnect();
      } else {
        needReconnect = true;
      }
    }

    if (opts.clientId && opts.clientId !== this.clientId) {
      this.clientId = opts.clientId;
      if (this.enabled) needReconnect = true;
    }

    if (opts.activityType) this.activityType = opts.activityType;
    if (typeof opts.showTimeline === "boolean")
      this.showTimeline = opts.showTimeline;
    if (typeof opts.showThumbnail === "boolean")
      this.showThumbnail = opts.showThumbnail;
    if (typeof opts.showIdle === "boolean") this.showIdle = opts.showIdle;
    if (opts.idleDetails) this.idleDetails = opts.idleDetails;
    if (opts.idleState) this.idleState = opts.idleState;

    if (needReconnect) {
      this.disconnect();
      if (this.enabled) this.connect();
    } else if (this.connected && !this.currentActivity && this.showIdle) {
      this.setIdleActivity();
    }

    this.emit("statusChange", this.getStatus());
  }

  getStatus() {
    return {
      enabled: this.enabled,
      connected: this.connected,
      user: this.user,
      clientId: this.clientId,
      activityType: this.activityType,
      showTimeline: this.showTimeline,
      showThumbnail: this.showThumbnail,
      showIdle: this.showIdle,
      idleDetails: this.idleDetails,
      idleState: this.idleState,
      currentActivity: this.currentActivity,
    };
  }

  onDisconnect() {
    this.connected = false;
    this.user = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    this.emit("statusChange", this.getStatus());
    this.scheduleReconnect();
  }

  disconnect() {
    this.connected = false;
    this.user = null;
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.emit("statusChange", this.getStatus());
  }

  scheduleReconnect() {
    if (this.destroyed || !this.enabled || !this.socket || this.reconnectTimer)
      return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 10_000).unref();
  }

  destroy() {
    this.destroyed = true;
    this.clearActivity();
    this.disconnect();
  }
}

function createDiscordRpc(options) {
  return new DiscordRPC(options);
}

module.exports = {
  DiscordRPC,
  createDiscordRpc,
  DEFAULT_CLIENT_ID,
};
