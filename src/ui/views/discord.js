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
        ? "Dùng token đã lưu (để trống)"
        : "Dán token bot Discord",
      autocomplete: "off",
    });
    return h(
      "section",
      { class: "view" },
      h("h2", null, "Bot Discord"),
      h(
        "p",
        { class: "muted" },
        "Zimusix chạy bot của bạn để phát nhạc vào kênh thoại. Token được lưu cục bộ trên máy này.",
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
          d.status === "connecting" ? "Đang đăng nhập…" : "Đăng nhập",
        ),
      ),
      h(
        "ol",
        { class: "help" },
        h(
          "li",
          null,
          "Tạo ứng dụng + bot tại Discord Developer Portal, copy Bot Token.",
        ),
        h(
          "li",
          null,
          "Mời bot vào server bằng OAuth2 URL với scope ",
          h("code", null, "bot"),
          " và quyền Connect + Speak + View Channels.",
        ),
        h(
          "li",
          null,
          "Quay lại đây, đăng nhập và chọn kênh thoại để bot tham gia.",
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
        h("button", { onclick: loadDiscord }, "Làm mới"),
        h(
          "button",
          { class: "danger", onclick: discordLogout },
          "Đăng xuất bot",
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
                    "Rời kênh",
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
                : h("small", { class: "muted" }, "Không có kênh thoại"),
            ),
          );
        })
      : mascotState(
          "empty",
          "Bot chưa ở trong server nào. Hãy mời bot vào server rồi bấm Làm mới.",
          {
            title: "Chưa có server",
            action: h("button", { onclick: loadDiscord }, "Làm mới"),
          },
        ),
  );
}
