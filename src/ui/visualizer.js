import { audio } from "../features/audio.js";
import { app, refs } from "../state.js";

const bandBuffer = new Float32Array(32);

let bassAvg = 0;

export function drawViz() {
  requestAnimationFrame(drawViz);
  const canvas = refs.viz;
  if (!canvas || document.hidden) return;
  const ctx = canvas.getContext("2d");
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  const s = app.state;
  const isAudioActive = Boolean(audio && s?.isPlaying && !s.isPaused);
  if (!isAudioActive) {
    document.documentElement.style.setProperty("--music-bass", "0");
    document.documentElement.style.setProperty("--music-energy", "0");
    if (refs.cover) {
      refs.cover.style.transform = "";
      refs.cover.style.filter = "";
    }
    return;
  }

  const bands = audio.getFrequencyBands?.({
    bands: bandBuffer.length,
    minHz: 30,
    maxHz: 16000,
    outputBuffer: bandBuffer,
  });
  if (!bands) return;

  // Calculate reactive parameters
  let bassSum = 0;
  for (let i = 0; i < 5; i++) bassSum += bands[i];
  const bass = Math.min(1, bassSum / 5);

  let totalSum = 0;
  for (let i = 0; i < bands.length; i++) totalSum += bands[i];
  const energy = Math.min(1, totalSum / bands.length);

  // Beat pulse
  bassAvg = bassAvg * 0.9 + bass * 0.1;

  // Update CSS reactive variables (hardware-accelerated GPU styling)
  document.documentElement.style.setProperty("--music-bass", bass.toFixed(3));
  document.documentElement.style.setProperty(
    "--music-energy",
    energy.toFixed(3),
  );

  // 1. Album cover react (pulse on bass)
  if (refs.cover) {
    const scale = 1 + bass * 0.08;
    const glow = Math.round(bass * 20);
    refs.cover.style.transform = `scale(${scale})`;
    refs.cover.style.filter = `drop-shadow(0 0 ${glow}px var(--accent))`;
  }

  // 2. Active lyric line react
  const activeLyric = document.querySelector(".lyric-line.active");
  if (activeLyric) {
    const glow = Math.round(bass * 16);
    const glow2 = Math.round(energy * 24);
    activeLyric.style.textShadow = `0 0 ${glow}px var(--accent-2), 0 0 ${glow2}px var(--accent)`;
  }

  // 3. Draw equalizer bars on canvas
  const gap = 2;
  const barWidth = (width - gap * (bands.length - 1)) / bands.length;
  const accent =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent")
      .trim() || "#7c5cff";
  const accent2 =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--accent-2")
      .trim() || "#a78bfa";

  const grad = ctx.createLinearGradient(0, height, 0, 0);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, accent2);
  ctx.fillStyle = grad;

  for (let i = 0; i < bands.length; i++) {
    const barHeight = Math.max(2, bands[i] * height);
    ctx.fillRect(i * (barWidth + gap), height - barHeight, barWidth, barHeight);
  }
}
