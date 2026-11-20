/**
 * Music-reactive background scenes (canvas 2D), selected through `background.effect`.
 * All five scenes are original artwork written for Zimusix:
 *
 *   glyphs     — a rain of musical notes in depth layers, a vibrating staff, shock-waves on every beat
 *   hearts     — glossy hearts rising like bubbles, a lub-dub heartbeat pulse, hearts pop into sparkles
 *   fireworks  — shells over a city skyline and water; 3D-looking bursts (peony, ring, spiral, willow, crackle)
 *   rain       — layered rain, perspective puddle ripples, glowing city bokeh, lightning on the hardest hits
 *   sakura     — a blossoming branch that sheds petals into a swirling wind field under a dusk sky and moon
 *
 * Every scene reads the shared audio state (`reactive`: bass / energy) plus a small beat detector and reacts in
 * its own way. With nothing playing (or react off) they keep a calm ambient animation.
 * Presets stay declarative: they only pick a scene and numbers; all drawing code lives here.
 *
 * A scene is `{ resize(w, h, u), frame(ctx, w, h, dt, o, a) }`:
 *   w/h  canvas size in device pixels     u  size unit (≈ 1 on an 800 px-tall CSS viewport, × dpr)
 *   dt   seconds since last frame × speed o  { intensity, count, colors, ia, ba, u, dpr, time }
 *   a    audio { bass, energy, beat, hit, strength } (0..~1.4)
 */
import { reactive } from "./reactive.js";

