/**
 * hooks.json — the "logic" of a preset, written WITHOUT code (pure: no DOM).
 *
 * {
 *   "signals": {                         // named derived values, available to everything as `s.<name>`
 *     "kick":  "smooth(audio.bass, 0.85, 0.12)",
 *     "heat":  "lag(audio.energy, 0.6)"
 *   },
 *   "bind": [                            // push computed values to <html> (CSS vars / data-attrs / classes)
 *     { "css": "--preset-glow", "expr": "mix(4, 32, s.kick)", "unit": "px" },
 *     { "attr": "mood", "expr": "s.heat > 0.5 ? 'hot' : 'calm'" },
 *     { "class": "lyrics-on", "expr": "lyrics.has && view == 'nowplaying'" }
 *   ],
 *   "rules": [                           // conditional parameter overrides (re-resolve the configuration)
 *     { "when": "viewport.w < 900", "set": { "layout.sidebar": "rail", "layout.density": "compact" } }
 *   ]
 * }
 *
 * Expressions read HOOKS (audio, player, track, viewport … see hook-catalog.js), the resolved parameters `p`
 * and the signals declared before them `s`. Evaluation cost is derived automatically: anything touching a
 * "frame" hook (audio, time) runs every animation frame, everything else ~5×/second.
 */
import { HOOK_ROOTS, costRank, hookRootNames, unknownHookFields } from "./hook-catalog.js";
import { tryCompile } from "./expr.js";
import { CSS_VAR_RE, coerceParam, isObject, resolveBind, safeCssValue } from "./schema.js";

const SIGNAL_RE = /^[a-z][A-Za-z0-9]{0,23}$/;
const ATTR_RE = /^[a-z][a-z0-9-]{0,31}$/;
const CLASS_RE = /^[a-z][a-z0-9-]{0,31}$/;
export const LOGIC_LIMITS = { signals: 32, binds: 48, rules: 24, setPerRule: 16 };

const rankToCost = ["event", "tick", "frame"];

/**
 * Compile hooks.json. Never throws.
 * @param {object|undefined} raw  parsed hooks.json
 * @param {{ modules: object, extraRoots?: string[], catalog?: object }} ctx
 * @returns {{ ok:boolean, logic:object|null, errors:string[], warnings:string[] }}
 */
