import { mascotImg } from "../ui/mascot.js";
import { h } from "./dom.js";

const TOAST_MOOD = { ok: "success", error: "confused", info: "curious" };

/** `mood` (tuỳ chọn) ghi đè mascot mặc định theo loại thông báo. */
export function toast(message, kind = "info", duration, mood) {
  let box = document.querySelector(".toasts");
  if (!box) box = document.body.appendChild(h("div", { class: "toasts" }));
  const el = h(
    "div",
    { class: `toast ${kind}` },
    mascotImg(mood ?? TOAST_MOOD[kind] ?? "curious", "toast-mascot"),
    h("div", { class: "toast-text" }, message),
  );
  box.append(el);
  setTimeout(() => el.remove(), duration ?? (kind === "error" ? 6000 : 3000));
}

export async function act(fn, okMessage) {
  try {
    const result = await fn();
    if (okMessage)
      toast(
        typeof okMessage === "function" ? okMessage(result) : okMessage,
        "ok",
      );
    return result;
  } catch (error) {
    toast(error.message || String(error), "error");
    return null;
  }
}
