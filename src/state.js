import { BG_DEFAULTS } from "./lib/constants.js";
import { readFlag } from "./lib/storage.js";

export const CONTENT_HIDDEN_KEY = "zimusix-content-hidden";

function loadBgSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("zimusix-bg") || "{}");
    return { ...BG_DEFAULTS, ...saved };
  } catch {
    return { ...BG_DEFAULTS };
  }
}

export const app = {
  target: "local", // "local" hoặc guildId
  state: null,
  view: "search",
  source: "all",
  query: "",
  results: [],
  searchDone: false, // đã có ít nhất một lần tìm xong
  searchedQuery: "",
  searchError: null,
  searching: false,
  listen: true, // nghe âm thanh ngay trong app
  addMode: "end", // end | now (khi thêm file local)
  discord: {
    status: "logged-out",
    user: null,
    hasSavedToken: false,
    error: null,
  },
  guilds: [],
  voiceByGuild: {}, // guildId -> {channelId, channelName}
  stateByTarget: {},
  dragging: false,
  receivedAt: 0,
  videoBg: true, // video background bằng player.saveVideo
  bgPanelOpen: false,
  bg: loadBgSettings(),
  sidebarHidden: false,
  contentHidden: readFlag(CONTENT_HIDDEN_KEY), // ẩn nội dung các tab để lộ ảnh/video nền
  lyrics: null, // lời bài hát đồng bộ
  lyricsLoading: false,
  wiringOpen: false,
  webAudioSourceTarget: "local",
};

export const root = document.getElementById("app");

export const refs = {};