export function buildLogic(raw, { modules, extraRoots = [], catalog = HOOK_ROOTS }) {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  const logic = { signals: [], binds: [], rules: [], hasFrame: false };
  if (raw === undefined || raw === null) return { ok: true, logic, errors: [], warnings };
  if (!isObject(raw)) return { ok: false, logic: null, errors: ["hooks.json must be a JSON object"], warnings };

  for (const key of Object.keys(raw)) if (!["signals", "bind", "rules", "$schema", "doc"].includes(key)) warn(`hooks.json: unknown field "${key}" — ignored`);

  const roots = hookRootNames(extraRoots);
  const signalCost = new Map(); // name → rank
  const declared = new Set();

  /** Compile one expression; returns { expr, cost } or null (+warning). */
  const compileExpr = (where, src, { allowP = true, allowS = true } = {}) => {
    const allowed = new Set(roots);
    if (!allowP) allowed.delete("p");
    if (!allowS) allowed.delete("s");
    const res = tryCompile(src, { roots: allowed });
    if (!res.ok) return warn(`${where}: ${res.error}`), null;
    const expr = res.expr;
    let rank = 0;
    for (const root of expr.roots) if (catalog[root]) rank = Math.max(rank, costRank[catalog[root].cost] ?? 0);
    for (const path of expr.paths) {
      if (!path.startsWith("s.")) continue;
      const name = path.split(".")[1];
      if (!declared.has(name)) return warn(`${where}: signal "${name}" is not declared before it is used`), null;
      rank = Math.max(rank, signalCost.get(name) ?? 0);
    }
    const bad = unknownHookFields(expr.paths, catalog);
    if (bad.length) warn(`${where}: unknown hook field ${bad.join(", ")}`);
    if (expr.roots.has("p") && !allowP) return null;
    return { expr, cost: rankToCost[rank], rank };
  };

  // signals
  if (raw.signals !== undefined) {
    if (!isObject(raw.signals)) warn('"signals" must be an object { name: "expression" }');
    else {
      const entries = Object.entries(raw.signals);
      if (entries.length > LOGIC_LIMITS.signals) warn(`more than ${LOGIC_LIMITS.signals} signals — extra ignored`);
      for (const [name, src] of entries.slice(0, LOGIC_LIMITS.signals)) {
        if (!SIGNAL_RE.test(name)) {
          warn(`signal "${name}": invalid name (camelCase, ≤ 24 chars)`);
          continue;
        }
        if (typeof src !== "string") {
          warn(`signal "${name}": expression must be a string`);
          continue;
        }
        const c = compileExpr(`signal "${name}"`, src);
        if (!c) continue;
        declared.add(name);
        signalCost.set(name, c.rank);
        logic.signals.push({ name, src, expr: c.expr, cost: c.cost });
      }
    }
  }

  // binds
  if (raw.bind !== undefined) {
    if (!Array.isArray(raw.bind)) warn('"bind" must be an array');
    else {
      if (raw.bind.length > LOGIC_LIMITS.binds) warn(`more than ${LOGIC_LIMITS.binds} bindings — extra ignored`);
      for (const [i, item] of raw.bind.slice(0, LOGIC_LIMITS.binds).entries()) {
        const at = `bind[${i}]`;
        if (!isObject(item) || typeof item.expr !== "string") {
          warn(`${at}: needs "expr" and one of css/attr/class`);
          continue;
        }
        let kind;
        let name;
        if (item.css !== undefined) {
          if (typeof item.css !== "string" || !CSS_VAR_RE.test(item.css)) {
            warn(`${at}.css: must be a --preset-* custom property`);
            continue;
          }
          [kind, name] = ["css", item.css];
        } else if (item.attr !== undefined) {
          if (typeof item.attr !== "string" || !ATTR_RE.test(item.attr) || item.attr === "preset") {
            warn(`${at}.attr: invalid attribute name`);
            continue;
          }
          [kind, name] = ["attr", item.attr];
        } else if (item.class !== undefined) {
          if (typeof item.class !== "string" || !CLASS_RE.test(item.class)) {
            warn(`${at}.class: invalid class name`);
            continue;
          }
          [kind, name] = ["class", item.class];
        } else {
          warn(`${at}: needs one of css / attr / class`);
          continue;
        }
        const c = compileExpr(at, item.expr);
        if (!c) continue;
        logic.binds.push({
          kind,
          name,
          src: item.expr,
          expr: c.expr,
          cost: c.cost,
          unit: typeof item.unit === "string" && /^[a-z%]{0,4}$/.test(item.unit) ? item.unit : "",
          round: Number.isInteger(item.round) ? Math.min(6, Math.max(0, item.round)) : 3,
        });
      }
    }
  }

  // rules
  if (raw.rules !== undefined) {
    if (!Array.isArray(raw.rules)) warn('"rules" must be an array');
    else {
      if (raw.rules.length > LOGIC_LIMITS.rules) warn(`more than ${LOGIC_LIMITS.rules} rules — extra ignored`);
      for (const [i, item] of raw.rules.slice(0, LOGIC_LIMITS.rules).entries()) {
        const at = `rules[${i}]`;
        if (!isObject(item) || typeof item.when !== "string" || !isObject(item.set)) {
          warn(`${at}: needs "when" (expression) and "set" (object of "section.param": value)`);
          continue;
        }
        const c = compileExpr(`${at}.when`, item.when, { allowP: false });
        if (!c) continue;
        const set = {};
        for (const [path, value] of Object.entries(item.set).slice(0, LOGIC_LIMITS.setPerRule)) {
          const bind = resolveBind(path, modules);
          if (!bind || bind.kind === "cssVar") {
            warn(`${at}.set.${path}: not a parameter of this preset's modules.json`);
            continue;
          }
          if (bind.kind === "colorKey") {
            if (typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) set[path] = value;
            else warn(`${at}.set.${path}: expected a hex color`);
            continue;
          }
          const res = coerceParam(bind.spec, value);
          if (!res.ok) {
            warn(`${at}.set.${path}: invalid value ${JSON.stringify(value)}`);
            continue;
          }
          set[path] = res.value;
        }
        if (!Object.keys(set).length) {
          warn(`${at}: nothing valid to set — rule ignored`);
          continue;
        }
        logic.rules.push({ when: item.when, expr: c.expr, set, cost: c.cost });
      }
    }
  }

  logic.hasFrame = [...logic.signals, ...logic.binds].some((x) => x.cost === "frame");
  return { ok: true, logic, errors: [], warnings };
}

