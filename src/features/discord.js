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
  try {
    app.rpc = await api.get("/discord/rpc");
  } catch {}
  if (app.discord.status === "ready") await loadGuilds();
  renderSidebar();
  if (app.view === "discord") renderMain();
}

export async function loadRpc() {
  try {
    app.rpc = await api.get("/discord/rpc");
    if (app.view === "discord") renderMain();
  } catch {}
}

export async function updateRpc(options) {
  try {
    app.rpc = await api.post("/discord/rpc", options);
    toast("Rich Presence updated", "ok");
    if (app.view === "discord") renderMain();
  } catch (error) {
    toast(error.message, "error");
  }
}

async function loadGuilds() {
  try {
    const { guilds } = await api.get("/discord/guilds");
    app.guilds = guilds;
    const states = await Promise.all(
      guilds.map((g) => api.get(`/state?target=${g.id}`).catch(() => null)),
    );
    states.forEach((s, i) => {
      app.voiceByGuild[guilds[i].id] = s?.voice ?? undefined;
      if (s) app.stateByTarget[guilds[i].id] = s;
    });
  } catch (error) {
    app.guilds = [];
    toast(error.message, "error");
  }
}

export async function discordLogin(token) {
  const status = await act(
    () => api.post("/discord/login", { token, remember: true }),
    "Discord bot logged in",
  );
  if (status) app.discord.error = null;
  await loadDiscord();
}

export async function discordLogout() {
  await act(
    () => api.post("/discord/logout", { forget: true }),
    "Bot logged out",
  );
  app.guilds = [];
  app.voiceByGuild = {};
  if (app.target !== "local") await setTarget("local");
  await loadDiscord();
}

export async function discordJoin(guildId, channelId) {
  const state = await act(
    () => api.post("/discord/join", { guildId, channelId }),
    "Bot joined voice channel",
  );
  if (!state) return;
  app.voiceByGuild[guildId] = state.voice ?? undefined;
  await setTarget(guildId);
  if (app.view === "discord") renderMain();
}

export async function discordLeave(guildId) {
  await act(
    () => api.post("/discord/leave", { guildId }),
    "Bot left voice channel",
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