export const SCENES = ["glyphs", "hearts", "fireworks", "rain", "sakura"];
export const isScene = (name) => SCENES.includes(name);

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Small deterministic PRNG (mulberry32) so generated shapes (skyline, branch) are stable between resizes. */
function seeded(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToHsl(hex) {
  let s = String(hex).slice(1);
  if (s.length === 3 || s.length === 4) s = [...s].map((c) => c + c).join("");
  const n = parseInt(s.slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: sat * 100, l: l * 100 };
}

/** User colors → hsl palette; falls back to the scene's own palette when none are set. */
const paletteOf = (colors, fallback) => (colors.length ? colors.map(hexToHsl) : fallback);
const hsl = (c, a = 1, dl = 0) => `hsla(${c.h.toFixed(0)},${c.s.toFixed(0)}%,${clamp(c.l + dl, 0, 100).toFixed(0)}%,${a.toFixed(3)})`;

function makeCanvas(w, h) {
  return typeof OffscreenCanvas === "function" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
}

/* ================================================================== audio */

const AUDIO = { bass: 0, energy: 0, beat: 0, hit: false, strength: 0 };
let avgBass = 0;
let lastHit = 0;

/**
 * Smooths the shared reactive state and detects beats: a "hit" is a bass value clearly above its own
 * slow average (with a refractory period); `beat` is a 0..1 pulse that decays after each hit.
 */
export function sampleAudio(nowMs, dtReal, react, sensitivity = 1) {
  AUDIO.hit = false;
  if (!react || !reactive.active) {
    AUDIO.bass *= 0.9;
    AUDIO.energy *= 0.9;
    AUDIO.beat = Math.max(0, AUDIO.beat - dtReal * 3);
    avgBass *= 0.98;
    return AUDIO;
  }
  const bass = clamp(reactive.bass * sensitivity, 0, 1.4);
  const energy = clamp(reactive.energy * sensitivity, 0, 1.4);
  AUDIO.bass = bass;
  AUDIO.energy = energy;
  avgBass += (bass - avgBass) * 0.04;
  if (bass > 0.2 && bass > avgBass * 1.3 + 0.05 && nowMs - lastHit > 190) {
    lastHit = nowMs;
    AUDIO.hit = true;
    AUDIO.beat = 1;
    AUDIO.strength = clamp((bass - avgBass) * 2 + 0.4, 0.3, 1.2);
  } else AUDIO.beat = Math.max(0, AUDIO.beat - dtReal * 3);
  return AUDIO;
}

/* ================================================================== glyphs (note rain) */

const GLYPH_PALETTE = [
  { h: 188, s: 95, l: 62 },
  { h: 262, s: 90, l: 72 },
  { h: 322, s: 90, l: 68 },
];

/** Draws a music note (0 quarter · 1 eighth · 2 beamed pair · 3 half) centred on the origin. */
function drawNote(ctx, type, s) {
  const hx = s * 0.34;
  const hy = s * 0.24;
  const stemX = hx * 0.9;
  ctx.lineWidth = Math.max(1, s * 0.09);
  ctx.lineCap = "round";
  const head = (x, y) => {
    ctx.beginPath();
    ctx.ellipse(x, y, hx, hy, -0.42, 0, TAU);
    if (type === 3) ctx.stroke();
    else ctx.fill();
  };
  head(0, 0);
  ctx.beginPath();
  ctx.moveTo(stemX, -hy * 0.2);
  ctx.lineTo(stemX, -s * 1.05);
  if (type === 1) {
    ctx.moveTo(stemX, -s * 1.05);
    ctx.bezierCurveTo(stemX + s * 0.6, -s * 0.85, stemX + s * 0.5, -s * 0.45, stemX + s * 0.2, -s * 0.28);
  }
  if (type === 2) {
    head(s * 0.78, s * 0.1);
    ctx.moveTo(stemX + s * 0.78, s * 0.02);
    ctx.lineTo(stemX + s * 0.78, -s * 0.98);
    ctx.moveTo(stemX, -s * 1.05);
    ctx.lineTo(stemX + s * 0.78, -s * 0.98);
  }
  ctx.stroke();
}

function createGlyphs() {
  let W = 0;
  let H = 0;
  let K = 1;
  let items = [];
  let waves = [];
  let time = 0;
  let sky = null;
  let pal = GLYPH_PALETTE;
  let palKey = "";

  const colorAt = (lane, alpha) => {
    const f = lane * (pal.length - 1);
    const i = Math.min(pal.length - 2, Math.floor(f));
    const t = f - i;
    const A = pal[i];
    const B = pal[i + 1];
    return `hsla(${lerp(A.h, B.h, t).toFixed(0)},${lerp(A.s, B.s, t).toFixed(0)}%,${lerp(A.l, B.l, t).toFixed(0)}%,${alpha.toFixed(3)})`;
  };

  const make = (initial) => ({
    lane: Math.random(),
    y: initial ? rand(-0.1 * H, H) : -rand(10, 90) * K,
    z: Math.pow(Math.random(), 1.3), // 0 = near, 1 = far
    type: randInt(0, 3),
    ph: rand(0, TAU),
    swf: rand(0.4, 1.1),
    swa: rand(6, 22) * K,
    tilt: rand(-0.35, 0.35),
  });

  return {
    resize(w, h, u) {
      W = w;
      H = h;
      K = u;
      items = [];
      waves = [];
      sky = null;
    },

    frame(ctx, w, h, dt, o, a) {
      time += dt;
      const key = o.colors.join(",");
      if (key !== palKey) {
        palKey = key;
        pal = paletteOf(o.colors, GLYPH_PALETTE);
        if (pal.length === 1) pal = [pal[0], pal[0]];
      }
      const target = Math.round(clamp(o.count * 0.9, 20, 180));
      while (items.length < target) items.push(make(items.length < target * 0.9));
      if (items.length > target) items.length = target;
      items.sort((p, q) => q.z - p.z); // far first

      // backdrop
      if (!sky) {
        sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, "#050816");
        sky.addColorStop(1, "#0d0a26");
      }
      ctx.globalAlpha = 0.3 + 0.7 * o.ba;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // a staff of five lines that trembles with the bass
      ctx.lineWidth = Math.max(1, K);
      for (let i = 0; i < 5; i++) {
        ctx.strokeStyle = colorAt(0.2 + i * 0.15, (0.1 + a.bass * 0.18) * o.ia);
        ctx.beginPath();
        const base = h * 0.5 + (i - 2) * 15 * K;
        for (let x = 0; x <= w + 24; x += 24) {
          const y = base + Math.sin(x * 0.011 + time * 1.5 + i * 0.7) * (2 + a.bass * 11) * K;
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // every beat sends a shock-wave up from the bottom centre
      if (a.hit) waves.push({ r: 0, str: clamp(a.strength, 0.4, 1) });
      const cx = w / 2;
      const cy = h * 1.05;
      for (let i = waves.length - 1; i >= 0; i--) {
        const wv = waves[i];
        wv.r += dt * h * 1.15;
        if (wv.r > h * 1.7) {
          waves.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = colorAt(0.5, (1 - wv.r / (h * 1.7)) * 0.3 * wv.str * o.ia);
        ctx.lineWidth = 2 * K;
        ctx.beginPath();
        ctx.arc(cx, cy, wv.r, Math.PI, TAU);
        ctx.stroke();
      }

      // notes: left lanes follow the bass, right lanes the overall energy
      const fall = 1 + a.energy * 0.8;
      const band = h * 0.12;
      for (const p of items) {
        p.y += (40 + 90 * (1 - p.z)) * K * dt * fall;
        if (p.y > h + 60 * K) {
          p.y = -rand(10, 90) * K;
          p.lane = Math.random();
        }
        const x = p.lane * w + Math.sin(time * p.swf + p.ph) * p.swa;
        let boost = 0;
        if (waves.length) {
          const d = Math.hypot(x - cx, p.y - cy);
          for (const wv of waves) {
            const diff = Math.abs(d - wv.r);
            if (diff < band) boost += (1 - diff / band) * wv.str;
          }
        }
        const lv = lerp(a.bass, a.energy, p.lane);
        const size = (14 + 26 * (1 - p.z)) * K * (1 + lv * 0.35 + boost * 0.7);
        const alpha = clamp(o.ia * (0.3 + 0.55 * (1 - p.z)) * (0.7 + 0.5 * lv + 0.6 * boost), 0, 1);
        const col = colorAt(p.lane, alpha);
        ctx.fillStyle = col;
        ctx.strokeStyle = col;
        ctx.setTransform(1, 0, 0, 1, x, p.y);
        ctx.rotate(p.tilt + Math.sin(time * p.swf + p.ph) * 0.15);
        drawNote(ctx, p.type, size);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    },
  };
}

/* ================================================================== hearts */

const HEART_HUES = [
  { h: 346, s: 92, l: 60 },
  { h: 330, s: 90, l: 62 },
  { h: 8, s: 92, l: 62 },
  { h: 300, s: 80, l: 64 },
  { h: 318, s: 88, l: 66 },
  { h: 354, s: 90, l: 66 },
];

/** Glossy heart sprite drawn from the classic parametric heart curve. */
function heartSprite(c) {
  const S = 96;
  const cv = makeCanvas(S, S);
  const x = cv.getContext("2d");
  x.beginPath();
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * TAU;
    const px = 16 * Math.sin(t) ** 3;
    const py = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    const X = S / 2 + (px * S) / 38;
    const Y = S / 2 + ((py - 2.5) * S) / 38;
    i ? x.lineTo(X, Y) : x.moveTo(X, Y);
  }
  x.closePath();
  const g = x.createRadialGradient(S * 0.38, S * 0.34, S * 0.04, S / 2, S * 0.5, S * 0.58);
  g.addColorStop(0, hsl(c, 1, 26));
  g.addColorStop(0.55, hsl(c));
  g.addColorStop(1, hsl(c, 1, -26));
  x.fillStyle = g;
  x.fill();
  x.lineWidth = 1.6;
  x.strokeStyle = "rgba(255,255,255,0.32)";
  x.stroke();
  x.beginPath();
  x.ellipse(S * 0.35, S * 0.31, S * 0.1, S * 0.052, -0.62, 0, TAU);
  x.fillStyle = "rgba(255,255,255,0.6)";
  x.fill();
  return cv;
}

function createHearts() {
  let W = 0;
  let H = 0;
  let K = 1;
  let hearts = [];
  let sparks = [];
  let rings = [];
  let sprites = [];
  let spriteKey = "";
  let time = 0;
  let lub = 0;
  let dubIn = 0;

  const spawn = (o, burst = false, strength = 0.5) => {
    const z = Math.random();
    const size = (22 + 46 * (1 - z)) * K * (burst ? 1.15 : 1);
    return {
      x0: burst ? W * 0.5 + rand(-0.42, 0.42) * W : rand(0, W),
      drift: burst ? rand(-60, 60) * K : 0,
      y: H + size * 0.6 + (burst ? 0 : rand(0, H * 0.25)),
      size,
      z,
      vy: (38 + 80 * (1 - z)) * K * (burst ? 1.4 + strength * 0.5 : rand(0.85, 1.15)),
      ph: rand(0, TAU),
      swf: rand(0.5, 1.2),
      swa: rand(10, 36) * K,
      hi: randInt(0, sprites.length - 1),
      popY: rand(0.06, 0.45) * H,
      dx: 0,
    };
  };

  const pop = (hrt) => {
    const n = randInt(6, 9);
    for (let i = 0; i < n && sparks.length < 320; i++) {
      const a = (i / n) * TAU + rand(-0.2, 0.2);
      const v = rand(30, 90) * K;
      sparks.push({ x: hrt.x, y: hrt.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, max: rand(0.45, 0.8), hi: hrt.hi, sz: rand(1.2, 2.8) * K });
    }
  };

  return {
    resize(w, h, u) {
      W = w;
      H = h;
      K = u;
      hearts = [];
      sparks = [];
      rings = [];
    },

    frame(ctx, w, h, dt, o, a) {
      time += dt;
      const key = o.colors.join(",");
      if (key !== spriteKey || !sprites.length) {
        spriteKey = key;
        sprites = paletteOf(o.colors, HEART_HUES).map(heartSprite);
      }
      const hueNow = 330 + 26 * Math.sin(time * 0.08);

      // backdrop: a warm glow that rises from the bottom and swells with the bass
      const bg = ctx.createRadialGradient(w / 2, h * 1.05, 0, w / 2, h * 1.05, h * 1.15);
      bg.addColorStop(0, `hsla(${hueNow.toFixed(0)},72%,${(20 + a.bass * 13).toFixed(1)}%,1)`);
      bg.addColorStop(1, `hsla(${(hueNow - 36).toFixed(0)},60%,7%,1)`);
      ctx.globalAlpha = 0.3 + 0.7 * o.ba;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // heartbeat: a "lub" on the beat and a smaller "dub" right after
      if (a.hit) {
        lub = 1;
        dubIn = 0.15;
        rings.push({ r: 0, str: clamp(a.strength, 0.4, 1) });
        const n = 2 + Math.round(a.strength * 2);
        for (let i = 0; i < n && hearts.length < clamp(o.count * 0.35, 8, 70) * 1.5; i++) hearts.push(spawn(o, true, a.strength));
      }
      if (dubIn > 0 && (dubIn -= dt) <= 0) lub = Math.max(lub, 0.7);
      lub *= Math.exp(-dt * 7);

      const target = Math.round(clamp(o.count * 0.35, 8, 70));
      if (hearts.length < target && Math.random() < dt * (3 + a.energy * 4)) hearts.push(spawn(o));

      // expanding rings from the centre of the screen
      const rc = { x: w / 2, y: h * 0.55 };
      for (let i = rings.length - 1; i >= 0; i--) {
        const rg = rings[i];
        rg.r += dt * Math.max(w, h) * 0.7;
        const life = 1 - rg.r / (Math.max(w, h) * 0.65);
        if (life <= 0) {
          rings.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `hsla(${hueNow.toFixed(0)},90%,70%,${(life * 0.35 * rg.str * o.ia).toFixed(3)})`;
        ctx.lineWidth = (3 + 6 * life) * K;
        ctx.beginPath();
        ctx.arc(rc.x, rc.y, rg.r, 0, TAU);
        ctx.stroke();
      }

      hearts.sort((p, q) => q.z - p.z);
      const rise = 1 + a.energy * 0.6;
      for (let i = hearts.length - 1; i >= 0; i--) {
        const p = hearts[i];
        p.y -= p.vy * dt * rise;
        p.dx += p.drift * dt;
        p.drift *= Math.exp(-dt * 1.2);
        p.x = p.x0 + p.dx + Math.sin(time * p.swf + p.ph) * p.swa;
        if (p.y < p.popY) {
          pop(p);
          hearts.splice(i, 1);
          continue;
        }
        const s = p.size * (1 + lub * 0.22 * (1 - p.z * 0.5));
        const alpha = clamp(o.ia * (0.45 + 0.55 * (1 - p.z * 0.6)) * clamp((p.y - p.popY) / (h * 0.12), 0.25, 1), 0, 1);
        const spr = sprites[p.hi % sprites.length];
        ctx.globalAlpha = alpha * 0.14;
        ctx.globalCompositeOperation = "lighter";
        ctx.drawImage(spr, p.x - s * 0.85, p.y - s * 0.85, s * 1.7, s * 1.7); // soft halo
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.sin(time * p.swf + p.ph) * 0.12);
        ctx.drawImage(spr, -s / 2, -s / 2, s, s);
        ctx.restore();
      }

      // sparkles left by popped hearts
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.max) {
          sparks.splice(i, 1);
          continue;
        }
        s.vx *= Math.pow(0.9, dt * 60);
        s.vy = s.vy * Math.pow(0.9, dt * 60) + 40 * K * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const life = 1 - s.age / s.max;
        ctx.fillStyle = `hsla(${(paletteOf(o.colors, HEART_HUES)[s.hi % sprites.length].h).toFixed(0)},100%,80%,${(life * o.ia).toFixed(3)})`;
        ctx.fillRect(s.x - s.sz / 2, s.y - s.sz / 2, s.sz, s.sz);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    },
  };
}

/* ================================================================== fireworks */

const FIRE_HUES = [12, 38, 52, 168, 200, 262, 318];
const BURSTS = [
  ["peony", 0.3],
  ["ring", 0.2],
  ["spiral", 0.17],
  ["willow", 0.13],
  ["crackle", 0.2],
];
const pickBurst = () => {
  let r = Math.random();
  for (const [name, wgt] of BURSTS) if ((r -= wgt) <= 0) return name;
  return "peony";
};
const sphere = () => {
  const z = rand(-1, 1);
  const a = rand(0, TAU);
  const r = Math.sqrt(1 - z * z);
  return { x: r * Math.cos(a), y: r * Math.sin(a), z };
};

function createFireworks() {
  let W = 0;
  let H = 0;
  let K = 1;
  let HZ = 0; // horizon line
  let shells = [];
  let sparks = [];
  let flashes = [];
  let towers = [];
  let sky = null;
  let water = null;
  let idle = 0.5;
  let glowHue = 40;
  let time = 0;
  const MAX = 2200;

  const colorOf = (o) => {
    if (o.colors.length) {
      const c = hexToHsl(pick(o.colors));
      return { h: c.h, s: Math.max(70, c.s) };
    }
    return { h: pick(FIRE_HUES) + rand(-6, 6), s: rand(88, 100) };
  };

  const launch = (o, str = 0.6) => {
    const tx = rand(W * 0.1, W * 0.9);
    const ty = rand(H * 0.1, HZ * 0.55);
    const gR = 520 * K;
    shells.push({
      x: tx,
      y: HZ,
      vx: rand(-14, 14) * K,
      vy: -Math.sqrt(2 * gR * (HZ - ty)),
      gR,
      kind: pickBurst(),
      str,
      c1: colorOf(o),
      c2: colorOf(o),
      trail: [],
    });
  };

  const spark = (x, y, vx, vy, vz, c, extra = {}) => {
    if (sparks.length >= MAX) return;
    sparks.push({
      x,
      y,
      vx,
      vy,
      vz,
      age: 0,
      max: rand(1.1, 1.8),
      h: c.h,
      s: c.s,
      sz: rand(1.6, 3) * K,
      drag: 0.984,
      g: 95 * K,
      tw: rand(0, TAU),
      crackle: false,
      ...extra,
    });
  };

  const burst = (o, sh) => {
    const { x, y, kind, str, c1, c2 } = sh;
    const n = Math.round(clamp(o.count * 1.5, 70, 280) * (0.7 + 0.5 * str));
    const R = (170 + 130 * str) * K;
    glowHue = c1.h;
    flashes.push({ x, y, r: (120 + 100 * str) * K, h: c1.h, age: 0, max: 0.5 });
    if (kind === "peony" || kind === "crackle") {
      for (let i = 0; i < n; i++) {
        const d = sphere();
        const v = R * rand(0.88, 1);
        spark(x, y, d.x * v, d.y * v, d.z, i % 5 === 0 ? c2 : c1, { crackle: kind === "crackle" && i % 3 === 0 });
      }
    } else if (kind === "ring") {
      const rot = rand(0, TAU);
      const tilt = rand(0.25, 1.2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const px = Math.cos(a);
        const py = Math.sin(a) * Math.cos(tilt);
        const vz = Math.sin(a) * Math.sin(tilt);
        const v = R * 1.05;
        spark(x, y, (px * Math.cos(rot) - py * Math.sin(rot)) * v, (px * Math.sin(rot) + py * Math.cos(rot)) * v, vz, i % 2 ? c2 : c1);
      }
    } else if (kind === "spiral") {
      const GOLDEN = 2.39996323;
      const spin = Math.random() < 0.5 ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const a = i * GOLDEN;
        const f = Math.sqrt(i / n);
        const v = R * (0.15 + 0.95 * f);
        const t = v * 0.22 * spin; // tangential push gives the swirl
        spark(x, y, Math.cos(a) * v - Math.sin(a) * t, Math.sin(a) * v + Math.cos(a) * t, 0, f > 0.6 ? c2 : c1, { max: 1.3 + f * 0.6 });
      }
    } else {
      // willow: slow, heavy, long-lived golden streamers
      for (let i = 0; i < n; i++) {
        const d = sphere();
        const v = R * rand(0.25, 0.75);
        spark(x, y, d.x * v, d.y * v, d.z, { h: 40, s: 95 }, { max: rand(1.9, 2.9), drag: 0.972, g: 80 * K });
      }
    }
  };

  return {
    resize(w, h, u) {
      W = w;
      H = h;
      K = u;
      HZ = h * 0.8;
      shells = [];
      sparks = [];
      flashes = [];
      sky = null;
      water = null;
      // skyline silhouette
      const rnd = seeded(Math.round(w) * 31 + Math.round(h));
      towers = [];
      for (let x = -10 * K; x < w; ) {
        const bw = (22 + rnd() * 54) * K;
        const bh = (14 + rnd() * rnd() * 110) * K;
        const wins = [];
        for (let k = 0; k < 6; k++) wins.push({ dx: rnd() * bw * 0.8, dy: rnd() * bh * 0.85, on: rnd() < 0.5 });
        towers.push({ x, w: bw, h: bh, wins });
        x += bw + rnd() * 6 * K;
      }
    },

    frame(ctx, w, h, dt, o, a) {
      time += dt;
      if (!sky) {
        sky = ctx.createLinearGradient(0, 0, 0, HZ);
        sky.addColorStop(0, "#02030c");
        sky.addColorStop(1, "#150c2c");
        water = ctx.createLinearGradient(0, HZ, 0, h);
        water.addColorStop(0, "#0e0f26");
        water.addColorStop(1, "#04040e");
      }
      ctx.globalAlpha = 0.3 + 0.7 * o.ba;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, HZ);
      ctx.fillStyle = water;
      ctx.fillRect(0, HZ, w, h - HZ);
      ctx.globalAlpha = 1;

      // horizon glow in the colour of the last burst
      const gl = ctx.createRadialGradient(w / 2, HZ, 0, w / 2, HZ, h * 0.7);
      gl.addColorStop(0, `hsla(${glowHue.toFixed(0)},100%,55%,${((0.05 + a.bass * 0.22) * o.ia).toFixed(3)})`);
      gl.addColorStop(1, `hsla(${glowHue.toFixed(0)},100%,55%,0)`);
      ctx.fillStyle = gl;
      ctx.fillRect(0, 0, w, h);

      // skyline
      ctx.fillStyle = `rgba(4,5,14,${(0.6 + 0.4 * o.ba).toFixed(2)})`;
      for (const t of towers) ctx.fillRect(t.x, HZ - t.h, t.w, t.h);
      ctx.fillStyle = `rgba(255,214,140,${(0.5 * o.ia).toFixed(2)})`;
      for (const t of towers) for (const wd of t.wins) if (wd.on) ctx.fillRect(t.x + wd.dx, HZ - t.h + wd.dy, 2 * K, 2.5 * K);

      // launches
      idle -= dt * (1 + a.energy * 1.8);
      if (idle <= 0) {
        launch(o, rand(0.35, 0.8));
        idle = rand(1.1, 2.6);
      }
      if (a.hit) {
        launch(o, clamp(0.45 + a.strength * 0.5, 0.4, 1));
      }

      ctx.globalCompositeOperation = "lighter";

      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i];
        s.vy += s.gR * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.trail.push(s.x, s.y);
        if (s.trail.length > 20) s.trail.splice(0, 2);
        if (s.vy >= -25 * K) {
          burst(o, s);
          shells.splice(i, 1);
          continue;
        }
        const g = ctx.createLinearGradient(s.trail[0], s.trail[1], s.x, s.y);
        g.addColorStop(0, "rgba(255,190,110,0)");
        g.addColorStop(1, `rgba(255,228,176,${(0.9 * o.ia).toFixed(2)})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.8 * K;
        ctx.beginPath();
        ctx.moveTo(s.trail[0], s.trail[1]);
        for (let k = 2; k < s.trail.length; k += 2) ctx.lineTo(s.trail[k], s.trail[k + 1]);
        ctx.stroke();
      }

      for (let i = flashes.length - 1; i >= 0; i--) {
        const f = flashes[i];
        f.age += dt;
        const t = f.age / f.max;
        if (t >= 1) {
          flashes.splice(i, 1);
          continue;
        }
        const rg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        rg.addColorStop(0, `hsla(${f.h.toFixed(0)},100%,72%,${((1 - t) * 0.32 * o.ia).toFixed(3)})`);
        rg.addColorStop(1, `hsla(${f.h.toFixed(0)},100%,50%,0)`);
        ctx.fillStyle = rg;
        ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
      }

      const bright = 0.7 + 0.5 * a.energy;
      const shimmer = (3 + a.bass * 7) * K;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.age += dt;
        if (s.age >= s.max) {
          if (s.crackle) for (let k = 0; k < 3; k++) spark(s.x, s.y, rand(-60, 60) * K, rand(-60, 60) * K, 0, { h: s.h, s: 40 }, { max: rand(0.2, 0.4), sz: 1.4 * K, g: 0 });
          sparks[i] = sparks[sparks.length - 1];
          sparks.pop();
          continue;
        }
        const f = Math.pow(s.drag, dt * 60);
        s.vx *= f;
        s.vy = s.vy * f + s.g * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        const life = 1 - s.age / s.max;
        const depth = 0.78 + 0.22 * s.vz; // sparks flying towards the viewer look larger and brighter
        const tw = 0.78 + 0.22 * Math.sin(s.age * 36 + s.tw);
        const alpha = clamp(life ** 1.1 * tw * (0.45 + 0.75 * o.ia) * bright * depth * 1.25, 0, 1);
        const light = 86 - 26 * (1 - life);
        ctx.strokeStyle = `hsla(${s.h.toFixed(0)},${s.s.toFixed(0)}%,${light.toFixed(0)}%,${alpha.toFixed(3)})`;
        ctx.lineWidth = s.sz * depth * (0.7 + 0.7 * life);
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * 0.08, s.y - s.vy * 0.08);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
        ctx.fillStyle = `hsla(${s.h.toFixed(0)},${s.s.toFixed(0)}%,94%,${alpha.toFixed(3)})`;
        ctx.fillRect(s.x - s.sz * 0.6, s.y - s.sz * 0.6, s.sz * 1.2, s.sz * 1.2);
        // reflection on the water: squashed, dimmer, wobbling with the bass
        if (s.y < HZ) {
          const ry = HZ + (HZ - s.y) * 0.45;
          if (ry < h) {
            ctx.fillStyle = `hsla(${s.h.toFixed(0)},${s.s.toFixed(0)}%,70%,${(alpha * 0.28).toFixed(3)})`;
            const d = s.sz * 1.4;
            ctx.fillRect(s.x + Math.sin(s.y * 0.05 + time * 6) * shimmer - d / 2, ry, d, d * 0.5);
          }
        }
      }

      ctx.globalCompositeOperation = "source-over";
    },
  };
}

/* ================================================================== rain */

const BOKEH_HUES = [38, 190, 330, 210, 48, 160];

function softDisc(hue) {
  const S = 64;
  const cv = makeCanvas(S, S);
  const x = cv.getContext("2d");
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, `hsla(${hue},95%,72%,0.9)`);
  g.addColorStop(0.55, `hsla(${hue},95%,62%,0.35)`);
  g.addColorStop(1, `hsla(${hue},95%,60%,0)`);
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  return cv;
}

/** Midpoint-displacement lightning bolt as a flat [x0,y0,x1,y1,…] list. */
function makeBolt(x0, y0, x1, y1, spread) {
  let pts = [x0, y0, x1, y1];
  let off = spread;
  for (let level = 0; level < 6; level++) {
    const next = [pts[0], pts[1]];
    for (let i = 0; i < pts.length - 2; i += 2) {
      const mx = (pts[i] + pts[i + 2]) / 2 + rand(-off, off);
      const my = (pts[i + 1] + pts[i + 3]) / 2;
      next.push(mx, my, pts[i + 2], pts[i + 3]);
    }
    pts = next;
    off *= 0.55;
  }
  return pts;
}

function createRain() {
  let W = 0;
  let H = 0;
  let K = 1;
  let HZ = 0;
  let drops = [];
  let ripples = [];
  let lamps = [];
  let discs = [];
  let bolts = [];
  let acc = [0, 0, 0];
  let sky = null;
  let time = 0;
  let flash = 0;
  const LAYERS = [
    { speed: 520, len: 11, alpha: 0.2, width: 0.8, land: 0.1, rate: 260 },
    { speed: 820, len: 19, alpha: 0.34, width: 1.1, land: 0.45, rate: 200 },
    { speed: 1250, len: 32, alpha: 0.58, width: 1.7, land: 0.9, rate: 120 },
  ];

  return {
    resize(w, h, u) {
      W = w;
      H = h;
      K = u;
      HZ = h * 0.76;
      drops = [];
      ripples = [];
      bolts = [];
      sky = null;
      const rnd = seeded(Math.round(w) * 17 + Math.round(h));
      lamps = Array.from({ length: 24 }, () => ({
        x: rnd() * w,
        y: HZ - (0.02 + rnd() * 0.26) * HZ * 0.6,
        r: (8 + rnd() * 28) * u,
        hi: Math.floor(rnd() * BOKEH_HUES.length),
        ph: rnd() * TAU,
      }));
    },

    frame(ctx, w, h, dt, o, a) {
      time += dt;
      if (!discs.length) discs = BOKEH_HUES.map(softDisc);
      if (!sky) {
        sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, "#07131f");
        sky.addColorStop(0.76, "#14303d");
        sky.addColorStop(1, "#0a1b25");
      }
      ctx.globalAlpha = 0.3 + 0.7 * o.ba;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      // city bokeh: lamps glow brighter and swell with the bass; wet-street reflections below the horizon
      ctx.globalCompositeOperation = "lighter";
      for (const l of lamps) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 0.8 + l.ph);
        const alpha = clamp((0.16 + a.bass * 0.38 + a.beat * 0.18) * o.ia * pulse, 0, 1);
        const r = l.r * (1 + a.bass * 0.35);
        ctx.globalAlpha = alpha;
        ctx.drawImage(discs[l.hi], l.x - r, l.y - r, r * 2, r * 2);
        ctx.globalAlpha = alpha * 0.35;
        ctx.drawImage(discs[l.hi], l.x - r * 0.6, HZ + (HZ - l.y) * 0.35 - r * 1.6, r * 1.2, r * 3.2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      // fog on the horizon
      const fog = ctx.createLinearGradient(0, HZ - h * 0.12, 0, HZ + h * 0.06);
      fog.addColorStop(0, "rgba(170,200,220,0)");
      fog.addColorStop(0.7, `rgba(170,200,220,${(0.06 + a.energy * 0.06).toFixed(3)})`);
      fog.addColorStop(1, "rgba(170,200,220,0)");
      ctx.fillStyle = fog;
      ctx.fillRect(0, HZ - h * 0.12, w, h * 0.18);

      // lightning follows each detected beat, like the heartbeat rings
      if (a.hit) {
        const x0 = rand(0.15, 0.85) * w;
        const main = makeBolt(x0, 0, x0 + rand(-0.12, 0.12) * w, HZ * 0.92, 0.09 * w);
        const bolt = { age: 0, max: 0.26, paths: [main] };
        for (let i = 0; i < 2; i++) {
          const k = randInt(4, main.length / 2 - 6) * 2;
          bolt.paths.push(makeBolt(main[k], main[k + 1], main[k] + rand(-0.14, 0.14) * w, main[k + 1] + rand(0.1, 0.3) * HZ, 0.04 * w));
        }
        bolts.push(bolt);
        flash = 1;
      }
      flash = Math.max(0, flash - dt * 4);
      if (flash > 0) {
        ctx.fillStyle = `rgba(190,212,255,${(flash * 0.22 * o.ia).toFixed(3)})`;
        ctx.fillRect(0, 0, w, h);
      }
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.age += dt;
        if (b.age >= b.max) {
          bolts.splice(i, 1);
          continue;
        }
        const life = 1 - b.age / b.max;
        const flick = 0.65 + 0.35 * Math.sin(b.age * 90);
        for (const [width, color] of [
          [7 * K, `rgba(150,185,255,${(0.22 * life * flick).toFixed(3)})`],
          [1.8 * K, `rgba(255,255,255,${(0.95 * life * flick).toFixed(3)})`],
        ]) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.lineJoin = "round";
          for (const p of b.paths) {
            ctx.beginPath();
            ctx.moveTo(p[0], p[1]);
            for (let k = 2; k < p.length; k += 2) ctx.lineTo(p[k], p[k + 1]);
            ctx.stroke();
          }
        }
      }

      // rain: three depth layers, slanted by the wind (harder music = stronger wind)
      const density = clamp(o.count / 70, 0.3, 2.6);
      const wind = -0.14 - a.energy * 0.3 - a.beat * 0.1;
      const norm = Math.hypot(wind, 1);
      const dirX = wind / norm;
      const dirY = 1 / norm;
      for (let L = 0; L < 3; L++) {
        const cfg = LAYERS[L];
        acc[L] += cfg.rate * density * dt * (1 + a.energy * 1.8 + a.beat * 1.2);
        while (acc[L] >= 1) {
          acc[L] -= 1;
          if (drops.length < 3600) drops.push({ x: rand(-0.3 * w, 1.1 * w), y: -cfg.len * K, L, v: cfg.speed * K * rand(0.9, 1.1), land: HZ + (h - HZ) * cfg.land * rand(0.85, 1.05) });
        }
      }
      for (let L = 0; L < 3; L++) {
        const cfg = LAYERS[L];
        ctx.strokeStyle = `rgba(196,222,255,${(cfg.alpha * (0.5 + 0.7 * o.ia)).toFixed(3)})`;
        ctx.lineWidth = cfg.width * K;
        ctx.beginPath();
        for (const d of drops) {
          if (d.L !== L) continue;
          const len = cfg.len * K;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - dirX * len, d.y - dirY * len);
        }
        ctx.stroke();
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        d.x += dirX * d.v * dt;
        d.y += dirY * d.v * dt;
        if (d.y >= d.land) {
          if ((d.L > 0 || Math.random() < 0.5) && ripples.length < 260) ripples.push({ x: d.x, y: d.land, r: 0, L: d.L, max: (14 + 26 * d.L) * K * rand(0.8, 1.2) });
          drops[i] = drops[drops.length - 1];
          drops.pop();
        }
      }

      // puddle ripples: flattened rings in perspective
      ctx.lineWidth = Math.max(1, K);
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.r += (30 + 28 * r.L) * K * dt;
        if (r.r >= r.max) {
          ripples.splice(i, 1);
          continue;
        }
        const life = 1 - r.r / r.max;
        ctx.strokeStyle = `rgba(200,226,255,${(life * 0.5 * o.ia).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r, r.r * 0.28, 0, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.r * 0.6, r.r * 0.6 * 0.28, 0, 0, TAU);
        ctx.stroke();
      }
    },
  };
}

