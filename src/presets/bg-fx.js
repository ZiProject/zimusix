/** Canvas background effects: particles floating slowly, accelerating with music energy. */
import { reactive } from "./reactive.js";

let canvas = null;
let raf = 0;
let particles = [];
let opts = { count: 70, speed: 1, intensity: 0.6, react: true, colors: ["#7c5cff"] };
let lastW = 0;
let lastH = 0;

function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (w !== canvas.width || h !== canvas.height) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

function spawn(w, h, anywhere = true) {
  return {
    x: Math.random() * w,
    y: anywhere ? Math.random() * h : h + 10,
    r: 1 + Math.random() * 3.2,
    vy: 0.15 + Math.random() * 0.55,
    vx: (Math.random() - 0.5) * 0.25,
    a: 0.25 + Math.random() * 0.6,
    c: Math.floor(Math.random() * 1000),
    p: Math.random() * Math.PI * 2,
  };
}

function frame(time) {
  raf = requestAnimationFrame(frame);
  if (document.hidden || !canvas) return;
  const { w, h, dpr } = fit();
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  while (particles.length < opts.count) particles.push(spawn(w, h));
  if (particles.length > opts.count) particles.length = opts.count;
  const boost = opts.react && reactive.active ? 1 + reactive.energy * 2.2 + reactive.bass * 1.5 : 1;
  const colors = opts.colors;
  for (const p of particles) {
    p.y -= p.vy * opts.speed * boost * dpr;
    p.x += (p.vx + Math.sin(time / 1800 + p.p) * 0.15) * opts.speed * dpr;
    if (p.y < -10 || p.x < -10 || p.x > w + 10) Object.assign(p, spawn(w, h, false));
    ctx.globalAlpha = Math.min(1, p.a * opts.intensity * (opts.react ? 0.7 + reactive.bass * 0.6 : 1));
    ctx.fillStyle = colors[p.c % colors.length];
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * dpr * (1 + (opts.react ? reactive.bass * 0.5 : 0)), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  lastW = w;
  lastH = h;
}

export function startParticles(el, options) {
  opts = { ...opts, ...options };
  if (canvas !== el) {
    canvas = el;
    particles = [];
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

export function stopParticles() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  canvas?.getContext("2d")?.clearRect(0, 0, lastW || canvas.width, lastH || canvas.height);
  particles = [];
}
