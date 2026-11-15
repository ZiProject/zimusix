import { switchView } from "../../features/layout.js";
import { control, playTrack } from "../../features/playback.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";
import { iconButton, trackCard } from "../shared.js";

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
          h("div", { class: "track-grid" }, trackCard(state.currentTrack)),
        )
      : null,
    queue.length
      ? h(
          "div",
          { class: "track-grid" },
          queue.map((track, index) =>
            trackCard(track, {
              index: index + 1,
              primary: () => control("skip", { index }),
              actions: [
                iconButton(
                  "up",
                  "Move earlier",
                  () => index > 0 && control("move", { from: index, to: index - 1 }),
                  "rot-l",
                ),
                iconButton(
                  "down",
                  "Move later",
                  () =>
                    index < queue.length - 1 &&
                    control("move", { from: index, to: index + 1 }),
                  "rot-l",
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
            { class: "track-grid" },
            state.related.slice(0, 6).map((track) =>
              trackCard(track, {
                primary: () => playTrack(track, "now"),
                actions: [
                  iconButton("plus", "Add to queue", () => playTrack(track, "end")),
                ],
              }),
            ),
          ),
        )
      : null,
  );
}