/* ================================================================== sakura */

const SAKURA_PALETTE = [
  { h: 338, s: 100, l: 88 },
  { h: 336, s: 100, l: 80 },
  { h: 334, s: 96, l: 72 },
  { h: 342, s: 100, l: 93 },
];

/** Traces one notched petal pointing up, centred on the origin. */
function petalPath(x, w, h) {
  x.beginPath();
  x.moveTo(0, h * 0.5);
  x.quadraticCurveTo(-w * 0.95, h * 0.15, -w * 0.5, -h * 0.34);
  x.quadraticCurveTo(-w * 0.3, -h * 0.58, -w * 0.07, -h * 0.5);
  x.quadraticCurveTo(0, -h * 0.4, w * 0.07, -h * 0.5);
  x.quadraticCurveTo(w * 0.3, -h * 0.58, w * 0.5, -h * 0.34);
  x.quadraticCurveTo(w * 0.95, h * 0.15, 0, h * 0.5);
  x.closePath();
}

function petalSprite(c, soft) {
  const W = 48;
  const H = 56;
  const cv = makeCanvas(W, H);
  const x = cv.getContext("2d");
  if (soft) x.filter = "blur(2.2px)";
  x.translate(W / 2, H / 2);
  petalPath(x, W * 0.4, H * 0.86);
  const g = x.createLinearGradient(0, H * 0.45, 0, -H * 0.45);
  g.addColorStop(0, hsl(c, 1, -14));
  g.addColorStop(0.5, hsl(c));
  g.addColorStop(1, hsl({ ...c, s: c.s * 0.7 }, 1, 8));
  x.fillStyle = g;
  x.fill();
  if (!soft) {
    x.strokeStyle = "rgba(255,255,255,0.3)";
    x.lineWidth = 1;
    x.stroke();
  }
  return { cv, W, H };
}

