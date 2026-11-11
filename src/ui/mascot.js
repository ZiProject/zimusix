import { h } from "../lib/dom.js";

/** Các trạng thái mascot (ảnh trong public/mascot/). */
export const MASCOT = {
  loading: "/mascot/loading.png", // đang tải / đang tìm
  empty: "/mascot/empty.png", // chưa có nhạc (hàng đợi trống…)
  idle: "/mascot/sleepy.png", // đang chờ người dùng chọn bài
  noResult: "/mascot/noresult.png", // không có kết quả / không có lời
  error: "/mascot/error.png", // lỗi nghiêm trọng, thử lại
  success: "/mascot/success.png", // thành công
  curious: "/mascot/curious.png", // thông tin
  confused: "/mascot/confused.png", // lỗi nhẹ
  angry: "/mascot/angry.png", // phát nhạc bị lỗi
};

export function mascotImg(mood, className = "mascot") {
  return h("img", {
    class: `${className} mascot-${mood}`,
    src: MASCOT[mood] ?? MASCOT.idle,
    alt: "",
    draggable: false,
  });
}

/**
 * Khối trạng thái có mascot: ảnh + tiêu đề (tuỳ chọn) + nội dung + nút (tuỳ chọn).
 * `action` là phần tử nút dựng sẵn bằng h("button", …) nên giữ nguyên kiểu nút của app.
 */
export function mascotState(mood, text, { title, action } = {}) {
  return h(
    "div",
    { class: `empty mascot-state mood-${mood}` },
    mascotImg(mood, "mascot-art"),
    title ? h("div", { class: "mascot-title" }, title) : null,
    h("div", { class: "mascot-text" }, text),
    action ?? null,
  );
}
