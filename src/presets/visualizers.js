/**
 * Các kiểu vẽ visualizer. Mỗi hàm nhận mảng `bands` (giá trị 0..1) và vẽ lên canvas 2D
 * kích thước w×h (đơn vị CSS px — canvas đã được scale theo devicePixelRatio ở nơi gọi).
 */

export const VIZ_TYPES = ["bars", "mirror", "wave", "circle", "dots"];

function bars(ctx, bands, w, h, { thickness }) {
  const n = bands.length;
  const gap = Math.min(thickness, w / n / 2);
  const bw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const bh = Math.max(2, bands[i] * h);
    ctx.fillRect(i * (bw + gap), h - bh, bw, bh);
  }
}

function mirror(ctx, bands, w, h, { thickness }) {
  const n = bands.length;
  const gap = Math.min(thickness, w / n / 2);
  const bw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const bh = Math.max(2, bands[i] * h);
    ctx.fillRect(i * (bw + gap), (h - bh) / 2, bw, bh);
  }
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
  // phần tô mờ bên dưới đường
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.18;
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha;
}

function circle(ctx, bands, w, h, { thickness }) {
  const n = bands.length;
  const cx = w / 2;
  const cy = h / 2;
  const base = Math.min(w, h);
  const r0 = base * 0.26;
  const maxLen = base * 0.24;
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(2, thickness);
  // đối xứng trái/phải cho cân đối
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

/** Tạo màu tô theo `colorMode`. */
export function makeFill(ctx, type, w, h, { colorMode, color, accent, accent2 }) {
  if (colorMode === "accent") return accent;
  if (colorMode === "solid") return color;
  const horizontal = type === "wave" || type === "circle";
  const grad = horizontal ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, h, 0, 0);
  grad.addColorStop(0, accent);
  grad.addColorStop(1, accent2);
  return grad;
}

/** Vẽ một khung hình. */
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