function blossomSprite(c) {
  const S = 96;
  const cv = makeCanvas(S, S);
  const x = cv.getContext("2d");
  x.translate(S / 2, S / 2);
  for (let i = 0; i < 5; i++) {
    x.save();
    x.rotate((i / 5) * TAU);
    x.translate(0, -S * 0.22);
    petalPath(x, S * 0.34, S * 0.5);
    const g = x.createLinearGradient(0, S * 0.2, 0, -S * 0.25);
    g.addColorStop(0, hsl(c, 1, -22));
    g.addColorStop(0.45, hsl(c));
    g.addColorStop(1, hsl({ ...c, s: c.s * 0.65 }, 1, 9));
    x.fillStyle = g;
    x.fill();
    x.strokeStyle = "rgba(255,255,255,0.28)";
    x.lineWidth = 1;
    x.stroke();
    x.restore();
  }
  x.fillStyle = "#ffd36e";
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU;
    x.beginPath();
    x.arc(Math.cos(a) * S * 0.09, Math.sin(a) * S * 0.09, S * 0.025, 0, TAU);
    x.fill();
  }
  return { cv, S };
}

function createSakura() {
  let W = 0;
  let H = 0;
  let K = 1;
  let branch = []; // { x0, y0, x1, y1, w }
  let blossoms = []; // { x, y, size, ph, hi }
  let anchor = { x: 0, y: 0 };
  let petals = [];
  let flowers = [];
  let sprites = [];
  let softs = [];
  let spriteKey = "";
  let sky = null;
  let hills = null;
  let time = 0;
  let env = 0;
  let sway = 0;

  const grow = (rnd, x, y, ang, len, width, depth) => {
    const steps = 7;
    let cx = x;
    let cy = y;
    let a = ang;
    for (let i = 0; i < steps; i++) {
      a += (rnd() - 0.42) * 0.22;
      const nx = cx + Math.cos(a) * (len / steps);
      const ny = cy + Math.sin(a) * (len / steps);
      branch.push({ x0: cx, y0: cy, x1: nx, y1: ny, w: width * (1 - (i / steps) * 0.55) });
      if (depth > 0 && i > 1 && i < steps - 1 && rnd() < 0.32) grow(rnd, nx, ny, a + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5), len * 0.5, width * 0.55, depth - 1);
      if (rnd() < 0.55) blossoms.push({ x: nx, y: ny, size: (20 + rnd() * 18) * K, ph: rnd() * TAU, hi: Math.floor(rnd() * 3) });
      cx = nx;
      cy = ny;
    }
    blossoms.push({ x: cx, y: cy, size: (24 + rnd() * 14) * K, ph: rnd() * TAU, hi: Math.floor(rnd() * 3) });
  };

  const toWorld = (p) => {
    const c = Math.cos(sway);
    const s = Math.sin(sway);
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    return { x: anchor.x + dx * c - dy * s, y: anchor.y + dx * s + dy * c };
  };

  const newPetal = (o, from, extra = false) => {
    const z = Math.pow(Math.random(), 1.3);
    const src = from ? toWorld(from) : { x: rand(0, W), y: -20 * K };
    return {
      x: src.x,
      y: src.y,
      z,
      size: (11 + 20 * (1 - z)) * K,
      fall: (30 + 40 * (1 - z)) * K * rand(0.8, 1.2),
      rot: rand(0, TAU),
      rotV: rand(-1.4, 1.4),
      flip: rand(0, TAU),
      flipV: rand(1.5, 3.4),
      tilt: rand(0, TAU),
      tiltV: rand(0.8, 2),
      ph: rand(0, TAU),
      hi: randInt(0, 3),
      ix: extra ? rand(-0.5, 1) * 140 * K : 0,
      iy: extra ? -rand(20, 100) * K : 0,
    };
  };

  return {
    resize(w, h, u) {
      W = w;
      H = h;
      K = u;
      petals = [];
      sky = null;
      hills = null;
      branch = [];
      blossoms = [];
      anchor = { x: -0.04 * w, y: 0.1 * h };
      const rnd = seeded(Math.round(w) * 13 + Math.round(h) * 7);
      grow(rnd, anchor.x, anchor.y, 0.12, 0.72 * w, 7 * u, 2);
      grow(rnd, anchor.x + 0.1 * w, anchor.y - 0.02 * h, 0.55, 0.32 * w, 4 * u, 1);
    },

    frame(ctx, w, h, dt, o, a) {
      time += dt;
      const key = o.colors.join(",");
      if (key !== spriteKey || !sprites.length) {
        spriteKey = key;
        const pal = paletteOf(o.colors, SAKURA_PALETTE);
        sprites = pal.map((c) => petalSprite(c, false));
        softs = pal.map((c) => petalSprite(c, true));
        flowers = pal.slice(0, 3).map(blossomSprite);
        if (flowers.length < 3) while (flowers.length < 3) flowers.push(flowers[0]);
      }
      const target = Math.round(clamp(o.count * 2.4, 40, 260));
      if (!petals.length) for (let i = 0; i < target * 0.6; i++) petals.push({ ...newPetal(o, null), y: rand(0, h) });

      // dusk sky + moon (the moon glow breathes with the bass) + far hills
      if (!sky) {
        sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, "#150c2e");
        sky.addColorStop(0.55, "#3d1a4a");
        sky.addColorStop(1, "#b8556f");
      }
      ctx.globalAlpha = 0.3 + 0.7 * o.ba;
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
      const mx = w * 0.82;
      const my = h * 0.22;
      const mr = Math.min(w, h) * 0.07;
      const halo = ctx.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * (4.5 + a.bass * 1.2));
      halo.addColorStop(0, `rgba(255,232,240,${((0.4 + a.bass * 0.25) * o.ba).toFixed(3)})`);
      halo.addColorStop(1, "rgba(255,232,240,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(255,240,244,${(0.55 + 0.4 * o.ba).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, TAU);
      ctx.fill();
      if (!hills) {
        hills = new Path2D();
        hills.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) hills.lineTo(x, h * 0.9 - Math.sin(x * 0.004 / K * 1) * h * 0.025 - Math.sin(x * 0.011 / K + 1.3) * h * 0.012);
        hills.lineTo(w, h);
        hills.closePath();
      }
      ctx.fillStyle = "rgba(18,7,24,0.92)";
      ctx.fill(hills);

      // beats: blossoms pulse and shed a burst of petals
      if (a.hit) {
        env = 1;
        const n = 4 + Math.round(a.strength * 6);
        for (let i = 0; i < n && petals.length < target * 1.5 && blossoms.length; i++) petals.push(newPetal(o, pick(blossoms), true));
      }
      env *= Math.exp(-dt * 6);
      sway = Math.sin(time * 0.6) * 0.012 + a.bass * 0.01 * Math.sin(time * 5);

      // the branch, swaying around its anchor
      ctx.save();
      ctx.translate(anchor.x, anchor.y);
      ctx.rotate(sway);
      ctx.translate(-anchor.x, -anchor.y);
      ctx.strokeStyle = "#1a0b1c";
      ctx.lineCap = "round";
      for (const s of branch) {
        ctx.lineWidth = s.w;
        ctx.beginPath();
        ctx.moveTo(s.x0, s.y0);
        ctx.lineTo(s.x1, s.y1);
        ctx.stroke();
      }
      ctx.globalAlpha = clamp(o.ia * 1.1, 0, 1);
      for (const b of blossoms) {
        const sc = b.size * (1 + env * 0.28 + Math.sin(time * 1.3 + b.ph) * 0.03);
        const f = flowers[b.hi % flowers.length];
        ctx.drawImage(f.cv, b.x - sc / 2, b.y - sc / 2, sc, sc);
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // ambient shedding, faster with the music
      if (petals.length < target && Math.random() < dt * (2 + a.energy * 8) && blossoms.length) petals.push(newPetal(o, pick(blossoms)));
      if (petals.length < target * 0.7) petals.push(newPetal(o, null));

      // petals ride a swirling wind field
      petals.sort((p, q) => q.z - p.z);
      const amp = (28 + a.energy * 70) * K;
      const flutter = 1 + a.energy * 2.2;
      for (let i = 0; i < petals.length; i++) {
        const p = petals[i];
        const vx = (22 + 30 * (1 - p.z)) * K + Math.sin(p.y * 0.006 / K + time * 0.8 + p.ph) * amp + Math.cos(p.x * 0.004 / K - time * 0.55) * amp * 0.6 + p.ix;
        const vy = p.fall + Math.sin(p.x * 0.005 / K + time * 0.9) * amp * 0.35 + p.iy;
        p.ix *= Math.exp(-dt * 1.8);
        p.iy *= Math.exp(-dt * 1.8);
        p.x += vx * dt;
        p.y += vy * dt;
        p.rot += p.rotV * dt * flutter;
        p.flip += p.flipV * dt * flutter;
        p.tilt += p.tiltV * dt * flutter;
        const m = p.size * 2;
        if (p.x > w + m || p.x < -m * 6 || p.y > h + m || p.y < -m * 6) {
          petals.splice(i--, 1);
          continue;
        }
        const near = p.z < 0.16;
        const spr = (near ? softs : sprites)[p.hi % sprites.length];
        const sx = Math.max(0.2, Math.abs(Math.cos(p.flip)));
        const sy = 0.65 + 0.35 * Math.abs(Math.cos(p.tilt));
        const sc = (p.size * (near ? 1.8 : 1)) / spr.W;
        ctx.globalAlpha = clamp(o.ia * (near ? 0.6 : 1.1) * (1 - p.z * 0.4) * (0.8 + 0.2 * sx), 0, 1);
        ctx.setTransform(1, 0, 0, 1, p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(sc * sx * 2, sc * sy * 2);
        ctx.drawImage(spr.cv, -spr.W / 2, -spr.H / 2);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    },
  };
}

