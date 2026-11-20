/**
 * Safe expression language for presets (PURE — no DOM, no eval, no `new Function`).
 *
 * Presets cannot ship JavaScript, so everything "dynamic" they do is written as small expressions:
 *
 *     audio.bass > 0.6 ? 'hot' : 'calm'
 *     mix(4, 28, smooth(audio.bass, 0.8, 0.12))
 *     has(p.visualizer.placement, 'stage') && viewport.w > 900
 *
 * Grammar: numbers, 'strings', true/false/null, identifiers, `a.b`, `a[i]`, `f(x, …)`, `[a, b]`,
 * unary `- !`, binary `* / % + - < <= > >= == != && || ??`, ternary `c ? a : b`.
 *
 * Safety model
 *   • expressions are parsed into an AST and compiled to closures: nothing is ever evaluated as JS;
 *   • only functions from the whitelist (`FUNCTIONS`, plus any the host adds) can be called — never values;
 *   • property access only reads OWN properties of plain data (no `__proto__`, `constructor`, …);
 *   • no loops/recursion/assignment → every expression terminates; size and depth are capped.
 */

export const LIMITS = { chars: 500, nodes: 240, depth: 16, brackets: 32 };

export class ExprError extends Error {
  constructor(message, pos) {
    super(pos === undefined ? message : `${message} (at ${pos})`);
    this.pos = pos;
  }
}

/* ------------------------------------------------------------------ tokenizer */

const TWO = ["<=", ">=", "==", "!=", "&&", "||", "??"];
const ONE = "+-*/%<>!?:(),.[]";

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      out.push({ t: "num", v: Number(m[0]), pos: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][A-Za-z0-9_$]*/.exec(src.slice(i));
      out.push({ t: "id", v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      let s = "";
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\" && j + 1 < src.length) j++;
        s += src[j++];
      }
      if (src[j] !== c) throw new ExprError("Unterminated string", i);
      out.push({ t: "str", v: s, pos: i });
      i = j + 1;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO.includes(two)) {
      out.push({ t: "op", v: two, pos: i });
      i += 2;
      continue;
    }
    if (ONE.includes(c)) {
      out.push({ t: "op", v: c, pos: i });
      i++;
      continue;
    }
    throw new ExprError(`Unexpected character "${c}"`, i);
  }
  out.push({ t: "end", pos: src.length });
  return out;
}

/* --------------------------------------------------------------------- parser */

const BINARY = [
  ["??"],
  ["||"],
  ["&&"],
  ["==", "!="],
  ["<", "<=", ">", ">="],
  ["+", "-"],
  ["*", "/", "%"],
];

