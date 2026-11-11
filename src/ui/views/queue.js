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
      h("h2", null, "Hàng đợi"),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          { onclick: () => control("shuffle"), disabled: queue.length < 2 },
          "Trộn",
        ),
        h(
          "button",
          { onclick: () => control("clear"), disabled: !queue.length },
          "Xoá hết",
        ),
      ),
    ),
    state?.currentTrack
      ? h(
          "div",
          { class: "now-playing-card" },
          h("small", null, "Đang phát"),
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
                  "Phát bài này",
                  () => control("skip", { index }),
                  "accent",
                ),
                iconButton(
                  "up",
                  "Lên",
                  () =>
                    index > 0 &&
                    control("move", { from: index, to: index - 1 }),
                ),
                iconButton(
                  "down",
                  "Xuống",
                  () =>
                    index < queue.length - 1 &&
                    control("move", { from: index, to: index + 1 }),
                ),
                iconButton("x", "Xoá", () => control("remove", { index })),
              ],
            }),
          ),
        )
      : mascotState("empty", "Hàng đợi trống. Hãy thêm vài bài nhạc nhé!", {
          title: "Chưa có nhạc",
          action: h(
            "button",
            { class: "primary", onclick: () => switchView("search") },
            "Thêm nhạc",
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
            "Gợi ý tiếp theo (Related Tracks)",
          ),
          h(
            "div",
            { class: "list" },
            state.related.slice(0, 5).map((track) =>
              trackRow(track, {
                actions: [
                  iconButton(
                    "play",
                    "Phát ngay",
                    () => playTrack(track, "now"),
                    "accent",
                  ),
                  iconButton("plus", "Thêm vào hàng đợi", () =>
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
