import { h } from "./dom.js";

/**
 * Marquee text scroll for long titles.
 *
 * - Only runs when text is strictly longer than container; static when shorter.
 * - Smooth infinite loop (two duplicate text nodes), pausing at the beginning of each cycle.
 * - Re-measures when container resizes (window resize, layout shift, font size change) via ResizeObserver.
 * - Hover mouse to pause, allowing users to finish reading.
 */

const GAP = 56; // gap between loops (px)
const HOLD = 0.14; // initial pause ratio per loop
const MIN_OVERFLOW = 2; // overflow below threshold is considered fitting

const observer =
  typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver((entries) => {
        for (const { target } of entries) {
          if (!target.isConnected) observer.unobserve(target);
          else measure(target);
        }
      });

function item(text, hidden = false) {
  return h("span", { class: "marquee-item", "aria-hidden": hidden ? "true" : null }, text);
}

/** Rebuild container contents based on whether text overflows. */
function measure(el) {
  const track = el.firstElementChild;
  const first = track?.firstElementChild;
  if (!first) return;
  const box = el.clientWidth;
  if (!box) return; // hidden: ResizeObserver will re-trigger on display

  // Measure true text width (ignoring gap added while running)
  const textWidth = first.getBoundingClientRect().width - (el.classList.contains("marquee") ? GAP : 0);
  const overflow = textWidth - box;

  if (overflow <= MIN_OVERFLOW) {
    if (el.classList.contains("marquee")) {
      el.classList.remove("marquee");
      track.replaceChildren(item(el.dataset.text));
    }
    return;
  }

  const distance = textWidth + GAP;
  // Larger font scrolls slightly faster
  const fontPx = parseFloat(getComputedStyle(el).fontSize) || 14;
  const speed = Math.max(36, fontPx * 2.4); // px/sec
  const seconds = Math.max(7, distance / speed / (1 - HOLD));

  el.style.setProperty("--marquee-shift", `-${distance}px`);
  el.style.setProperty("--marquee-time", `${seconds.toFixed(2)}s`);
  if (!el.classList.contains("marquee")) {
    el.classList.add("marquee");
    track.replaceChildren(item(el.dataset.text), item(el.dataset.text, true));
  }
}

/**
 * Set marquee text for title. `enabled` = false falls back to ellipsis.
 * Calling repeatedly with same text is cheap: only re-renders when text/mode changes.
 */
export function setMarqueeText(el, text, enabled) {
  const mode = String(Boolean(enabled));
  if (el.dataset.text !== text || el.dataset.marquee !== mode) {
    el.dataset.text = text;
    el.dataset.marquee = mode;
    el.title = text; // view full title on hover, even when clipped
    el.classList.remove("marquee");
    el.replaceChildren(h("span", { class: "marquee-track" }, item(text)));
    if (!enabled) {
      observer?.unobserve(el);
      return;
    }
    observer?.observe(el);
    requestAnimationFrame(() => el.isConnected && measure(el));
  } else if (enabled) {
    observer?.observe(el); // observing repeatedly is idempotent
  }
}