export function parse(src) {
  if (typeof src !== "string" || !src.trim()) throw new ExprError("Empty expression");
  if (src.length > LIMITS.chars) throw new ExprError(`Expression longer than ${LIMITS.chars} characters`);
  const toks = tokenize(src);
  let open = 0;
  for (const t of toks)
    if (t.t === "op" && (t.v === "(" || t.v === "[") && ++open > LIMITS.brackets) throw new ExprError("Expression nested too deeply");
    else if (t.t === "op" && (t.v === ")" || t.v === "]")) open--;
  let k = 0;
  let nodes = 0;
  const peek = () => toks[k];
  const isOp = (v) => peek().t === "op" && peek().v === v;
  const eat = (v) => {
    if (!isOp(v)) throw new ExprError(`Expected "${v}"`, peek().pos);
    return toks[k++];
  };
  const node = (n) => {
    if (++nodes > LIMITS.nodes) throw new ExprError(`Expression too complex (> ${LIMITS.nodes} nodes)`);
    return n;
  };

  function ternary(d) {
    const cond = binary(0, d + 1);
    if (!isOp("?")) return cond;
    k++;
    const a = ternary(d + 1);
    eat(":");
    const b = ternary(d + 1);
    return node({ k: "cond", cond, a, b }, d);
  }
  function binary(level, d) {
    if (level >= BINARY.length) return unary(d + 1);
    let left = binary(level + 1, d + 1);
    while (peek().t === "op" && BINARY[level].includes(peek().v)) {
      const op = toks[k++].v;
      const right = binary(level + 1, d + 1);
      left = node({ k: "bin", op, left, right }, d);
    }
    return left;
  }
  function unary(d) {
    if (isOp("-") || isOp("!")) {
      const op = toks[k++].v;
      return node({ k: "un", op, arg: unary(d + 1) }, d);
    }
    return postfix(d + 1);
  }
  function postfix(d) {
    let e = primary(d + 1);
    for (;;) {
      if (isOp(".")) {
        k++;
        const t = peek();
        if (t.t !== "id") throw new ExprError("Expected property name", t.pos);
        k++;
        e = node({ k: "member", obj: e, key: t.v }, d);
      } else if (isOp("[")) {
        k++;
        const idx = ternary(d + 1);
        eat("]");
        e = node({ k: "index", obj: e, idx }, d);
      } else if (isOp("(")) {
        if (e.k !== "id") throw new ExprError("Only whitelisted functions can be called", peek().pos);
        k++;
        const args = [];
        if (!isOp(")")) {
          do args.push(ternary(d + 1));
          while (isOp(",") && k++);
        }
        eat(")");
        e = node({ k: "call", name: e.name, args }, d);
      } else return e;
    }
  }
  function primary(d) {
    const t = peek();
    if (t.t === "num") return k++, node({ k: "lit", v: t.v }, d);
    if (t.t === "str") return k++, node({ k: "lit", v: t.v }, d);
    if (t.t === "id") {
      k++;
      if (t.v === "true") return node({ k: "lit", v: true }, d);
      if (t.v === "false") return node({ k: "lit", v: false }, d);
      if (t.v === "null") return node({ k: "lit", v: null }, d);
      return node({ k: "id", name: t.v }, d);
    }
    if (isOp("(")) {
      k++;
      const e = ternary(d + 1);
      eat(")");
      return e;
    }
    if (isOp("[")) {
      k++;
      const items = [];
      if (!isOp("]")) {
        do items.push(ternary(d + 1));
        while (isOp(",") && k++);
      }
      eat("]");
      return node({ k: "arr", items }, d);
    }
    throw new ExprError(t.t === "end" ? "Unexpected end of expression" : `Unexpected "${t.v}"`, t.pos);
  }

  const ast = ternary(0);
  if (peek().t !== "end") throw new ExprError(`Unexpected "${peek().v}"`, peek().pos);
  if (astDepth(ast) > LIMITS.depth) throw new ExprError(`Expression nested deeper than ${LIMITS.depth} levels`);
  return ast;
}

/** Nesting depth of the real syntax tree (what limits evaluation cost), not of the grammar levels. */
function astDepth(n) {
  const kids = n.k === "bin" ? [n.left, n.right] : n.k === "un" ? [n.arg] : n.k === "cond" ? [n.cond, n.a, n.b] : n.k === "member" ? [n.obj] : n.k === "index" ? [n.obj, n.idx] : n.k === "call" ? n.args : n.k === "arr" ? n.items : [];
  let d = 0;
  for (const c of kids) d = Math.max(d, astDepth(c));
  return d + 1;
}

/* ------------------------------------------------------------------- helpers */

const BANNED = new Set(["__proto__", "constructor", "prototype"]);
const isArrayLike = (v) => Array.isArray(v) || ArrayBuffer.isView(v);

