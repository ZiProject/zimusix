import { switchView } from "../../features/layout.js";
import { control, playTrack } from "../../features/playback.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";
import { iconButton, trackRow } from "../shared.js";

export function viewQueue() {
  const state = app.state;
  const queue = state?.queue ?? [];
  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "view-head" },
      h("h2", null, "Queue"),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          { onclick: () => control("shuffle"), disabled: queue.length < 2 },
          "Shuffle",
        ),
        h(
          "button",
          { onclick: () => control("clear"), disabled: !queue.length },
          "Clear all",
        ),
      ),
    ),
    state?.currentTrack
      ? h(
          "div",
          { class: "now-playing-card" },
          h("small", null, "Now Playing"),
          trackRow(state.currentTrack, { actions: [] }),
        )
      : null,
    queue.length
      ? h(
          "div",
          { class: "list" },
          queue.map((track, index) =>
            trackRow(track, {
              actions: [
                iconButton(
                  "play",
                  "Play this track",
                  () => control("skip", { index }),
                  "accent",
                ),
                iconButton(
                  "up",
                  "Move up",
                  () =>
                    index > 0 &&
                    control("move", { from: index, to: index - 1 }),
                ),
                iconButton(
                  "down",
                  "Move down",
                  () =>
                    index < queue.length - 1 &&
                    control("move", { from: index, to: index + 1 }),
                ),
                iconButton("x", "Remove", () => control("remove", { index })),
              ],
            }),
          ),
        )
      : mascotState("empty", "Queue is empty. Add some tracks to get started!", {
          title: "No music",
          action: h(
            "button",
            { class: "primary", onclick: () => switchView("search") },
            "Add music",
          ),
        }),
    state?.related?.length
      ? h(
          "div",
          { class: "related-section" },
          h(
            "div",
            { class: "related-title" },
            icon("sparkles", 16),
            "Recommended Next (Related Tracks)",
          ),
          h(
            "div",
            { class: "list" },
            state.related.slice(0, 5).map((track) =>
              trackRow(track, {
                actions: [
                  iconButton(
                    "play",
                    "Play now",
                    () => playTrack(track, "now"),
                    "accent",
                  ),
                  iconButton("plus", "Add to queue", () =>
                    playTrack(track, "end"),
                  ),
                ],
              }),
            ),
          ),
        )
      : null,
  );
}
