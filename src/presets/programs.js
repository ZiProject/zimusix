/**
 * App side of draw.json: runs a preset's compiled draw programs on canvases.
 *   • visualizers — called from ui/visualizer.js for the 1–3 visualizer canvases (player bar, stage, background)
 *   • backgrounds — own animation loop on #bg-particles (same canvas the built-in particle/scene effects use)
 */
import { cfg } from "./runtime.js";
import { getScope } from "./hooks.js";
import { reactive } from "./reactive.js";

function baseScope(w, h, bands, colors) {
  const audio = getScope().audio;
  return {
    ...getScope(),
    w,
    h,
    u: Math.min(w, h) / 100,
    n: bands.length,
    bands,
    bass: reactive.bass,
    energy: reactive.energy,
    beat: audio.beat,
    accent: colors.accent,
    accent2: colors.accent2,
    colors: colors.palette ?? [colors.accent, colors.accent2],
    ring: false,
    p: cfg(),
  };
}

/** Draw a visualizer program for one frame. Errors disable nothing — they're logged once per program. */
const failed = new WeakSet();
export function drawProgramViz(ctx, program, bands, w, h, style) {
  if (failed.has(program)) return;
  const scope = baseScope(w, h, bands, style);
  scope.ring = Boolean(style.ring);
  try {
    program.render(ctx, scope);
  } catch (error) {
    failed.add(program);
    console.error("[presets] visualizer program failed:", error);
  }
}

/* ------------------------------------------------------------- backgrounds */

let raf = 0;
let running = null;

export function stopProgramBg() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  if (running) {
    const { canvas } = running;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    running = null;
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} program compiled background program
 * @param {{ count:number, colors:string[] }} options  `colors` is the palette (accent fallback applied by caller)
 */
export function startProgramBg(canvas, program, options) {
  stopProgramBg();
  running = { canvas, program, options };
  const ctx = canvas.getContext("2d");
  const loop = () => {
    raf = requestAnimationFrame(loop);
    if (document.hidden || !running) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    const pw = Math.round(w * dpr);
    const ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const palette = running.options.colors;
    const scope = baseScope(w, h, reactive.bands, { accent: palette[0], accent2: palette[1] ?? palette[0], palette });
    scope.n = running.options.count;
    try {
      running.program.render(ctx, scope);
    } catch (error) {
      console.error("[presets] background program failed:", error);
      stopProgramBg();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };
  raf = requestAnimationFrame(loop);
}