function getKey(obj, key) {
  if (obj == null || BANNED.has(key)) return undefined;
  if (typeof obj === "string") return key === "length" ? obj.length : undefined;
  if (isArrayLike(obj)) return key === "length" ? obj.length : undefined;
  if (typeof obj !== "object") return undefined;
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function getIndex(obj, idx) {
  if (obj == null) return undefined;
  if (isArrayLike(obj) || typeof obj === "string") {
    const n = Math.floor(Number(idx));
    return Number.isFinite(n) && n >= 0 && n < obj.length ? obj[n] : undefined;
  }
  if (typeof obj === "object" && typeof idx === "string") return getKey(obj, idx);
  return undefined;
}

export const num = (v, fallback = 0) => {
  const n = typeof v === "number" ? v : typeof v === "boolean" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* --------------------------------------------------------------- color helpers */

function parseColor(c) {
  if (typeof c !== "string") return null;
  let m = /^#([0-9a-f]{3,8})$/i.exec(c.trim());
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((x) => x + x).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    const n = parseInt(h.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\s*\)$/i.exec(c.trim());
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
  m = /^hsla?\(\s*([\d.-]+)[ ,]+([\d.]+)%[ ,]+([\d.]+)%(?:[ ,/]+([\d.]+))?\s*\)$/i.exec(c.trim());
  if (m) {
    const h = (((+m[1] % 360) + 360) % 360) / 360;
    const s = +m[2] / 100;
    const l = +m[3] / 100;
    const f = (n) => {
      const k2 = (n + h * 12) % 12;
      return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k2 - 3, 9 - k2, 1));
    };
    return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255, a: m[4] === undefined ? 1 : +m[4] };
  }
  return null;
}
const rgbaStr = (c) =>
  `rgba(${Math.round(clamp(c.r, 0, 255))}, ${Math.round(clamp(c.g, 0, 255))}, ${Math.round(clamp(c.b, 0, 255))}, ${clamp(c.a, 0, 1).toFixed(3)})`;

/* --------------------------------------------------------- function library */

