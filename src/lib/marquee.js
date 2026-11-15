import { h } from "./dom.js";

/**
 * Chữ chạy (marquee) cho tiêu đề dài.
 *
 * - Chỉ chạy khi chữ thật sự dài hơn khung; ngắn thì đứng yên.
 * - Chạy vòng liền mạch (hai bản chữ nối nhau), dừng một nhịp ở đầu mỗi vòng.
 * - Đo lại khi khung đổi kích thước (kéo cửa sổ, đổi bố cục, đổi cỡ chữ) nhờ ResizeObserver.
 * - Rê chuột vào để dừng, để người dùng đọc nốt.
 */

const GAP = 56; // khoảng trống giữa hai lần lặp (px)
const HOLD = 0.14; // phần đầu mỗi vòng đứng yên (tỉ lệ)
const MIN_OVERFLOW = 2; // dư dưới ngưỡng này thì coi như vừa khung

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

/** Dựng lại ruột phần tử theo việc chữ có tràn hay không. */
function measure(el) {
  const track = el.firstElementChild;
  const first = track?.firstElementChild;
  if (!first) return;
  const box = el.clientWidth;
  if (!box) return; // đang ẩn: ResizeObserver sẽ gọi lại khi hiện

  // đo chiều rộng chữ thật (không tính khoảng trống đã thêm khi đang chạy)
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
  // chữ lớn thì chạy nhanh hơn một chút để không thấy lờ đờ
  const fontPx = parseFloat(getComputedStyle(el).fontSize) || 14;
  const speed = Math.max(36, fontPx * 2.4); // px/giây
  const seconds = Math.max(7, distance / speed / (1 - HOLD));

  el.style.setProperty("--marquee-shift", `-${distance}px`);
  el.style.setProperty("--marquee-time", `${seconds.toFixed(2)}s`);
  if (!el.classList.contains("marquee")) {
    el.classList.add("marquee");
    track.replaceChildren(item(el.dataset.text), item(el.dataset.text, true));
  }
}

/**
 * Đặt chữ cho tiêu đề. `enabled` = false thì chỉ cắt bằng dấu "…".
 * Gọi lặp lại với cùng chữ là rẻ: chỉ dựng lại khi chữ/chế độ đổi.
 */
export function setMarqueeText(el, text, enabled) {
  const mode = String(Boolean(enabled));
  if (el.dataset.text !== text || el.dataset.marquee !== mode) {
    el.dataset.text = text;
    el.dataset.marquee = mode;
    el.title = text; // xem đủ chữ khi rê chuột, kể cả khi bị cắt
    el.classList.remove("marquee");
    el.replaceChildren(h("span", { class: "marquee-track" }, item(text)));
    if (!enabled) {
      observer?.unobserve(el);
      return;
    }
    observer?.observe(el);
    requestAnimationFrame(() => el.isConnected && measure(el));
  } else if (enabled) {
    observer?.observe(el); // observe lặp lại là vô hại
  }
}
