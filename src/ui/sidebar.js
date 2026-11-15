import { joinedTargets } from "../features/discord.js";
import { switchView } from "../features/layout.js";
import { setTarget } from "../features/playback.js";
import { h } from "../lib/dom.js";
import { icon } from "../lib/icons.js";
import { app, refs } from "../state.js";

export function renderSidebar() {
  const nav = [
    ["nowplaying", "disc", "Now Playing"],
    ["search", "search", "Search"],
    ["library", "folder", "Local Files"],
    ["queue", "queue", "Queue"],
    ["related", "sparkles", "Related"],
    ["lyrics", "mic", "Lyrics"],
    ["presets", "palette", "Themes"],
    ["discord", "discord", "Discord"],
  ];
  const targets = [
    { id: "local", name: "This device", channel: "In-app playback" },
    ...joinedTargets(),
  ];

  refs.sidebar.replaceChildren(
    h(
      "div",
      { class: "brand" },
      h("img", { class: "logo-img", src: "/logo.png", alt: "Zimusix" }),
      h(
        "span",
        { class: "brand-text" },
        h("span", { class: "brand-name" }, "Zimusix"),
        h("small", { class: "brand-sub" }, "Music & Lifestyle"),
      ),
    ),
    h(
      "nav",
      null,
      nav.map(([view, ic, label]) =>
        h(
          "button",
          {
            class: `nav-item ${app.view === view ? "active" : ""}`,
            title: label,
            onclick: () => switchView(view),
          },
          icon(ic, 18),
          h("span", { class: "nav-label" }, label),
          view === "queue" && app.state?.queue?.length
            ? h("span", { class: "count" }, app.state.queue.length)
            : null,
          view === "related" && app.state?.related?.length
            ? h("span", { class: "count" }, app.state.related.length)
            : null,
        ),
      ),
    ),
    h("div", { class: "section-title" }, "Play to"),
    h(
      "div",
      { class: "targets" },
      targets.map((t) =>
        h(
          "button",
          {
            class: `target ${app.target === t.id ? "active" : ""}`,
            onclick: () => setTarget(t.id),
          },
          h("span", { class: "dot" }),
          h(
            "span",
            { class: "target-text" },
            h("b", null, t.name),
            h(
              "small",
              null,
              t.id === "local" ? t.channel : `# ${t.channel ?? "voice channel"}`,
            ),
          ),
        ),
      ),
    ),
    h(
      "div",
      { class: "discord-pill" },
      h("span", { class: `dot ${app.discord.status}` }),
      app.discord.status === "ready"
        ? `Bot: ${app.discord.user?.tag ?? "logged in"}`
        : app.discord.status === "connecting"
          ? "Bot logging in…"
          : "Bot not logged in",
    ),
  );
}
