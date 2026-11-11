import { playTrack } from "../../features/playback.js";
import { doSearch } from "../../features/search.js";
import { h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { renderMain } from "../main-view.js";
import { mascotState } from "../mascot.js";
import { iconButton, trackRow } from "../shared.js";

export function viewSearch() {
  const input = h("input", {
    type: "search",
    placeholder:
      "Tìm bài hát, dán link YouTube / SoundCloud / Spotify hoặc đường dẫn file…",
    value: app.query,
    autofocus: true,
    oninput: (e) => (app.query = e.target.value),
    onkeydown: (e) => e.key === "Enter" && doSearch(),
  });
  const sources = [
    ["all", "Tất cả"],
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
        app.searching ? "Đang tìm…" : "Tìm",
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
          { class: "list" },
          app.results.map((track) =>
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
      : searchEmptyState(),
  );
}

/** Trạng thái trống của tab tìm kiếm: đang tìm / lỗi / không có kết quả / chờ nhập. */
function searchEmptyState() {
  const retry = h("button", { onclick: () => doSearch() }, "Thử lại");
  if (app.searching) return mascotState("loading", "Đang tìm kiếm…");
  if (app.searchError)
    return mascotState("error", app.searchError, {
      title: "Có lỗi khi tìm nhạc",
      action: retry,
    });
  if (app.searchDone)
    return mascotState(
      "noResult",
      `Không có kết quả cho “${app.searchedQuery}”. Hãy thử từ khoá khác.`,
      { title: "Không tìm thấy", action: retry },
    );
  return mascotState(
    "idle",
    "Nhập từ khoá để tìm nhạc từ các plugin, hoặc dán link / đường dẫn file.",
  );
}
