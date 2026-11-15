import { discordJoin, discordLeave, discordLogin, discordLogout, loadDiscord } from "../../features/discord.js";
import { h } from "../../lib/dom.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";

export function viewDiscord() {
  const d = app.discord;
  if (d.status !== "ready") {
    const tokenInput = h("input", {
      type: "password",
      placeholder: d.hasSavedToken
        ? "Use saved token (leave empty)"
        : "Paste Discord bot token",
      autocomplete: "off",
    });
    return h(
      "section",
      { class: "view" },
      h("h2", null, "Discord Bot"),
      h(
        "p",
        { class: "muted" },
        "Zimusix runs your bot to stream music into voice channels. Token is stored locally on this machine.",
      ),
      d.error ? h("p", { class: "error-text" }, d.error) : null,
      h(
        "div",
        { class: "form-row" },
        tokenInput,
        h(
          "button",
          {
            class: "primary",
            disabled: d.status === "connecting",
            onclick: () => discordLogin(tokenInput.value.trim()),
          },
          d.status === "connecting" ? "Logging in…" : "Log in",
        ),
      ),
      h(
        "ol",
        { class: "help" },
        h(
          "li",
          null,
          "Create an application + bot in the Discord Developer Portal, then copy the Bot Token.",
        ),
        h(
          "li",
          null,
          "Invite the bot to your server using the OAuth2 URL with the ",
          h("code", null, "bot"),
          " scope and Connect + Speak + View Channels permissions.",
        ),
        h(
          "li",
          null,
          "Return here, log in, and select a voice channel for the bot to join.",
        ),
      ),
    );
  }
  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "view-head" },
      h("h2", null, "Discord"),
      h(
        "div",
        { class: "button-row" },
        h("button", { onclick: loadDiscord }, "Refresh"),
        h(
          "button",
          { class: "danger", onclick: discordLogout },
          "Log out bot",
        ),
      ),
    ),
    app.guilds.length
      ? app.guilds.map((guild) => {
          const joined = app.voiceByGuild[guild.id];
          return h(
            "div",
            { class: "guild" },
            h(
              "div",
              { class: "guild-head" },
              guild.icon
                ? h("img", { src: guild.icon, alt: "" })
                : h("span", { class: "guild-ph" }, guild.name[0]),
              h("b", null, guild.name),
              joined
                ? h(
                    "button",
                    {
                      class: "danger small",
                      onclick: () => discordLeave(guild.id),
                    },
                    "Leave channel",
                  )
                : null,
            ),
            h(
              "div",
              { class: "channels" },
              guild.channels.length
                ? guild.channels.map((channel) =>
                    h(
                      "button",
                      {
                        class: `channel ${joined?.channelId === channel.id ? "active" : ""}`,
                        onclick: () => discordJoin(guild.id, channel.id),
                      },
                      `🔊 ${channel.name}`,
                      channel.members
                        ? h("small", null, ` ${channel.members}`)
                        : null,
                    ),
                  )
                : h("small", { class: "muted" }, "No voice channels"),
            ),
          );
        })
      : mascotState(
          "empty",
          "The bot is not in any server yet. Invite the bot to your server, then click Refresh.",
          {
            title: "No servers",
            action: h("button", { onclick: loadDiscord }, "Refresh"),
          },
        ),
  );
}
