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
  target: "local", // "local" or guildId
  state: null,
  view: "search",
  source: "all",
  query: "",
  results: [],
  searchDone: false, // completed at least one search
  searchedQuery: "",
  searchError: null,
  searching: false,
  listen: true, // play audio in app
  addMode: "end", // end | now (when adding local files)
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
  videoBg: true, // video background via player.saveVideo
  bgPanelOpen: false,
  bg: loadBgSettings(),
  sidebarHidden: false,
  contentHidden: readFlag(CONTENT_HIDDEN_KEY), // hide tab content to reveal background
  lyrics: null, // synchronized lyrics
  lyricsLoading: false,
  wiringOpen: false,
  webAudioSourceTarget: "local",
};

export const root = document.getElementById("app");

export const refs = {};
