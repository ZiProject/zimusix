import { h } from "../../lib/dom.js";
import { cfg } from "../../presets/runtime.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";
import { setMarqueeText, trackCover, trackSubParts } from "../shared.js";
import { lyricsBody } from "./lyrics.js";

/**
 * Khu "Đang phát": nơi preset bày ảnh bìa lớn + thông tin bài hát + visualizer + lyrics.
 * Mỗi thành phần do preset quyết định có hiện không và hiện thế nào (xem docs/PRESETS.md).
 */
export function viewNowPlaying() {
  const track = app.state?.currentTrack;
  if (!track) {
    return h(
      "section",
      { class: "view np-stage" },
      mascotState("idle", "Chưa phát bài nào. Hãy tìm nhạc hoặc thêm file local.", {
        title: "Đang phát",
      }),
    );
  }

  const { artwork, info, visualizer, lyrics } = cfg();
  const main = h("div", { class: "stage-main" });

  if (artwork.style !== "none")
    main.append(
      h("div", { class: "stage-cover" }, trackCover(track, artwork.stageSize)),
    );

  const title = h("div", { class: "stage-title" });
  setMarqueeText(title, track.title, info.marquee);
  title.hidden = !info.show.includes("title");
  main.append(
    h("div", { class: "stage-info" }, title, h("div", { class: "stage-sub" }, ...trackSubParts(track))),
  );

  if (visualizer.type !== "none" && visualizer.placement.includes("stage"))
    main.append(h("canvas", { class: "stage-viz" }));

  const section = h("section", { class: "view np-stage" }, main);
  if (lyrics.placement === "stage")
    section.append(h("div", { class: "stage-lyrics" }, lyricsBody({ embedded: true })));
  return section;
}
