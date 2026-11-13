import "./styles/index.css";
import "./events.js";
import * as api from "./api.js";
import { syncAudio } from "./features/audio.js";
import { updateVideoBg } from "./features/background.js";
import { loadDiscord } from "./features/discord.js";
import { setupDragDrop } from "./features/files.js";
import { initMediaSession } from "./features/media-session.js";
import { watch } from "./features/playback.js";
import { h } from "./lib/dom.js";
import { setupTray } from "./features/window.js";
import { toast } from "./lib/toast.js";
import { app, refs, root } from "./state.js";
import { renderMain } from "./ui/main-view.js";
import { mascotImg } from "./ui/mascot.js";
import { buildPlayer } from "./ui/player.js";
import { renderSidebar } from "./ui/sidebar.js";
import { drawViz } from "./ui/visualizer.js";

function showFatal(message) {
  root.replaceChildren(
    h(
      "div",
      { class: "fatal" },
      mascotImg("error", "fatal-mascot"),
      h("h1", { class: "brand-name" }, "Zimusix"),
      h("p", null, message),
      h(
        "button",
        { class: "primary", onclick: () => location.reload() },
        "Thử lại",
      ),
    ),
  );
}

/** FFmpeg thiếu thì phần lớn nguồn (file local, seek, filter) sẽ không phát được: báo rõ ngay từ đầu. */
async function checkFfmpeg(health) {
  if (health?.ffmpeg?.ok !== false) return;
  // sidecar có thể đang tự tải binary: kiểm tra lại sau một lúc rồi mới báo
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  const now = await api.get("/health").catch(() => null);
  if (now?.ffmpeg?.ok === false) {
    toast(
      `${now.ffmpeg.error}\nHãy cài FFmpeg vào PATH, hoặc đặt biến môi trường FFMPEG_PATH, rồi mở lại app.`,
      "error",
      30_000,
      "error",
    );
  }
}

async function boot() {
  let health = null;
  root.replaceChildren(
    h(
      "div",
      { class: "fatal" },
      mascotImg("loading", "fatal-mascot"),
      h("h1", { class: "brand-name" }, "Zimusix"),
      h("p", { id: "boot-msg" }, "Đang khởi động bộ phát nhạc…"),
    ),
  );
  try {
    health = await api.initBackend((attempt) => {
      if (attempt === 6)
        document
          .getElementById("boot-msg")
          ?.replaceChildren(
            "Đang chờ backend ZiPlayer… (lần đầu có thể lâu hơn)",
          );
    });
  } catch (error) {
    showFatal(error.message || String(error));
    return;
  }

  refs.sidebar = h("aside", { class: "sidebar" });
  refs.main = h("main", { class: "main" });
  refs.player = h("footer", { class: "player" });
  root.replaceChildren(refs.sidebar, refs.main, refs.player);
  root.classList.toggle("sidebar-hidden", app.sidebarHidden);
  root.classList.toggle("content-hidden", app.contentHidden);

  initMediaSession();
  setupTray();
  buildPlayer();
  renderSidebar();
  renderMain();
  updateVideoBg();
  watch();
  drawViz();
  syncAudio();
  setupDragDrop().catch((error) => console.warn("drag-drop:", error));

  checkFfmpeg(health);
  await loadDiscord();
  // Bot tự đăng nhập bằng token đã lưu: poll đến khi xong.
  for (let i = 0; i < 20 && app.discord.status === "connecting"; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await loadDiscord();
  }
}

boot();
