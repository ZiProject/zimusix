import * as api from "../api.js";
import { app } from "../state.js";
import { renderMain } from "../ui/main-view.js";

let searchSeq = 0;

export async function doSearch() {
  const query = app.query.trim();
  if (!query) return;
  const seq = ++searchSeq;
  app.searching = true;
  app.searchError = null;
  app.searchedQuery = query;
  renderMain();
  try {
    const { tracks } = await api.post("/search", { query, source: app.source });
    if (seq !== searchSeq) return;
    app.results = tracks;
    app.searchDone = true;
  } catch (error) {
    if (seq !== searchSeq) return;
    app.results = [];
    app.searchDone = true;
    app.searchError = error.message || String(error);
  } finally {
    if (seq === searchSeq) {
      app.searching = false;
      renderMain();
    }
  }
}
