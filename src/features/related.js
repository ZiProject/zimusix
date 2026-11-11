import * as api from "../api.js";
import { act, toast } from "../lib/toast.js";
import { app } from "../state.js";
import { renderMain } from "../ui/main-view.js";

export async function refreshRelated() {
  const res = await act(
    () => api.post("/related/refresh", { target: app.target }),
    "Đã làm mới danh sách gợi ý",
  );
  if (res?.tracks) {
    if (app.state) app.state.related = res.tracks;
    renderMain();
  }
}

export async function enqueueRelatedAll(tracks) {
  if (!tracks?.length) return;
  for (const t of tracks) {
    await api.post("/play", {
      target: app.target,
      trackKey: t.key,
      mode: "end",
    });
  }
  toast(`Đã thêm ${tracks.length} bài gợi ý vào hàng đợi`, "ok");
  renderMain();
}
