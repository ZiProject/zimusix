/**
 * draw.json — custom canvas visualizers and backgrounds, as DATA (pure: works on any 2D-context-like object).
 *
 * {
 *   "visualizers": {
 *     "ember": {
 *       "bands": 48,                                  // spectrum resolution handed to the program (8–96)
 *       "ring": false,                                // true → on the Now Playing stage it wraps the artwork
 *       "vars": { "bw": "w / n" },                    // per-frame values, read back as `v.bw`
 *       "draw": [
 *         { "op": "each", "count": "n", "as": "i", "do": [
 *           { "op": "rect", "x": "i * v.bw", "y": "h - bands[i] * h * 0.8", "w": "v.bw - 2", "h": "bands[i] * h * 0.8",
 *             "radius": 3, "fill": "mixc(accent, accent2, i / n)", "alpha": "0.4 + bands[i] * 0.6", "glow": "bands[i] * 14" }
 *         ] }
 *       ]
 *     }
 *   },
 *   "backgrounds": { "stars": { "draw": [ … uses time, rand(i), audio.beat … ] } }
 * }
 *
 * Select one with `visualizer.type: "ember"` / `background.effect: "stars"` (add the id to the enum in modules.json).
 *
 * Operations: rect · circle · line · arc · poly · text · group · each · if · let.
 * Every numeric / colour property is a number or an expression (see expr.js). In scope: `w h u n bands bass energy beat
 * accent accent2 colors ring v` + loop variables + every hook (`audio`, `time`, `player`…) + `p` and `s`.
 *
 * Safety: no scripting, hard caps — ≤ 200 operations per program, loops ≤ 512, ≤ 6000 primitives drawn per frame.
 */
import { hookRootNames } from "./hook-catalog.js";
import { compile, num } from "./expr.js";
import { isObject } from "./schema.js";

export const DRAW_LIMITS = { ops: 200, loop: 512, primitives: 6000, depth: 6, vars: 16, programs: 16, stops: 8, text: 120 };
const ID_RE = /^[a-z][a-z0-9_-]{0,31}$/;
const VAR_RE = /^[a-z][A-Za-z0-9]{0,15}$/;
const LOOP_RE = /^[a-z][a-z0-9]{0,7}$/;
const BLENDS = new Set(["source-over", "lighter", "screen", "multiply", "overlay", "plus-lighter"]);
const PROGRAM_ROOTS = ["w", "h", "u", "n", "bands", "bass", "energy", "beat", "accent", "accent2", "colors", "ring", "v"];

const COMMON = ["op", "fill", "stroke", "lineWidth", "alpha", "glow", "glowColor", "blend", "cap", "join"];
const OPS = {
  rect: { req: ["x", "y", "w", "h"], extra: ["radius"] },
  circle: { req: ["x", "y", "r"], extra: [] },
  line: { req: ["x1", "y1", "x2", "y2"], extra: [] },
  arc: { req: ["x", "y", "r", "a0", "a1"], extra: [] },
  poly: { req: ["count", "x", "y"], extra: ["as", "closed", "smooth"] },
  text: { req: ["x", "y", "text"], extra: ["size", "align", "weight"] },
  group: { req: [], extra: ["do", "tx", "ty", "rotate", "scale", "alpha", "blend"] },
  each: { req: ["count", "as", "do"], extra: [] },
  if: { req: ["when", "do"], extra: ["else"] },
  let: { req: ["name", "value"], extra: [] },
};

class BudgetExceeded extends Error {}

/**
 * Compile draw.json. Never throws.
 * @returns {{ ok:boolean, draw:{visualizers:Record<string,object>, backgrounds:Record<string,object>}, errors:string[], warnings:string[] }}
 */
