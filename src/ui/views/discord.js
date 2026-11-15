import {
  discordJoin,
  discordLeave,
  discordLogin,
  discordLogout,
  loadDiscord,
  updateRpc,
} from "../../features/discord.js";
import { fmtTime, h } from "../../lib/dom.js";
import { icon } from "../../lib/icons.js";
import { app } from "../../state.js";
import { mascotState } from "../mascot.js";

function renderRpcSection() {
  const rpc = app.rpc || {};
  const currentTrack = app.state?.currentTrack;
  const isPaused = app.state?.isPaused;
  const position = app.state?.position || 0;
  const duration = app.state?.duration || 0;

  const statusTag = h(
    "span",
    { class: "rpc-status-tag" },
    h("span", { class: `dot ${rpc.connected ? "ready" : "connecting"}` }),
    rpc.connected
      ? `Discord connected (${rpc.user?.username ? "@" + rpc.user.username : "Desktop client"})`
      : "Discord app not detected (waiting for desktop client)",
  );

  const previewTagText =
    rpc.activityType === "Playing" ? "Playing Zimusix" : "Listening to Zimusix";
  const displayTitle = currentTrack
    ? currentTrack.title || "Untitled track"
    : rpc.idleDetails || "Chờ phát nhạc";
  const displayArtist = currentTrack
    ? currentTrack.author
      ? `by ${currentTrack.author}`
      : "Zimusix"
    : rpc.idleState || "Zimusix";
  const thumbUrl =
    currentTrack && rpc.showThumbnail !== false && currentTrack.thumbnail
      ? currentTrack.thumbnail
      : null;

  const progressPercent =
    duration > 0 ? Math.min(100, Math.max(0, (position / duration) * 100)) : 0;

  const previewCard = h(
    "div",
    { class: "rpc-preview" },
    h("div", { class: "rpc-preview-tag" }, previewTagText),
    h(
      "div",
      { class: "rpc-preview-body" },
      h(
        "div",
        { class: "rpc-thumb-wrapper" },
        thumbUrl
          ? h("img", { src: thumbUrl, alt: "" })
          : h(
              "div",
              {
                style: {
                  display: "grid",
                  placeItems: "center",
                  width: "100%",
                  height: "100%",
                },
              },
              icon("music", 28),
            ),
        currentTrack
          ? h(
              "div",
              { class: "rpc-badge" },
              icon(isPaused ? "pause" : "play", 10),
            )
          : null,
      ),
      h(
        "div",
        { class: "rpc-preview-info" },
        h("div", { class: "rpc-preview-title" }, displayTitle),
        h("div", { class: "rpc-preview-artist" }, displayArtist),
        currentTrack && rpc.showTimeline !== false
          ? h(
              "div",
              { class: "rpc-preview-time" },
              duration > 0
                ? `${fmtTime(position)} / ${fmtTime(duration)}`
                : `${fmtTime(position)} elapsed`,
              duration > 0
                ? h(
                    "div",
                    { class: "rpc-preview-bar" },
                    h("div", {
                      class: "rpc-preview-bar-fill",
                      style: { width: `${progressPercent}%` },
                    }),
                  )
                : null,
            )
          : !currentTrack
            ? h("div", { class: "rpc-preview-time" }, "Idle")
            : null,
      ),
    ),
  );

  const clientIdInput = h("input", {
    type: "text",
    placeholder:
      "Discord Application Client ID (leave empty to use default/bot ID)",
    value: rpc.clientId === "383226320970055681" ? "" : rpc.clientId || "",
  });

  const activityTypeSelect = h(
    "select",
    {
      class: "input",
      style: {
        background: "var(--panel-2)",
        color: "var(--text)",
        border: "1px solid var(--line)",
        borderRadius: "8px",
        padding: "6px 10px",
      },
    },
    h(
      "option",
      { value: "Listening", selected: rpc.activityType === "Listening" },
      "Listening to (Type 2)",
    ),
    h(
      "option",
      { value: "Playing", selected: rpc.activityType === "Playing" },
      "Playing (Type 0)",
    ),
  );

  const timelineCheckbox = h("input", {
    type: "checkbox",
    checked: rpc.showTimeline !== false,
  });

  const thumbnailCheckbox = h("input", {
    type: "checkbox",
    checked: rpc.showThumbnail !== false,
  });

  const idleCheckbox = h("input", {
    type: "checkbox",
    checked: rpc.showIdle !== false,
  });

  const onSaveConfig = () => {
    updateRpc({
      enabled: rpc.enabled !== false,
      clientId: clientIdInput.value.trim() || undefined,
      activityType: activityTypeSelect.value,
      showTimeline: timelineCheckbox.checked,
      showThumbnail: thumbnailCheckbox.checked,
      showIdle: idleCheckbox.checked,
    });
  };

  const onToggleEnabled = () => {
    updateRpc({ enabled: !rpc.enabled });
  };

  return h(
    "section",
    { class: "rpc-section" },
    h(
      "div",
      { class: "rpc-header" },
      h(
        "div",
        { class: "rpc-title-group" },
        icon("discord", 22),
        h("h3", { style: { margin: 0 } }, "Discord Rich Presence"),
        statusTag,
      ),
      h(
        "button",
        {
          class: rpc.enabled ? "danger small" : "primary small",
          onclick: onToggleEnabled,
        },
        rpc.enabled ? "Disable RPC" : "Enable RPC",
      ),
    ),
    h(
      "p",
      { class: "muted" },
      "Displays currently playing song with live timeline progress bar and album thumbnail on your Discord desktop profile, including idle status.",
    ),
    previewCard,
    h(
      "div",
      { class: "rpc-form" },
      h(
        "div",
        { class: "rpc-options-grid" },
        h(
          "label",
          { class: "rpc-checkbox-label" },
          timelineCheckbox,
          "Show timeline progress bar",
        ),
        h(
          "label",
          { class: "rpc-checkbox-label" },
          thumbnailCheckbox,
          "Show track thumbnail",
        ),
        h(
          "label",
          { class: "rpc-checkbox-label" },
          idleCheckbox,
          "Hiện cả khi không phát nhạc (Idle)",
        ),
      ),
      h(
        "div",
        { class: "form-row", style: { margin: "8px 0" } },
        activityTypeSelect,
        clientIdInput,
        h(
          "button",
          { class: "primary", onclick: onSaveConfig },
          "Save RPC Settings",
        ),
      ),
    ),
  );
}

function renderBotSection() {
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
      "div",
      { class: "rpc-section" },
      h("h3", null, "Discord Voice Bot"),
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
    "div",
    { class: "rpc-section" },
    h(
      "div",
      { class: "view-head", style: { marginBottom: "14px" } },
      h(
        "h3",
        { style: { margin: 0 } },
        `Discord Bot: ${d.user?.tag || "Logged in"}`,
      ),
      h(
        "div",
        { class: "button-row" },
        h("button", { onclick: loadDiscord }, "Refresh"),
        h("button", { class: "danger", onclick: discordLogout }, "Log out bot"),
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

export function viewDiscord() {
  return h(
    "section",
    { class: "view" },
    h(
      "div",
      { class: "view-head" },
      h("h2", null, "Discord"),
      h("button", { onclick: loadDiscord }, "Refresh"),
    ),
    renderRpcSection(),
    renderBotSection(),
  );
}