/* ================================================================== registry + loop */

const FACTORIES = {
  glyphs: createGlyphs,
  hearts: createHearts,
  fireworks: createFireworks,
  rain: createRain,
  sakura: createSakura,
};

export const createScene = (name) => FACTORIES[name]?.();

const DEFAULTS = { speed: 1, intensity: 0.6, count: 70, react: true, sensitivity: 1, colors: [] };

let canvas = null;
let raf = 0;
let scene = null;
let sceneName = "";
let opts = { ...DEFAULTS };
let lastT = 0;
let lastW = 0;
let lastH = 0;
let lastDpr = 1;
let clock = 0;

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function loop(now) {
  raf = requestAnimationFrame(loop);
  if (document.hidden || !canvas || !scene) {
    lastT = now;
    return;
  }
  const dtReal = clamp((now - lastT) / 1000 || 0.016, 0.001, 0.05);
  lastT = now;

  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
  const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
  if (w !== canvas.width || h !== canvas.height) {
    canvas.width = w;
    canvas.height = h;
  }
  const u = dpr * clamp(Math.min(w, h) / dpr / 800, 0.6, 1.6);
  if (w !== lastW || h !== lastH || dpr !== lastDpr) {
    lastW = w;
    lastH = h;
    lastDpr = dpr;
    scene.resize(w, h, u);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.clearRect(0, 0, w, h);

  const reduce = reducedMotion();
  const speed = opts.speed * (reduce ? 0.35 : 1);
  const audio = sampleAudio(now, dtReal, opts.react && !reduce, opts.sensitivity);
  clock += dtReal * speed;
  scene.frame(
    ctx,
    w,
    h,
    dtReal * speed,
    {
      intensity: opts.intensity,
      count: opts.count,
      colors: opts.colors,
      ia: 0.35 + 0.65 * opts.intensity, // element opacity
      ba: 0.3 + 0.7 * opts.intensity, // backdrop opacity
      u,
      dpr,
      time: clock,
    },
    audio,
  );
}

/**
 * Start (or update) a scene on `el`. Calling it again with the same scene only updates the options, so sliders
 * in the Themes page feel instant and the animation does not restart.
 */
export function startScene(el, name, options = {}) {
  if (!isScene(name)) return stopScene();
  opts = { ...DEFAULTS, ...options, colors: Array.isArray(options.colors) ? options.colors : [] };
  if (canvas !== el || sceneName !== name) {
    canvas = el;
    sceneName = name;
    scene = createScene(name);
    lastW = lastH = 0;
  }
  if (!raf) {
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }
}

export function stopScene() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  scene = null;
  sceneName = "";
  if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}
