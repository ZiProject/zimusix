import { toggleContent, toggleSidebar } from "../features/layout.js";
import { toggleFullscreen } from "../features/window.js";
import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, refs } from "../state.js";
import { renderBgPanel } from "./bg-panel.js";
import { viewDiscord } from "./views/discord.js";
import { viewLibrary } from "./views/library.js";
import { viewLyrics } from "./views/lyrics.js";
import { viewNowPlaying } from "./views/nowplaying.js";
import { viewPresets } from "./views/presets.js";
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
    nowplaying: viewNowPlaying,
    presets: viewPresets,
    discord: viewDiscord,
  };
  // preserve search input focus & cursor position across re-renders
  const hadFocus = document.activeElement?.matches?.('input[type="search"]');
  // Never pass null to replaceChildren: DOM will convert it to string "null".
  refs.main.replaceChildren(
    ...[renderToolbar(), app.contentHidden ? null : views[app.view]()].filter(
      Boolean,
    ),
  );
  if (hadFocus) refs.main.querySelector('input[type="search"]')?.focus();
}

/** Top toolbar: sidebar toggle | background settings, fullscreen, toggle content. */
function renderToolbar() {
  return h(
    "div",
    { class: "main-toolbar" },
    h("div", { class: "toolbar-group" }, h(
      "button",
      {
        class: "icon-btn",
        title: app.sidebarHidden ? "Show sidebar" : "Hide sidebar",
        "aria-label": app.sidebarHidden ? "Show sidebar" : "Hide sidebar",
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
          title: "Background settings (blur, opacity…)",
          "aria-label": "Background settings",
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
        title: "Toggle fullscreen (F11)",
        "aria-label": "Toggle fullscreen",
        onclick: () => toggleFullscreen(),
      },
      icon("fullscreen", 18),
    ),
    h(
      "button",
      {
        class: `icon-btn ${app.contentHidden ? "on" : ""}`,
        title: app.contentHidden ? "Show content (H)" : "Hide content to view background (H)",
        "aria-label": app.contentHidden ? "Show content" : "Hide content",
        onclick: () => toggleContent(),
      },
      icon(app.contentHidden ? "eyeOff" : "eye", 18),
    ),
    ),
  );
}