/**
 * Stateful runner for a compiled logic. DOM-free: the host builds `scope` (hooks) and applies the outputs.
 *
 *   runner.step(scope, { tick, dt })  → evaluates frame-cost items (always) and all other items when `tick`
 *   runner.signals                    → current `s` object
 *   runner.output                     → { css, attrs, classes: Set<string> } accumulated so far
 *   runner.rules()                    → { key, sets } of the rules that match right now (evaluated on tick)
 */
export function createRunner(logic) {
  const states = new Map();
  const stateOf = (item) => {
    let st = states.get(item);
    if (!st) states.set(item, (st = item.expr.newState()));
    return st;
  };
  const signals = {};
  const output = { css: {}, attrs: {}, classes: new Set() };
  let ruleKey = "";
  let ruleSets = [];

  const fmt = (b, v) => {
    if (typeof v === "boolean") return v ? "1" : "0";
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return null;
      const f = 10 ** b.round;
      return `${Math.round(v * f) / f}${b.unit}`;
    }
    return v == null || v === "" ? null : String(v);
  };

  return {
    signals,
    output,
    step(scope, { tick = true, dt = 1 / 60 } = {}) {
      const sc = { ...scope, s: signals, dt };
      for (const sig of logic.signals) {
        if (sig.cost !== "frame" && !tick) continue;
        try {
          signals[sig.name] = sig.expr.run(sc, stateOf(sig));
        } catch {
          signals[sig.name] = 0;
        }
      }
      for (const b of logic.binds) {
        if (b.cost !== "frame" && !tick) continue;
        let v;
        try {
          v = b.expr.run(sc, stateOf(b));
        } catch {
          continue;
        }
        if (b.kind === "class") {
          if (v) output.classes.add(`x-${b.name}`);
          else output.classes.delete(`x-${b.name}`);
          continue;
        }
        const text = fmt(b, v);
        const target = b.kind === "css" ? output.css : output.attrs;
        const safe = text === null ? null : b.kind === "css" ? safeCssValue(text) : text.slice(0, 80);
        if (safe === null) delete target[b.name];
        else target[b.name] = safe;
      }
      if (tick && logic.rules.length) {
        const matched = [];
        const keys = [];
        logic.rules.forEach((rule, i) => {
          try {
            if (rule.expr.run(sc, stateOf(rule))) {
              matched.push(rule.set);
              keys.push(i);
            }
          } catch {
            /* ignore */
          }
        });
        ruleKey = keys.join(",");
        ruleSets = matched;
      }
    },
    rules: () => ({ key: ruleKey, sets: ruleSets }),
    reset() {
      states.clear();
      for (const k of Object.keys(signals)) delete signals[k];
      output.css = {};
      output.attrs = {};
      output.classes = new Set();
      ruleKey = "";
      ruleSets = [];
    },
  };
}
