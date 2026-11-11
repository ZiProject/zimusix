import { ensureAudio, syncAudio } from "../features/audio.js";
import { seekVideoIfBuffered, toggleVideoBg } from "../features/background.js";
import { switchView } from "../features/layout.js";
import { updateLyricsSync } from "../features/lyrics.js";
import { control } from "../features/playback.js";
import { disconnectApp } from "../features/voice.js";
import { fmtTime, h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { toast } from "../lib/toast.js";
import { app, refs } from "../state.js";
import { badge, targetLabel, trackCover } from "./shared.js";
import { drawWires, finishWireDrag, moveWireDrag, renderWiringPanel } from "./wiring.js";

export let dragging = false;

export function buildPlayer() {
  document.addEventListener("pointermove", moveWireDrag);
  document.addEventListener("pointerup", finishWireDrag);
  refs.cover = h("div", { class: "cover-slot" });
  refs.title = h("div", { class: "np-title" }, "Chưa phát");
  refs.sub = h("div", { class: "np-sub" });
  refs.btnPlay = h("button", {
    class: "play-btn",
    title: "Phát / Tạm dừng",
    onclick: () => onPlayPause(),
  });
  refs.btnLoop = h("button", {
    class: "icon-btn",
    title: "Lặp",
    onclick: () => cycleLoop(),
  });
  refs.btnAuto = h(
    "button",
    {
      class: "icon-btn",
      title: "Tự động phát bài liên quan",
      onclick: () => control("autoplay", { enabled: !app.state?.autoPlay }),
    },
    icon("infinity", 18),
  );
  refs.btnListen = h(
    "button",
    {
      class: "icon-btn",
      title: "Nghe trong app",
      onclick: () => {
        if (app.listen) {
          void disconnectApp();
          return;
        }
        app.webAudioSourceTarget = app.target;
        app.listen = true;
        renderPlayer();
        syncAudio();
      },
    },
    icon("headphones", 18),
  );
  refs.btnLyrics = h(
    "button",
    {
      class: "icon-btn",
      title: "Lời bài hát (Sync)",
      onclick: () => switchView("lyrics"),
    },
    icon("mic", 18),
  );
  refs.btnVideo = h(
    "button",
    {
      class: "icon-btn",
      title: "Video Background (player.saveVideo)",
      onclick: () => toggleVideoBg(),
    },
    icon("video", 18),
  );
  refs.btnVoiceLink = h(
    "button",
    {
      class: "icon-btn wire-toggle",
      title: "Nối đầu ra Voice",
      onclick: () => {
        app.wiringOpen = !app.wiringOpen;
        if (app.wiringOpen) app.wireSourceTarget = app.target;
        renderPlayer();
      },
    },
    icon("link", 18),
  );
  refs.wiringPanel = h("div", { class: "wiring-popover" });
  refs.cur = h("span", { class: "time" }, "0:00");
  refs.dur = h("span", { class: "time" }, "0:00");
  refs.seek = h("input", {
    type: "range",
    min: 0,
    max: 1000,
    value: 0,
    class: "seek",
    oninput: () => {
      dragging = true;
      refs.cur.textContent = fmtTime(
        (refs.seek.value / 1000) * (app.state?.duration ?? 0),
      );
    },
    onchange: async () => {
      const positionMs = (refs.seek.value / 1000) * (app.state?.duration ?? 0);
      await control("seek", { positionMs });
      dragging = false;
      seekVideoIfBuffered(
        document.getElementById("bg-video"),
        positionMs / 1000,
      );
    },
  });
  refs.volume = h("input", {
    type: "range",
    min: 0,
    max: 100,
    value: 80,
    class: "volume",
    oninput: (e) => control("volume", { volume: Number(e.target.value) }),
  });
  refs.viz = h("canvas", { class: "viz", width: 160, height: 44 });

  refs.player.replaceChildren(
    refs.wiringPanel,
    h(
      "div",
      { class: "np" },
      refs.cover,
      h("div", { class: "np-text" }, refs.title, refs.sub),
    ),
    h(
      "div",
      { class: "transport" },
      h(
        "div",
        { class: "buttons" },
        h(
          "button",
          {
            class: "icon-btn",
            title: "Trộn hàng đợi",
            onclick: () => control("shuffle"),
          },
          icon("shuffle", 18),
        ),
        h(
          "button",
          {
            class: "icon-btn big",
            title: "Bài trước",
            onclick: () => control("previous"),
          },
          icon("prev", 22),
        ),
        refs.btnPlay,
        h(
          "button",
          {
            class: "icon-btn big",
            title: "Bài tiếp",
            onclick: () => control("skip"),
          },
          icon("next", 22),
        ),
        refs.btnLoop,
        refs.btnAuto,
      ),
      h("div", { class: "progress" }, refs.cur, refs.seek, refs.dur),
    ),
    h(
      "div",
      { class: "extras" },
      refs.viz,
      refs.btnLyrics,
      refs.btnVideo,
      refs.btnVoiceLink,
      refs.btnListen,
      icon("volume", 18),
      refs.volume,
    ),
  );
  renderPlayer();
}

export async function onPlayPause() {
  await ensureAudio();
  const s = app.state;
  if (s?.currentTrack && s.isPlaying && !s.isPaused) control("pause");
  else if (s?.currentTrack && s.isPaused) control("resume");
  else if (s?.currentTrack) control("resume");
  else toast("Chưa có bài nào. Hãy tìm nhạc hoặc thêm file local.", "info");
}

function cycleLoop() {
  const next = { off: "queue", queue: "track", track: "off" }[
    app.state?.loop ?? "off"
  ];
  control("loop", { mode: next });
}

export function renderPlayer() {
  if (!refs.cover) return;
  const s = app.state;
  const track = s?.currentTrack;
  refs.cover.replaceChildren(trackCover(track, 56));
  refs.title.textContent = track?.title ?? "Chưa phát";
  refs.sub.replaceChildren(
    ...(track
      ? [badge(track.source), track.author ? ` ${track.author}` : ""]
      : [`Phát tới: ${targetLabel()}`]),
  );
  const playing = Boolean(track && s.isPlaying && !s.isPaused);
  refs.btnPlay.replaceChildren(icon(playing ? "pause" : "play", 26));
  refs.btnLoop.className = `icon-btn ${s?.loop && s.loop !== "off" ? "on" : ""}`;
  refs.btnLoop.title = `Lặp: ${{ off: "tắt", queue: "hàng đợi", track: "bài này" }[s?.loop ?? "off"]}`;
  refs.btnLoop.replaceChildren(
    ...[
      icon("repeat", 18),
      s?.loop === "track" ? h("sup", null, "1") : null,
    ].filter(Boolean),
  );
  refs.btnAuto.className = `icon-btn ${s?.autoPlay ? "on" : ""}`;
  refs.btnListen.className = `icon-btn ${app.listen ? "on" : ""}`;
  refs.btnListen.title = app.listen
    ? "Đang nghe trong app (bấm để tắt)"
    : "Nghe trong app";
  refs.btnLyrics.className = `icon-btn ${app.view === "lyrics" ? "on" : ""}`;
  refs.btnVideo.className = `icon-btn ${app.videoBg ? "on" : ""}`;
  refs.btnVideo.title = app.videoBg
    ? "Đang bật Video Background (player.saveVideo)"
    : "Video Background tắt";
  refs.btnVoiceLink.className = `icon-btn wire-toggle ${app.wiringOpen || s?.linkedVoice ? "on" : ""}`;
  refs.btnVoiceLink.title = s?.linkedVoice
    ? `Đang nối tới #${s.linkedVoice.channelName || "thoại"}`
    : "Nối đầu ra Voice";
  refs.wiringPanel.hidden = !app.wiringOpen;
  refs.wiringPanel.replaceChildren(
    ...(app.wiringOpen ? [renderWiringPanel()] : []),
  );
  refs.wiringBoard = refs.wiringPanel.querySelector(".wiring-board");
  if (app.wiringOpen) requestAnimationFrame(drawWires);
  if (s && document.activeElement !== refs.volume)
    refs.volume.value = Math.min(100, s.volume ?? 80);
  refs.seek.disabled = !track || track.isLive || !s.duration;
  updateProgress();
}

export function currentPosition() {
  const s = app.state;
  if (!s) return 0;
  const running = s.isPlaying && !s.isPaused;
  const pos = s.position + (running ? performance.now() - app.receivedAt : 0);
  return s.duration ? Math.min(pos, s.duration) : pos;
}

function updateProgress() {
  const s = app.state;
  if (!s?.currentTrack || dragging) return;
  const pos = currentPosition();
  refs.cur.textContent = s.currentTrack.isLive ? "LIVE" : fmtTime(pos);
  refs.dur.textContent = s.currentTrack.isLive ? "" : fmtTime(s.duration);
  refs.seek.value = s.duration ? Math.round((pos / s.duration) * 1000) : 0;
  updateLyricsSync();
}
setInterval(updateProgress, 250);