export function buildDraw(raw, { extraRoots = [] } = {}) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const draw = { visualizers: {}, backgrounds: {} };
  if (raw === undefined || raw === null) return { ok: true, draw, errors: [], warnings };
  if (!isObject(raw)) return { ok: false, draw, errors: ["draw.json must be a JSON object"], warnings };
  for (const key of Object.keys(raw)) if (!["visualizers", "backgrounds", "$schema", "doc"].includes(key)) warn(`draw.json: unknown field "${key}" — ignored`);

  for (const kind of ["visualizers", "backgrounds"]) {
    if (raw[kind] === undefined) continue;
    if (!isObject(raw[kind])) {
      warn(`"${kind}" must be an object`);
      continue;
    }
    for (const [id, prog] of Object.entries(raw[kind]).slice(0, DRAW_LIMITS.programs)) {
      if (!ID_RE.test(id)) {
        warn(`${kind}.${id}: invalid id (lowercase letters, digits, - _; ≤ 32)`);
        continue;
      }
      const compiled = compileProgram(`${kind}.${id}`, prog, kind === "visualizers", extraRoots, warn);
      if (compiled) draw[kind][id] = compiled;
    }
  }
  return { ok: true, draw, errors: [], warnings };
}

function compileProgram(where, raw, isViz, extraRoots, warn) {
  if (!isObject(raw)) return warn(`${where}: must be an object`), null;
  const baseRoots = hookRootNames([...PROGRAM_ROOTS, ...extraRoots]);
  let opCount = 0;
  let capWarned = false;

  /** Compile an expression-or-number into `(scope) => value`. */
  const E = (at, src, roots) => {
    if (typeof src === "number") return Number.isFinite(src) ? { run: () => src, konst: true } : null;
    if (typeof src === "boolean") return { run: () => src, konst: true };
    if (typeof src !== "string") return warn(`${at}: expected a number or an expression string`), null;
    try {
      const c = compile(src, { roots });
      const st = c.newState();
      return { run: (sc) => c.run(sc, st) };
    } catch (error) {
      warn(`${at}: ${error.message}`);
      return null;
    }
  };
  const N = (at, src, def, roots) => {
    const e = E(at, src, roots);
    return e ? (sc) => num(e.run(sc), def) : () => def;
  };

  const colorSpec = (at, src, roots) => {
    if (src === undefined || src === null) return null;
    if (isObject(src)) {
      const g = src.linear ?? src.radial;
      const radial = Boolean(src.radial);
      if (!isObject(g) || !Array.isArray(g.stops) || !g.stops.length) return warn(`${at}: gradient needs "stops"`), null;
      const fields = radial ? ["x", "y", "r0", "r1"] : ["x1", "y1", "x2", "y2"];
      const f = fields.map((k) => N(`${at}.${k}`, g[k] ?? 0, 0, roots));
      const stops = g.stops.slice(0, DRAW_LIMITS.stops).map((s, i) => {
        if (!Array.isArray(s) || s.length !== 2) return warn(`${at}.stops[${i}]: expected [position, color]`), null;
        return { pos: N(`${at}.stops[${i}]`, s[0], 0, roots), color: E(`${at}.stops[${i}]`, s[1], roots) };
      }).filter((s) => s && s.color);
      if (!stops.length) return null;
      return (ctx, sc) => {
        const v = f.map((fn) => fn(sc));
        const grad = radial ? ctx.createRadialGradient(v[0], v[1], v[2], v[0], v[1], v[3]) : ctx.createLinearGradient(v[0], v[1], v[2], v[3]);
        for (const s of stops) {
          try {
            grad.addColorStop(Math.min(1, Math.max(0, s.pos(sc))), String(s.color.run(sc)));
          } catch {
            /* invalid color */
          }
        }
        return grad;
      };
    }
    const e = E(at, src, roots);
    return e ? (_ctx, sc) => e.run(sc) : null;
  };

  /** Common style handling → returns `(ctx, sc) => restoreFn` helper pieces */
  const style = (at, op, roots) => ({
    fill: colorSpec(`${at}.fill`, op.fill, roots),
    stroke: colorSpec(`${at}.stroke`, op.stroke, roots),
    lineWidth: op.lineWidth === undefined ? null : N(`${at}.lineWidth`, op.lineWidth, 1, roots),
    alpha: op.alpha === undefined ? null : N(`${at}.alpha`, op.alpha, 1, roots),
    glow: op.glow === undefined ? null : N(`${at}.glow`, op.glow, 0, roots),
    glowColor: op.glowColor === undefined ? null : E(`${at}.glowColor`, op.glowColor, roots),
    blend: typeof op.blend === "string" && BLENDS.has(op.blend) ? op.blend : null,
    cap: op.cap === "round" || op.cap === "square" ? op.cap : "butt",
    join: op.join === "round" || op.join === "bevel" ? op.join : "miter",
  });

  /** Set up paint state, run `shape()` to build the path, then fill/stroke. */
  const paint = (st, defaultKind) => (ctx, sc, shape) => {
    ctx.save();
    if (st.alpha) ctx.globalAlpha *= Math.min(1, Math.max(0, st.alpha(sc)));
    if (st.blend) ctx.globalCompositeOperation = st.blend;
    const fill = st.fill ? st.fill(ctx, sc) : defaultKind === "fill" && !st.stroke ? sc.accent : null;
    const stroke = st.stroke ? st.stroke(ctx, sc) : defaultKind === "stroke" && !st.fill ? sc.accent : null;
    if (st.glow) {
      const g = st.glow(sc);
      if (g > 0.5) {
        ctx.shadowBlur = Math.min(80, g);
        const gc = st.glowColor ? st.glowColor.run(sc) : typeof (fill ?? stroke) === "string" ? (fill ?? stroke) : sc.accent;
        ctx.shadowColor = String(gc);
      }
    }
    if (fill !== null && fill !== undefined) ctx.fillStyle = fill;
    if (stroke !== null && stroke !== undefined) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(0.1, st.lineWidth ? st.lineWidth(sc) : 1);
      ctx.lineCap = st.cap;
      ctx.lineJoin = st.join;
    }
    shape();
    if (fill !== null && fill !== undefined) ctx.fill();
    if (stroke !== null && stroke !== undefined) ctx.stroke();
    ctx.restore();
  };

  const compileList = (at, list, roots, depth) => {
    if (!Array.isArray(list)) return warn(`${at}: expected an array of operations`), [];
    if (depth > DRAW_LIMITS.depth) return warn(`${at}: nested deeper than ${DRAW_LIMITS.depth} levels`), [];
    const out = [];
    for (const [i, op] of list.entries()) {
      const c = compileOp(`${at}[${i}]`, op, roots, depth);
      if (c) out.push(c);
    }
    return out;
  };

  const compileOp = (at, op, roots, depth) => {
    if (!isObject(op) || typeof op.op !== "string" || !Object.prototype.hasOwnProperty.call(OPS, op.op)) {
      return warn(`${at}: unknown op ${JSON.stringify(op?.op)} (${Object.keys(OPS).join(", ")})`), null;
    }
    if (opCount >= DRAW_LIMITS.ops) {
      if (!capWarned) warn(`${where}: more than ${DRAW_LIMITS.ops} operations — the rest is ignored`);
      capWarned = true;
      return null;
    }
    opCount++;
    const def = OPS[op.op];
    for (const key of Object.keys(op)) if (!COMMON.includes(key) && !def.req.includes(key) && !def.extra.includes(key)) warn(`${at}: unknown property "${key}" for op "${op.op}"`);
    for (const key of def.req) if (op[key] === undefined) return warn(`${at}: op "${op.op}" needs "${key}"`), null;

    switch (op.op) {
      case "rect": {
        const [x, y, w, h, r] = ["x", "y", "w", "h", "radius"].map((k) => N(`${at}.${k}`, op[k] ?? 0, 0, roots));
        const paintIt = paint(style(at, op, roots), "fill");
        return (ctx, sc, b) => {
          b.take();
          const rx = x(sc), ry = y(sc), rw = w(sc), rh = h(sc), rr = Math.max(0, r(sc));
          paintIt(ctx, sc, () => {
            ctx.beginPath();
            if (rr > 0 && ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, Math.min(rr, Math.abs(rw) / 2, Math.abs(rh) / 2));
            else ctx.rect(rx, ry, rw, rh);
          });
        };
      }
      case "circle": {
        const [x, y, r] = ["x", "y", "r"].map((k) => N(`${at}.${k}`, op[k], 0, roots));
        const paintIt = paint(style(at, op, roots), "fill");
        return (ctx, sc, b) => {
          b.take();
          const cx = x(sc), cy = y(sc), cr = Math.max(0, r(sc));
          paintIt(ctx, sc, () => {
            ctx.beginPath();
            ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          });
        };
      }
      case "line": {
        const [x1, y1, x2, y2] = ["x1", "y1", "x2", "y2"].map((k) => N(`${at}.${k}`, op[k], 0, roots));
        const paintIt = paint(style(at, op, roots), "stroke");
        return (ctx, sc, b) => {
          b.take();
          const a = [x1(sc), y1(sc), x2(sc), y2(sc)];
          paintIt(ctx, sc, () => {
            ctx.beginPath();
            ctx.moveTo(a[0], a[1]);
            ctx.lineTo(a[2], a[3]);
          });
        };
      }
      case "arc": {
        const [x, y, r, a0, a1] = ["x", "y", "r", "a0", "a1"].map((k) => N(`${at}.${k}`, op[k], 0, roots));
        const paintIt = paint(style(at, op, roots), "stroke");
        return (ctx, sc, b) => {
          b.take();
          const v = [x(sc), y(sc), Math.max(0, r(sc)), a0(sc), a1(sc)];
          paintIt(ctx, sc, () => {
            ctx.beginPath();
            ctx.arc(v[0], v[1], v[2], v[3], v[4]);
          });
        };
      }
      case "poly": {
        let as = "i";
        if (op.as !== undefined) {
          if (typeof op.as !== "string" || !LOOP_RE.test(op.as) || roots.has(op.as)) return warn(`${at}.as: invalid or already used loop variable`), null;
          as = op.as;
        }
        const inner = new Set([...roots, as]);
        const count = N(`${at}.count`, op.count, 0, roots);
        const x = N(`${at}.x`, op.x, 0, inner);
        const y = N(`${at}.y`, op.y, 0, inner);
        const closed = op.closed === true;
        const smooth = op.smooth === true;
        const paintIt = paint(style(at, op, roots), "stroke");
        return (ctx, sc, b) => {
          const n = Math.min(DRAW_LIMITS.loop, Math.max(0, Math.floor(count(sc))));
          if (n < 2) return;
          b.take(n);
          const px = new Array(n);
          const py = new Array(n);
          for (let i = 0; i < n; i++) {
            sc[as] = i;
            px[i] = x(sc);
            py[i] = y(sc);
          }
          delete sc[as];
          paintIt(ctx, sc, () => {
            ctx.beginPath();
            ctx.moveTo(px[0], py[0]);
            if (smooth && n > 2) {
              for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(px[i], py[i], (px[i] + px[i + 1]) / 2, (py[i] + py[i + 1]) / 2);
              ctx.lineTo(px[n - 1], py[n - 1]);
            } else for (let i = 1; i < n; i++) ctx.lineTo(px[i], py[i]);
            if (closed) ctx.closePath();
          });
        };
      }
      case "text": {
        const [x, y, size] = [N(`${at}.x`, op.x, 0, roots), N(`${at}.y`, op.y, 0, roots), N(`${at}.size`, op.size ?? 14, 14, roots)];
        const text = E(`${at}.text`, op.text, roots);
        if (!text) return null;
        const align = ["left", "center", "right"].includes(op.align) ? op.align : "left";
        const weight = op.weight === "bold" ? "bold " : "";
        const paintIt = paint(style(at, op, roots), "fill");
        return (ctx, sc, b) => {
          b.take();
          const label = String(text.run(sc) ?? "").slice(0, DRAW_LIMITS.text);
          const tx = x(sc), ty = y(sc), ts = Math.min(400, Math.max(4, size(sc)));
          paintIt(ctx, sc, () => {
            ctx.font = `${weight}${ts}px system-ui, sans-serif`;
            ctx.textAlign = align;
            ctx.textBaseline = "middle";
            ctx.fillText(label, tx, ty); // fill style was prepared by paint(); the empty path fill is a no-op
          });
        };
      }
      case "group": {
        const children = compileList(`${at}.do`, op.do ?? [], roots, depth + 1);
        const [tx, ty, rot, sca] = [N(`${at}.tx`, op.tx ?? 0, 0, roots), N(`${at}.ty`, op.ty ?? 0, 0, roots), N(`${at}.rotate`, op.rotate ?? 0, 0, roots), N(`${at}.scale`, op.scale ?? 1, 1, roots)];
        const alpha = op.alpha === undefined ? null : N(`${at}.alpha`, op.alpha, 1, roots);
        const blend = typeof op.blend === "string" && BLENDS.has(op.blend) ? op.blend : null;
        return (ctx, sc, b) => {
          ctx.save();
          ctx.translate(tx(sc), ty(sc));
          ctx.rotate(rot(sc));
          const s = sca(sc);
          ctx.scale(s, s);
          if (alpha) ctx.globalAlpha *= Math.min(1, Math.max(0, alpha(sc)));
          if (blend) ctx.globalCompositeOperation = blend;
          try {
            for (const child of children) child(ctx, sc, b);
          } finally {
            ctx.restore();
          }
        };
      }
      case "each": {
        if (typeof op.as !== "string" || !LOOP_RE.test(op.as) || roots.has(op.as)) return warn(`${at}.as: invalid or already used loop variable "${op.as}"`), null;
        const as = op.as;
        const count = N(`${at}.count`, op.count, 0, roots);
        const children = compileList(`${at}.do`, op.do, new Set([...roots, as]), depth + 1);
        return (ctx, sc, b) => {
          const n = Math.min(DRAW_LIMITS.loop, Math.max(0, Math.floor(count(sc))));
          for (let i = 0; i < n; i++) {
            sc[as] = i;
            for (const child of children) child(ctx, sc, b);
          }
          delete sc[as];
        };
      }
      case "if": {
        const when = E(`${at}.when`, op.when, roots);
        if (!when) return null;
        const yes = compileList(`${at}.do`, op.do, roots, depth + 1);
        const no = op.else === undefined ? [] : compileList(`${at}.else`, op.else, roots, depth + 1);
        return (ctx, sc, b) => {
          for (const child of when.run(sc) ? yes : no) child(ctx, sc, b);
        };
      }
      case "let": {
        if (typeof op.name !== "string" || !VAR_RE.test(op.name)) return warn(`${at}.name: invalid variable name`), null;
        const value = E(`${at}.value`, op.value, roots);
        if (!value) return null;
        const name = op.name;
        return (_ctx, sc) => {
          sc.v[name] = value.run(sc);
        };
      }
      default:
        return null;
    }
  };

  // vars
  const vars = [];
  if (raw.vars !== undefined) {
    if (!isObject(raw.vars)) warn(`${where}.vars: must be an object`);
    else
      for (const [name, src] of Object.entries(raw.vars).slice(0, DRAW_LIMITS.vars)) {
        if (!VAR_RE.test(name)) {
          warn(`${where}.vars.${name}: invalid name`);
          continue;
        }
        const e = E(`${where}.vars.${name}`, src, baseRoots);
        if (e) vars.push({ name, run: e.run });
      }
  }
  const ops = compileList(`${where}.draw`, raw.draw ?? [], baseRoots, 0);
  if (!ops.length) warn(`${where}: has no drawable operations`);
  const bands = Number.isInteger(raw.bands) ? Math.min(96, Math.max(8, raw.bands)) : 0;
  return {
    doc: typeof raw.doc === "string" ? raw.doc.slice(0, 200) : "",
    bands,
    ring: isViz && raw.ring === true,
    opCount,
    /**
     * Draw one frame. `scope` is a fresh object per call (host-provided values + hooks).
     * @returns {number} primitives drawn
     */
    render(ctx, scope) {
      const budget = { left: DRAW_LIMITS.primitives, used: 0, take(n = 1) {
        this.used += n;
        if ((this.left -= n) < 0) throw new BudgetExceeded();
      } };
      scope.v = {};
      try {
        for (const v of vars) scope.v[v.name] = v.run(scope);
        for (const op of ops) op(ctx, scope, budget);
      } catch (error) {
        if (!(error instanceof BudgetExceeded)) throw error;
      }
      return budget.used;
    },
  };
}
