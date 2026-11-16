/**
 * Visualizer draw modes. Each function receives `bands` array (values 0..1) and draws onto 2D canvas
 * with dimensions w×h (CSS px units — canvas is scaled by caller according to devicePixelRatio).
 */

export const VIZ_TYPES = ["bars", "mirror", "wave", "circle", "dots"];

/** Rounded pillar; roundRect available on Chromium/WebView2, falls back to rect. */
function pill(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}

/** Large canvas (stage, bg) adds glow; small player bar canvas keeps it lightweight without glow. */
function glow(ctx, w, style) {
  if (w < 240 || style.glow === false) return;
  if (style.colorMode === "spectrum")
    ctx.shadowColor = "rgba(34, 211, 238, 0.8)";
  else
    ctx.shadowColor = style.colorMode === "solid" ? style.color : style.accent;
  ctx.shadowBlur = 12;
}

// Palette copied from MusicPlayerView ("spectrum" colorMode).
const SPECTRUM = {
  low: "rgba(6, 182, 212, 0.22)", // cyan-500
  mid: "rgba(34, 211, 238, 0.85)", // cyan-400
  high: "rgba(190, 242, 100, 0.95)", // lime-300
  peak: "rgba(244, 114, 182, 0.95)", // pink-400
};
const MAX_BAR_RATIO = 0.82; // bars never fill the whole canvas height (same as MusicPlayerView)
const MIN_BAR_PX = 3;

/** Per-bar vertical gradient: color scales with bar height (like MusicPlayerView). */
function barFill(ctx, style, h, y) {
  if (style.colorMode === "accent") return style.accent;
  if (style.colorMode === "solid") return style.color;
  const grad = ctx.createLinearGradient(0, h, 0, y);
  if (style.colorMode === "spectrum") {
    grad.addColorStop(0, SPECTRUM.low);
    grad.addColorStop(0.55, SPECTRUM.mid);
    grad.addColorStop(1, SPECTRUM.high);
  } else {
    grad.addColorStop(0, style.accent);
    grad.addColorStop(1, style.accent2);
  }
  return grad;
}

/** Bar with rounded top corners only, sitting on the baseline. */
function topRounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, [r, r, 0, 0]);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

function bars(ctx, bands, w, h, style) {
  const n = bands.length;
  const gap = Math.min(Math.max(style.thickness, 2), w / n / 2);
  const bw = Math.max(2, (w - gap * (n - 1)) / n);
  const r = Math.min(bw / 2, 2.5);
  const maxH = h * MAX_BAR_RATIO;
  const peaks = style.peaks;
  if (style.colorMode !== "spectrum") glow(ctx, w, style); // MusicPlayerView bars have no glow
  for (let i = 0; i < n; i++) {
    const bh = Math.max(MIN_BAR_PX, bands[i] * maxH);
    const x = i * (bw + gap);
    const y = h - bh;
    ctx.fillStyle = barFill(ctx, style, h, y);
    topRounded(ctx, x, y, bw, bh, r);
  }
  // Peak-hold caps
  if (peaks && peaks.length >= n) {
    const prevShadow = ctx.shadowBlur;
    ctx.shadowBlur = 0;
    ctx.fillStyle =
      style.colorMode === "spectrum" ? SPECTRUM.peak : style.accent2;
    for (let i = 0; i < n; i++) {
      const ph = peaks[i] * maxH;
      if (ph > 4) ctx.fillRect(i * (bw + gap), Math.max(0, h - ph - 2), bw, 2);
    }
    ctx.shadowBlur = prevShadow;
  }
}

function mirror(ctx, bands, w, h, style) {
  const n = bands.length;
  const gap = Math.min(Math.max(style.thickness, 2), w / n / 2);
  const bw = Math.max(2, (w - gap * (n - 1)) / n);
  const r = Math.min(bw / 2, 6);
  const maxH = h * MAX_BAR_RATIO;
  glow(ctx, w, style);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const bh = Math.max(MIN_BAR_PX, bands[i] * maxH);
    pill(ctx, i * (bw + gap), (h - bh) / 2, bw, bh, r);
  }
  ctx.fill();
}

function wave(ctx, bands, w, h, { thickness }) {
  const n = bands.length;
  if (n < 2) return;
  const pad = thickness;
  const y = (i) => h - pad - bands[i] * (h - pad * 2);
  const x = (i) => (i / (n - 1)) * w;
  ctx.lineWidth = Math.max(1.5, thickness);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x(0), y(0));
  for (let i = 1; i < n - 1; i++) {
    const mx = (x(i) + x(i + 1)) / 2;
    const my = (y(i) + y(i + 1)) / 2;
    ctx.quadraticCurveTo(x(i), y(i), mx, my);
  }
  ctx.lineTo(x(n - 1), y(n - 1));
  ctx.stroke();
  // Translucent fill beneath line
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.18;
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha;
}

function circle(ctx, bands, w, h, { thickness, ring }) {
  const n = bands.length;
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h);
  // ring: circle wrapping artwork — center left blank for image, bars point outward
  const r0 = base * (ring ? 0.33 : 0.26);
  const maxLen = base * (ring ? 0.15 : 0.24);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, thickness);
  // Symmetrical left/right for balanced appearance
  for (let i = 0; i < n; i++) {
    const len = Math.max(2, bands[i] * maxLen);
    const a = (i / (n - 1 || 1)) * Math.PI - Math.PI / 2;
    for (const dir of [1, -1]) {
      const ax = Math.cos(a) * dir;
      const ay = Math.sin(a);
      ctx.beginPath();
      ctx.moveTo(cx + ax * r0, cy + ay * r0);
      ctx.lineTo(cx + ax * (r0 + len), cy + ay * (r0 + len));
      ctx.stroke();
    }
  }
}

function dots(ctx, bands, w, h) {
  const n = bands.length;
  const rows = 8;
  const colW = w / n;
  const rowH = h / rows;
  const r = Math.max(1, Math.min(colW, rowH) / 2.3);
  for (let i = 0; i < n; i++) {
    const lit = Math.max(1, Math.round(bands[i] * rows));
    for (let j = 0; j < lit; j++) {
      ctx.beginPath();
      ctx.arc(colW * (i + 0.5), h - rowH * (j + 0.5), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const DRAW = { bars, mirror, wave, circle, dots };

/** Create fill color/gradient based on `colorMode`. */
export function makeFill(
  ctx,
  type,
  w,
  h,
  { colorMode, color, accent, accent2 },
) {
  if (colorMode === "accent") return accent;
  if (colorMode === "solid") return color;
  if (colorMode === "spectrum") {
    const horizontal = type === "wave" || type === "circle";
    const g = horizontal
      ? ctx.createLinearGradient(0, 0, w, 0)
      : ctx.createLinearGradient(0, h, 0, 0);
    g.addColorStop(0, SPECTRUM.low);
    g.addColorStop(0.55, SPECTRUM.mid);
    g.addColorStop(1, SPECTRUM.high);
    return g;
  }
  const horizontal = type === "wave" || type === "circle";
  const grad = horizontal
    ? ctx.createLinearGradient(0, 0, w, 0)
    : ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, accent2);
  return grad;
}

/** Draw one frame. */
export function drawVisualizer(ctx, type, bands, w, h, style) {
  const draw = DRAW[type];
  if (!draw) return;
  ctx.save();
  ctx.globalAlpha = style.opacity;
  const fill = makeFill(ctx, type, w, h, style);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  draw(ctx, bands, w, h, style);
  ctx.restore();
}
