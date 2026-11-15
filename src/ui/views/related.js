import { playTrack } from "../../features/playback.js";
import { enqueueRelatedAll, refreshRelated } from "../../features/related.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";
import { iconButton, trackCard } from "../shared.js";

export function viewRelated() {
  const state = app.state;
  const related = state?.related ?? [];
  const current = state?.currentTrack;

  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "view-head" },
      h(
        "div",
        null,
        h("h2", null, "Recommended (Related Tracks)"),
        h(
          "p",
          { class: "muted" },
          current
            ? `Auto recommendations for: ${current.title}`
            : "Automatically suggests similar tracks",
        ),
      ),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          { onclick: refreshRelated, title: "Refresh related recommendations" },
          icon("refresh", 16),
          " Refresh",
        ),
        related.length
          ? h(
              "button",
              { class: "primary", onclick: () => enqueueRelatedAll(related) },
              "Play all",
            )
          : null,
      ),
    ),
    related.length
      ? h(
          "div",
          { class: "track-grid" },
          related.map((track) =>
            trackCard(track, {
              primary: () => playTrack(track, "now"),
              actions: [
                iconButton("next", "Play next", () => playTrack(track, "next")),
                iconButton("plus", "Add to queue", () => playTrack(track, "end")),
              ],
            }),
          ),
        )
      : current
        ? mascotState(
            "loading",
            "Loading related tracks... Click 'Refresh' to find more.",
          )
        : mascotState(
            "idle",
            "No track currently playing. Play a track to receive suggestions.",
          ),
  );
}
