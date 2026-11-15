import { playTrack } from "../../features/playback.js";
import { doSearch } from "../../features/search.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { renderMain } from "../main-view.js";
import { mascotState } from "../mascot.js";
import { iconButton, trackCard } from "../shared.js";

export function viewSearch() {
  const input = h("input", {
    type: "search",
    placeholder:
      "Search songs, paste YouTube / SoundCloud / Spotify link or local file path…",
    value: app.query,
    autofocus: true,
    oninput: (e) => (app.query = e.target.value),
    onkeydown: (e) => e.key === "Enter" && doSearch(),
  });
  const sources = [
    ["all", "All"],
    ["youtube", "YouTube"],
    ["soundcloud", "SoundCloud"],
    ["spotify", "Spotify"],
  ];
  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "searchbar" },
      icon("search", 18),
      input,
      h(
        "button",
        { class: "primary", onclick: doSearch, disabled: app.searching },
        app.searching ? "Searching…" : "Search",
      ),
    ),
    h(
      "div",
      { class: "chips" },
      sources.map(([id, label]) =>
        h(
          "button",
          {
            class: `chip ${app.source === id ? "active" : ""}`,
            onclick: () => ((app.source = id), renderMain()),
          },
          label,
        ),
      ),
    ),
    app.results.length
      ? h(
          "div",
          { class: "track-grid" },
          app.results.map((track) =>
            trackCard(track, {
              primary: () => playTrack(track, "now"),
              actions: [
                iconButton("next", "Play next", () => playTrack(track, "next")),
                iconButton("plus", "Add to queue", () => playTrack(track, "end")),
              ],
            }),
          ),
        )
      : searchEmptyState(),
  );
}

/** Empty state for search tab: searching / error / no results / waiting for input. */
function searchEmptyState() {
  const retry = h("button", { onclick: () => doSearch() }, "Retry");
  if (app.searching) return mascotState("loading", "Searching…");
  if (app.searchError)
    return mascotState("error", app.searchError, {
      title: "Error searching music",
      action: retry,
    });
  if (app.searchDone)
    return mascotState(
      "noResult",
      `No results found for “${app.searchedQuery}”. Try a different keyword.`,
      { title: "Not found", action: retry },
    );
  return mascotState(
    "idle",
    "Enter keywords to search songs across plugins, or paste a link / file path.",
  );
}