/** Hash → 0..1 (deterministic; used for `rand`/`noise`). */
function hash01(n) {
  let x = Math.imul((Math.floor(n * 4096) | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const EASE = {
  in: (t) => t * t,
  out: (t) => 1 - (1 - t) * (1 - t),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  cubic: (t) => t * t * t,
  sine: (t) => 0.5 - Math.cos(Math.PI * t) / 2,
  back: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
};

/** Pure functions: `(...args) => value`. */
export const FUNCTIONS = {
  abs: (x) => Math.abs(num(x)),
  min: (...a) => Math.min(...a.map((v) => num(v))),
  max: (...a) => Math.max(...a.map((v) => num(v))),
  floor: (x) => Math.floor(num(x)),
  ceil: (x) => Math.ceil(num(x)),
  round: (x, d = 0) => {
    const f = 10 ** clamp(num(d), 0, 6);
    return Math.round(num(x) * f) / f;
  },
  sqrt: (x) => Math.sqrt(Math.max(0, num(x))),
  pow: (x, y) => num(Math.pow(num(x), num(y))),
  exp: (x) => num(Math.exp(num(x))),
  log: (x) => num(Math.log(Math.max(1e-12, num(x)))),
  sin: (x) => Math.sin(num(x)),
  cos: (x) => Math.cos(num(x)),
  tan: (x) => num(Math.tan(num(x))),
  atan2: (y, x) => Math.atan2(num(y), num(x)),
  sign: (x) => Math.sign(num(x)),
  fract: (x) => num(x) - Math.floor(num(x)),
  mod: (x, y) => {
    const m = num(y, 1) || 1;
    return ((num(x) % m) + m) % m;
  },
  clamp: (x, lo = 0, hi = 1) => clamp(num(x), num(lo), num(hi)),
  clamp01: (x) => clamp(num(x), 0, 1),
  mix: (a, b, t) => num(a) + (num(b) - num(a)) * num(t),
  step: (edge, x) => (num(x) >= num(edge) ? 1 : 0),
  smoothstep: (a, b, x) => {
    const t = clamp((num(x) - num(a)) / ((num(b) - num(a)) || 1), 0, 1);
    return t * t * (3 - 2 * t);
  },
  map: (x, a, b, c, d) => {
    const t = (num(x) - num(a)) / ((num(b) - num(a)) || 1);
    return num(c) + (num(d) - num(c)) * t;
  },
  ease: (t, kind = "inOut") => (EASE[kind] ?? EASE.inOut)(clamp(num(t), 0, 1)),
  rand: (seed, salt = 0) => hash01(num(seed) * 12.9898 + num(salt) * 78.233 + 0.5),
  noise: (x) => {
    const n = num(x);
    const i = Math.floor(n);
    const f = n - i;
    const t = f * f * (3 - 2 * f);
    return hash01(i) * (1 - t) + hash01(i + 1) * t;
  },
  has: (list, v) => (isArrayLike(list) ? Array.prototype.includes.call(list, v) : typeof list === "string" ? list.includes(String(v)) : false),
  len: (x) => (x == null ? 0 : typeof x === "string" || isArrayLike(x) ? x.length : 0),
  pick: (list, i) => (isArrayLike(list) && list.length ? list[((Math.floor(num(i)) % list.length) + list.length) % list.length] : undefined),
  str: (x) => (x == null ? "" : String(x)),
  num: (x, d = 0) => num(x, num(d)),
  concat: (...a) => a.map((x) => (x == null ? "" : String(x))).join("").slice(0, 200),
  lower: (x) => String(x ?? "").toLowerCase(),
  contains: (s, sub) => String(s ?? "").includes(String(sub ?? "")),
  avgof: (list) => {
    if (!isArrayLike(list) || !list.length) return 0;
    let s = 0;
    for (let i = 0; i < list.length; i++) s += num(list[i]);
    return s / list.length;
  },
  // colors → CSS strings
  hsl: (h, s = 80, l = 60, a = 1) => `hsla(${Math.round((((num(h) % 360) + 360) % 360) * 10) / 10}, ${clamp(num(s), 0, 100)}%, ${clamp(num(l), 0, 100)}%, ${clamp(num(a, 1), 0, 1)})`,
  rgb: (r, g, b, a = 1) => rgbaStr({ r: num(r), g: num(g), b: num(b), a: num(a, 1) }),
  alpha: (c, a) => {
    const p = parseColor(c);
    return p ? rgbaStr({ ...p, a: num(a, 1) }) : String(c ?? "");
  },
  mixc: (c1, c2, t) => {
    const a = parseColor(c1);
    const b = parseColor(c2);
    if (!a || !b) return String(c1 ?? "");
    const k = clamp(num(t), 0, 1);
    return rgbaStr({ r: a.r + (b.r - a.r) * k, g: a.g + (b.g - a.g) * k, b: a.b + (b.b - a.b) * k, a: a.a + (b.a - a.a) * k });
  },
  lighten: (c, amt) => {
    const a = parseColor(c);
    if (!a) return String(c ?? "");
    const k = num(amt);
    const f = (v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k));
    return rgbaStr({ r: f(a.r), g: f(a.g), b: f(a.b), a: a.a });
  },
};

export const CONSTANTS = { pi: Math.PI, tau: Math.PI * 2 };

/**
 * Stateful functions keep one state slot per CALL SITE (see compile): `smooth(audio.bass, …)` written twice
 * means two independent smoothers. They read `scope.dt` (seconds since the last evaluation).
 *   smooth(x, attack, release)  asymmetric smoothing, coefficients in 0..1 "per 1/60 s" (fast attack, slow release)
 *   lag(x, seconds)             exponential low-pass with a time constant
 *   peak(x, decay)              rises instantly, decays `decay` units per second
 *   avg(x, seconds)             running average
 *   delta(x)                    change since the previous evaluation
 *   accum(x)                    integral of x over time (x per second), wraps at 1e6
 *   pulse(cond, seconds)        1 on a rising edge of `cond`, then falls linearly to 0 over `seconds`
 *   hold(x, seconds)            keeps the highest recent value for `seconds`, then follows x
 */
export const STATEFUL = {
  smooth(st, dt, x, attack = 0.75, release = 0.14) {
    x = num(x);
    const f = (k) => 1 - Math.pow(1 - clamp(num(k), 0.001, 1), clamp(dt, 0, 0.25) * 60);
    st.v = st.v === undefined ? x : st.v + (x - st.v) * f(x > st.v ? attack : release);
    return st.v;
  },
  lag(st, dt, x, seconds = 0.3) {
    x = num(x);
    const a = 1 - Math.exp(-clamp(dt, 0, 0.25) / Math.max(0.001, num(seconds, 0.3)));
    st.v = st.v === undefined ? x : st.v + (x - st.v) * a;
    return st.v;
  },
  peak(st, dt, x, decay = 1) {
    x = num(x);
    st.v = st.v === undefined || x >= st.v ? x : Math.max(x, st.v - clamp(dt, 0, 0.25) * num(decay, 1));
    return st.v;
  },
  avg(st, dt, x, seconds = 1) {
    x = num(x);
    const a = 1 - Math.exp(-clamp(dt, 0, 0.25) / Math.max(0.01, num(seconds, 1)));
    st.v = st.v === undefined ? x : st.v + (x - st.v) * a;
    return st.v;
  },
  delta(st, _dt, x) {
    x = num(x);
    const d = st.v === undefined ? 0 : x - st.v;
    st.v = x;
    return d;
  },
  accum(st, dt, x) {
    st.v = ((st.v ?? 0) + num(x) * clamp(dt, 0, 0.25)) % 1e6;
    return st.v;
  },
  pulse(st, dt, cond, seconds = 0.4) {
    const on = Boolean(cond);
    if (on && !st.prev) st.v = 1;
    st.prev = on;
    st.v = Math.max(0, (st.v ?? 0) - clamp(dt, 0, 0.25) / Math.max(0.02, num(seconds, 0.4)));
    return st.v;
  },
  hold(st, dt, x, seconds = 0.5) {
    x = num(x);
    st.t = (st.t ?? 0) - clamp(dt, 0, 0.25);
    if (st.v === undefined || x >= st.v || st.t <= 0) {
      st.v = x;
      st.t = num(seconds, 0.5);
    }
    return st.v;
  },
};

/* ------------------------------------------------------------------- compile */

/**
 * Compile an expression.
 * @param {string} src
 * @param {{ roots?: Iterable<string>, fns?: Record<string, Function> }} [options]
 *   roots: allowed top-level identifiers (others → ExprError at compile time); omit to allow any.
 *   fns:   extra whitelisted pure functions (host-provided).
 * @returns {{ src:string, run:(scope:object, state?:object[]) => any, newState:() => object[], roots:Set<string>, paths:Set<string>, stateful:boolean }}
 */
export function compile(src, options = {}) {
  const ast = parse(src);
  const allowed = options.roots ? new Set(options.roots) : null;
  const fns = { ...FUNCTIONS, ...(options.fns ?? {}) };
  const roots = new Set();
  const paths = new Set();
  let slots = 0;

  const pathOf = (n) => {
    if (n.k === "id") return n.name;
    if (n.k === "member") {
      const p = pathOf(n.obj);
      return p ? `${p}.${n.key}` : null;
    }
    return null;
  };

  function build(n) {
    switch (n.k) {
      case "lit": {
        const v = n.v;
        return () => v;
      }
      case "id": {
        const name = n.name;
        if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
          const v = CONSTANTS[name];
          return () => v;
        }
        if (allowed && !allowed.has(name)) throw new ExprError(`Unknown name "${name}"`);
        roots.add(name);
        return (sc) => (Object.prototype.hasOwnProperty.call(sc, name) ? sc[name] : undefined);
      }
      case "member": {
        const p = pathOf(n);
        if (p) paths.add(p);
        const obj = build(n.obj);
        const key = n.key;
        return (sc, st) => getKey(obj(sc, st), key);
      }
      case "index": {
        const obj = build(n.obj);
        const idx = build(n.idx);
        return (sc, st) => getIndex(obj(sc, st), idx(sc, st));
      }
      case "arr": {
        const items = n.items.map(build);
        return (sc, st) => items.map((f) => f(sc, st));
      }
      case "call": {
        const name = n.name;
        const args = n.args.map(build);
        if (Object.prototype.hasOwnProperty.call(STATEFUL, name)) {
          const slot = slots++;
          const fn = STATEFUL[name];
          return (sc, st) => {
            const bag = st ?? (st = []);
            const s = bag[slot] ?? (bag[slot] = {});
            return fn(s, num(sc.dt, 1 / 60), ...args.map((f) => f(sc, st)));
          };
        }
        const fn = fns[name];
        if (typeof fn !== "function" || !Object.prototype.hasOwnProperty.call(fns, name))
          throw new ExprError(`Unknown function "${name}"`);
        return (sc, st) => fn(...args.map((f) => f(sc, st)));
      }
      case "un": {
        const a = build(n.arg);
        return n.op === "-" ? (sc, st) => -num(a(sc, st)) : (sc, st) => !a(sc, st);
      }
      case "bin": {
        const l = build(n.left);
        const r = build(n.right);
        switch (n.op) {
          case "&&":
            return (sc, st) => l(sc, st) && r(sc, st);
          case "||":
            return (sc, st) => l(sc, st) || r(sc, st);
          case "??":
            return (sc, st) => l(sc, st) ?? r(sc, st);
          case "==":
            return (sc, st) => {
              const a = l(sc, st);
              const b = r(sc, st);
              return a === b || (typeof a === "number" && a == b);
            };
          case "!=":
            return (sc, st) => {
              const a = l(sc, st);
              const b = r(sc, st);
              return !(a === b || (typeof a === "number" && a == b));
            };
          case "+":
            return (sc, st) => {
              const a = l(sc, st);
              const b = r(sc, st);
              return typeof a === "string" || typeof b === "string" ? String(a ?? "") + String(b ?? "") : num(a) + num(b);
            };
          case "-":
            return (sc, st) => num(l(sc, st)) - num(r(sc, st));
          case "*":
            return (sc, st) => num(l(sc, st)) * num(r(sc, st));
          case "/":
            return (sc, st) => {
              const d = num(r(sc, st));
              return d === 0 ? 0 : num(l(sc, st)) / d;
            };
          case "%":
            return (sc, st) => {
              const d = num(r(sc, st));
              return d === 0 ? 0 : num(l(sc, st)) % d;
            };
          case "<":
            return (sc, st) => num(l(sc, st)) < num(r(sc, st));
          case "<=":
            return (sc, st) => num(l(sc, st)) <= num(r(sc, st));
          case ">":
            return (sc, st) => num(l(sc, st)) > num(r(sc, st));
          case ">=":
            return (sc, st) => num(l(sc, st)) >= num(r(sc, st));
          default:
            throw new ExprError(`Unsupported operator ${n.op}`);
        }
      }
      case "cond": {
        const c = build(n.cond);
        const a = build(n.a);
        const b = build(n.b);
        return (sc, st) => (c(sc, st) ? a(sc, st) : b(sc, st));
      }
      default:
        throw new ExprError("Unsupported syntax");
    }
  }

  const fn = build(ast);
  return {
    src,
    run: (scope, state) => fn(scope, state),
    newState: () => [],
    roots,
    paths,
    stateful: slots > 0,
  };
}

/** Compile without throwing: `{ ok, expr?, error? }`. */
export function tryCompile(src, options) {
  try {
    return { ok: true, expr: compile(src, options) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
