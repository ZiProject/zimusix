import * as api from "../api.js";
import { setTarget } from "./playback.js";
import { act, toast } from "../lib/toast.js";
import { app } from "../state.js";
import { renderMain } from "../ui/main-view.js";
import { renderSidebar } from "../ui/sidebar.js";

export async function loadDiscord() {
  try {
    app.discord = await api.get("/discord/status");
  } catch {}
  if (app.discord.status === "ready") await loadGuilds();
  renderSidebar();
  if (app.view === "discord") renderMain();
}

async function loadGuilds() {
  try {
    const { guilds } = await api.get("/discord/guilds");
    app.guilds = guilds;
    const states = await Promise.all(
      guilds.map((g) => api.get(`/state?target=${g.id}`).catch(() => null)),
    );
    states.forEach(
      (s, i) => {
        app.voiceByGuild[guilds[i].id] = s?.voice ?? undefined;
        if (s) app.stateByTarget[guilds[i].id] = s;
      },
    );
  } catch (error) {
    app.guilds = [];
    toast(error.message, "error");
  }
}

export async function discordLogin(token) {
  const status = await act(
    () => api.post("/discord/login", { token, remember: true }),
    "Bot Discord đã đăng nhập",
  );
  if (status) app.discord.error = null;
  await loadDiscord();
}

export async function discordLogout() {
  await act(
    () => api.post("/discord/logout", { forget: true }),
    "Đã đăng xuất bot",
  );
  app.guilds = [];
  app.voiceByGuild = {};
  if (app.target !== "local") await setTarget("local");
  await loadDiscord();
}

export async function discordJoin(guildId, channelId) {
  const state = await act(
    () => api.post("/discord/join", { guildId, channelId }),
    "Bot đã vào kênh thoại",
  );
  if (!state) return;
  app.voiceByGuild[guildId] = state.voice ?? undefined;
  await setTarget(guildId);
  if (app.view === "discord") renderMain();
}

export async function discordLeave(guildId) {
  await act(
    () => api.post("/discord/leave", { guildId }),
    "Bot đã rời kênh thoại",
  );
  app.voiceByGuild[guildId] = undefined;
  if (app.target === guildId) await setTarget("local");
  renderSidebar();
  if (app.view === "discord") renderMain();
}

export function joinedTargets() {
  return app.guilds
    .filter((g) => app.voiceByGuild[g.id])
    .map((g) => ({
      id: g.id,
      name: g.name,
      channel: app.voiceByGuild[g.id].channelName,
    }));
}
