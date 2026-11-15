import { audio } from "../features/audio.js";
import { drawVisualizer } from "../presets/visualizers.js";
import { reactive } from "../presets/reactive.js";
import { cfg, onPresetChange } from "../presets/runtime.js";
import { app, refs } from "../state.js";

const REACT_BANDS = 32; // số dải dùng để tính bass/energy (độc lập với số cột hiển thị)
const reactBuffer = new Float32Array(REACT_BANDS);
let drawBuffer = new Float32Array(REACT_BANDS);
let smoothBuffer = new Float32Array(REACT_BANDS);

const rootStyle = document.documentElement.style;

// Chỉ ghi CSS variable khi giá trị đổi đáng kể (mỗi lần ghi buộc trình duyệt tính lại style toàn trang).
const lastVars = new Map();
function setVar(name, value, epsilon = 0) {
  const prev = lastVars.get(name);
  if (prev !== undefined && Math.abs(prev - Number(value)) <= epsilon) return;
  lastVars.set(name, Number(value));
  rootStyle.setProperty(name, String(value));
}

// getComputedStyle mỗi khung hình rất tốn: màu chỉ đọc lại khi preset/tuỳ chỉnh đổi.
let colors = null;
onPresetChange(() => (colors = null));
function accentColors() {
  if (!colors) {
    const css = getComputedStyle(document.documentElement);
    colors = {
      accent: css.getPropertyValue("--accent").trim() || "#7c5cff",
      accent2: css.getPropertyValue("--accent-2").trim() || "#a78bfa",
    };
  }
  return colors;
}

let drewLastFrame = false;

/** Canvas có kích thước theo CSS (khu Đang phát, nền): đồng bộ độ phân giải với devicePixelRatio. */
function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (!w || !h) return null;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { dpr, w: canvas.clientWidth, h: canvas.clientHeight };
}

/** Các canvas cần vẽ theo `visualizer.placement`. */
function targets(placement) {
  const out = [];
  if (placement.includes("player") && refs.viz)
    out.push({ canvas: refs.viz, fixed: true });
  if (placement.includes("stage")) {
    const stage = document.querySelector(".stage-viz");
    if (stage) out.push({ canvas: stage, fixed: false });
  }
  if (placement.includes("background")) {
    const bg = document.getElementById("bg-viz");
    if (bg) out.push({ canvas: bg, fixed: false });
  }
  return out;
}

function clearAll() {
  if (!drewLastFrame) return; // không vẽ gì ở khung trước thì không cần xoá
  drewLastFrame = false;
  const canvases = [
    refs.viz,
    document.querySelector(".stage-viz"),
    document.getElementById("bg-viz"),
  ];
  for (const canvas of canvases) {
    if (!canvas?.width) continue;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }
}

export function drawViz() {
  requestAnimationFrame(drawViz);
  if (document.hidden) return;
  const s = app.state;
  const isAudioActive = Boolean(audio && s?.isPlaying && !s.isPaused);
  clearAll();

  if (!isAudioActive) {
    reactive.active = false;
    reactive.bass = 0;
    reactive.energy = 0;
    setVar("--music-bass", 0);
    setVar("--music-energy", 0);
    return;
  }

  const viz = cfg().visualizer;

  // Dải cố định để tính bass/energy — chạy cả khi visualizer tắt, vì ảnh bìa/nền/lyrics vẫn phản ứng theo nhạc
  const reactBands = audio.getFrequencyBands?.({
    bands: REACT_BANDS,
    minHz: 30,
    maxHz: 16000,
    outputBuffer: reactBuffer,
  });
  if (!reactBands) return;

  let bassSum = 0;
  for (let i = 0; i < 5; i++) bassSum += reactBands[i];
  const bass = Math.min(1, bassSum / 5);
  let totalSum = 0;
  for (let i = 0; i < reactBands.length; i++) totalSum += reactBands[i];
  const energy = Math.min(1, totalSum / reactBands.length);

  reactive.active = true;
  reactive.bass = bass;
  reactive.energy = energy;
  setVar("--music-bass", bass.toFixed(3), 0.004);
  setVar("--music-energy", energy.toFixed(3), 0.004);

  // Dòng lyric đang hát phát sáng theo nhạc (preset có thể tắt)
  const activeLyric = document.querySelector(".lyric-line.active");
  if (activeLyric) {
    if (cfg().lyrics.glow) {
      const glow = Math.round(bass * 16);
      const glow2 = Math.round(energy * 24);
      const shadow = `0 0 ${glow}px var(--accent-2), 0 0 ${glow2}px var(--accent)`;
      if (activeLyric.style.textShadow !== shadow) activeLyric.style.textShadow = shadow;
    } else activeLyric.style.textShadow = "";
  }

  if (viz.type === "none") return;
  const list = targets(viz.placement);
  if (!list.length) return;

  // Số cột do preset quyết định
  let bands = reactBands;
  if (viz.bars !== REACT_BANDS) {
    if (drawBuffer.length !== viz.bars) drawBuffer = new Float32Array(viz.bars);
    bands = audio.getFrequencyBands?.({
      bands: viz.bars,
      minHz: 30,
      maxHz: 16000,
      outputBuffer: drawBuffer,
    });
    if (!bands) return;
  }
  if (smoothBuffer.length !== bands.length)
    smoothBuffer = new Float32Array(bands.length);
  const k = viz.smoothing;
  if (k > 0)
    for (let i = 0; i < bands.length; i++)
      smoothBuffer[i] = smoothBuffer[i] * k + bands[i] * (1 - k);
  const shown = k > 0 ? smoothBuffer : bands;

  const { accent, accent2 } = accentColors();
  const style = {
    colorMode: viz.colorMode,
    color: viz.color,
    accent,
    accent2,
    thickness: viz.thickness,
    opacity: viz.opacity,
  };

  drewLastFrame = true;
  for (const { canvas, fixed } of list) {
    const ctx = canvas.getContext("2d");
    if (fixed) {
      // canvas trên thanh phát có kích thước cố định (thuộc tính width/height)
      drawVisualizer(ctx, viz.type, shown, canvas.width, canvas.height, style);
      continue;
    }
    const fit = fitCanvas(canvas);
    if (!fit) continue;
    ctx.setTransform(fit.dpr, 0, 0, fit.dpr, 0, 0);
    drawVisualizer(ctx, viz.type, shown, fit.w, fit.h, canvas.classList.contains("stage-viz-ring") ? { ...style, ring: true } : style);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
