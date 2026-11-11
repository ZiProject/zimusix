import { loadLyrics } from "./lyrics.js";
import { writeFlag } from "../lib/storage.js";
import { CONTENT_HIDDEN_KEY, app, root } from "../state.js";
import { renderMain } from "../ui/main-view.js";
import { renderSidebar } from "../ui/sidebar.js";

export function switchView(view) {
  app.view = view;
  renderSidebar();
  renderMain();
  if (view === "lyrics") loadLyrics();
}

export function toggleSidebar() {
  app.sidebarHidden = !app.sidebarHidden;
  root.classList.toggle("sidebar-hidden", app.sidebarHidden);
  renderMain();
}

/** Ẩn/hiện nội dung các tab (tìm kiếm, file, hàng đợi…) để thấy trọn nền. Thanh công cụ vẫn còn. */
export function toggleContent(force) {
  app.contentHidden = force ?? !app.contentHidden;
  if (app.contentHidden) app.bgPanelOpen = false;
  writeFlag(CONTENT_HIDDEN_KEY, app.contentHidden);
  root.classList.toggle("content-hidden", app.contentHidden);
  renderMain();
}
