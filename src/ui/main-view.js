import { toggleContent, toggleSidebar } from "../features/layout.js";
import { toggleFullscreen } from "../features/window.js";
import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, refs } from "../state.js";
import { renderBgPanel } from "./bg-panel.js";
import { viewDiscord } from "./views/discord.js";
import { viewLibrary } from "./views/library.js";
import { viewLyrics } from "./views/lyrics.js";
import { viewQueue } from "./views/queue.js";
import { viewRelated } from "./views/related.js";
import { viewSearch } from "./views/search.js";

export function renderMain() {
  const views = {
    search: viewSearch,
    library: viewLibrary,
    queue: viewQueue,
    related: viewRelated,
    lyrics: viewLyrics,
    discord: viewDiscord,
  };
  // giữ focus & vị trí con trỏ của ô tìm kiếm khi re-render
  const hadFocus = document.activeElement?.matches?.('input[type="search"]');
  // Không truyền null vào replaceChildren: DOM sẽ biến nó thành chữ "null" trên màn hình.
  refs.main.replaceChildren(
    ...[renderToolbar(), app.contentHidden ? null : views[app.view]()].filter(
      Boolean,
    ),
  );
  if (hadFocus) refs.main.querySelector('input[type="search"]')?.focus();
}

/** Thanh công cụ phía trên: thanh bên | tuỳ chỉnh nền, toàn màn hình, ẩn/hiện nội dung. */
function renderToolbar() {
  return h(
    "div",
    { class: "main-toolbar" },
    h("div", { class: "toolbar-group" }, h(
      "button",
      {
        class: "icon-btn",
        title: app.sidebarHidden ? "Hiện thanh bên" : "Ẩn thanh bên",
        "aria-label": app.sidebarHidden ? "Hiện thanh bên" : "Ẩn thanh bên",
        onclick: () => toggleSidebar(),
      },
      icon("sidebar", 18),
    )),
    h(
      "div",
      { class: "toolbar-group" },
    h(
      "div",
      { class: "bg-control" },
      h(
        "button",
        {
          class: `icon-btn ${app.bgPanelOpen ? "on" : ""}`,
          title: "Tuỳ chỉnh hình nền (độ mờ, độ đậm…)",
          "aria-label": "Tuỳ chỉnh hình nền",
          onclick: () => {
            app.bgPanelOpen = !app.bgPanelOpen;
            renderMain();
          },
        },
        icon("sliders", 18),
      ),
      app.bgPanelOpen ? renderBgPanel() : null,
    ),
    h(
      "button",
      {
        class: "icon-btn",
        title: "Bật / tắt toàn màn hình (F11)",
        "aria-label": "Bật / tắt toàn màn hình",
        onclick: () => toggleFullscreen(),
      },
      icon("fullscreen", 18),
    ),
    h(
      "button",
      {
        class: `icon-btn ${app.contentHidden ? "on" : ""}`,
        title: app.contentHidden ? "Hiện nội dung (H)" : "Ẩn nội dung để xem nền (H)",
        "aria-label": app.contentHidden ? "Hiện nội dung" : "Ẩn nội dung",
        onclick: () => toggleContent(),
      },
      icon(app.contentHidden ? "eyeOff" : "eye", 18),
    ),
    ),
  );
}
