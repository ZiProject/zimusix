import { toggleContent } from "./features/layout.js";
import { toggleFullscreen } from "./features/window.js";
import { app } from "./state.js";
import { renderMain } from "./ui/main-view.js";
import { onPlayPause } from "./ui/player.js";

document.addEventListener("keydown", (event) => {
  // F11: bật/tắt toàn màn hình (webview không tự xử lý phím này)
  if (event.key === "F11") {
    event.preventDefault();
    toggleFullscreen();
    return;
  }
  // H: ẩn/hiện nội dung các tab để xem nền (không khi đang gõ chữ)
  if (
    event.key.toLowerCase() === "h" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.target.matches?.("input, textarea, select, [contenteditable]")
  ) {
    event.preventDefault();
    toggleContent();
    return;
  }
  if (
    event.code === "Space" &&
    !event.target.matches?.("input, textarea, button")
  ) {
    event.preventDefault();
    onPlayPause();
  }
});

document.addEventListener("contextmenu", (event) => event.preventDefault());

document.addEventListener("click", (event) => {
  if (app.bgPanelOpen && !event.target.closest(".bg-control")) {
    app.bgPanelOpen = false;
    renderMain();
  }
});
