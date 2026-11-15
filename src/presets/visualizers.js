/**
 * Các kiểu vẽ visualizer. Mỗi hàm nhận mảng `bands` (giá trị 0..1) và vẽ lên canvas 2D
 * kích thước w×h (đơn vị CSS px — canvas đã được scale theo devicePixelRatio ở nơi gọi).
 */

export const VIZ_TYPES = ["bars", "mirror", "wave", "circle", "dots"];

/** Một cột bo tròn; roundRect có sẵn trên WebView2/Chromium, thiếu thì rơi về fillRect. */
function pill(ctx, x, y, w, h, r) {
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}

/** Canvas lớn (khu Đang phát, nền) thì thêm quầng sáng; canvas nhỏ trên thanh phát giữ nguyên cho nhẹ. */
function glow(ctx, w, style) {
  if (w < 240 || style.glow === false) return;
  ctx.shadowColor = style.colorMode === "solid" ? style.color : style.accent;
  ctx.shadowBlur = 12;
}

function bars(ctx, bands, w, h, style) {
  const n = bands.length;
  const gap = Math.min(Math.max(style.thickness, 2), w / n / 2);
  const bw = (w - gap * (n - 1)) / n;
  const r = Math.min(bw / 2, 6);
  glow(ctx, w, style);
  ctx.beginPath(); // một path cho cả dải: quầng sáng chỉ tính một lần
  for (let i = 0; i < n; i++) {
    const bh = Math.max(Math.min(bw, 4), bands[i] * h);
    pill(ctx, i * (bw + gap), h - bh, bw, bh, r);
  }
  ctx.fill();
}

function mirror(ctx, bands, w, h, style) {
  const n = bands.length;
  const gap = Math.min(Math.max(style.thickness, 2), w / n / 2);
  const bw = (w - gap * (n - 1)) / n;
  const r = Math.min(bw / 2, 6);
  glow(ctx, w, style);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const bh = Math.max(Math.min(bw, 4), bands[i] * h);
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
  // phần tô mờ bên dưới đường
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
  // ring: vòng ôm ảnh bìa — để trống phần giữa cho ảnh, vạch mọc ra ngoài
  const r0 = base * (ring ? 0.33 : 0.26);
  const maxLen = base * (ring ? 0.15 : 0.24);
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
