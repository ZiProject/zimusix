import { playTrack } from "../../features/playback.js";
import { enqueueRelatedAll, refreshRelated } from "../../features/related.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";
import { iconButton, trackRow } from "../shared.js";

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
        h("h2", null, "Gợi ý liên quan (Related Tracks)"),
        h(
          "p",
          { class: "muted" },
          current
            ? `Gợi ý tự động cho bài: ${current.title}`
            : "Tự động gợi ý các bài hát tương tự",
        ),
      ),
      h(
        "div",
        { class: "button-row" },
        h(
          "button",
          { onclick: refreshRelated, title: "Làm mới gợi ý bài liên quan" },
          icon("refresh", 16),
          " Làm mới",
        ),
        related.length
          ? h(
              "button",
              { class: "primary", onclick: () => enqueueRelatedAll(related) },
              "Phát tất cả",
            )
          : null,
      ),
    ),
    related.length
      ? h(
          "div",
          { class: "list" },
          related.map((track) =>
            trackRow(track, {
              actions: [
                iconButton(
                  "play",
                  "Phát ngay",
                  () => playTrack(track, "now"),
                  "accent",
                ),
                iconButton("next", "Phát tiếp theo", () =>
                  playTrack(track, "next"),
                ),
                iconButton("plus", "Thêm vào hàng đợi", () =>
                  playTrack(track, "end"),
                ),
              ],
            }),
          ),
        )
      : current
        ? mascotState(
            "loading",
            "Đang tải bài hát liên quan... Bấm 'Làm mới' nếu cần tìm thêm.",
          )
        : mascotState(
            "idle",
            "Chưa có bài nào đang phát. Hãy phát một bài nhạc để nhận gợi ý.",
          ),
  );
}
