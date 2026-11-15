import { loadLyrics } from "./lyrics.js";
import { writeFlag } from "../lib/storage.js";
import { CONTENT_HIDDEN_KEY, app, root } from "../state.js";
import { renderMain } from "../ui/main-view.js";
import { renderSidebar } from "../ui/sidebar.js";

export function switchView(view) {
  // If content is hidden and user switches tabs (Search, Queue...), unhide content so they can see it.
  if (app.contentHidden) toggleContent(false, { render: false });
  app.view = view;
  renderSidebar();
  renderMain();
  if (view === "lyrics" || view === "nowplaying") loadLyrics();
}

export function toggleSidebar() {
  app.sidebarHidden = !app.sidebarHidden;
  root.classList.toggle("sidebar-hidden", app.sidebarHidden);
  renderMain();
}

/** Toggle tab content (search, files, queue...) to reveal background. Toolbar stays visible. */
export function toggleContent(force, { render = true } = {}) {
  app.contentHidden = force ?? !app.contentHidden;
  if (app.contentHidden) app.bgPanelOpen = false;
  writeFlag(CONTENT_HIDDEN_KEY, app.contentHidden);
  root.classList.toggle("content-hidden", app.contentHidden);
  if (render) renderMain();
}
