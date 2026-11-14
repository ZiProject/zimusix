import { joinedTargets } from "../features/discord.js";
import { switchView } from "../features/layout.js";
import { connectToApp, disconnectApp, linkVoiceAction, unlinkVoiceAction } from "../features/voice.js";
import { h } from "../lib/dom.js";
import { SVG_NS, icon } from "../lib/icons.js";
import { toast } from "../lib/toast.js";
import { app, refs } from "../state.js";
import { renderPlayer } from "./player.js";

let activeWireDrag = null;

const linksOf = (id) => app.stateByTarget[id]?.linkedVoices ?? [];

/** Guild đang chỉ là đầu ra (forward) của một nguồn khác: không phải nguồn độc lập. */
function isFedGuild(id) {
  return (
    Boolean(app.stateByTarget[id]?.feedingFrom) ||
    Object.values(app.stateByTarget).some((state) =>
      state?.linkedVoices?.some((link) => link.guildId === id),
    )
  );
}

function wireSources() {
  return [
    {
      id: "local",
      label: "Ứng dụng",
      detail: app.stateByTarget.local?.currentTrack?.title ?? "Player trong app",
    },
    ...joinedTargets()
      .filter((target) => !isFedGuild(target.id))
      .map((target) => ({
      id: target.id,
      label: target.name,
      detail: `#${target.channel}`,
    })),
  ];
}

function wireSourceLabel(id) {
  return wireSources().find((source) => source.id === id)?.label ?? id;
}

function routeWire(sourceTarget, destination) {
  if (destination.type === "app") {
    void connectToApp(sourceTarget);
    return;
  }
  if (sourceTarget === destination.guildId) {
    toast("Chọn một server voice khác với đầu ra nguồn", "error");
    return;
  }
  const linked = linksOf(sourceTarget).some(
    (link) =>
      link.guildId === destination.guildId &&
      link.channelId === destination.channelId,
  );
  if (linked) {
    // Bấm/kéo lại vào cổng đang nối = rút dây của đúng kênh đó.
    void unlinkVoiceAction(sourceTarget, destination.guildId);
    return;
  }
  linkVoiceAction(sourceTarget, destination.guildId, destination.channelId);
}

function parseWireDestination(event) {
  const element = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest("[data-wire-destination]");
  if (!element || element.disabled) return null;
  const [type, guildId, channelId] =
    element.dataset.wireDestination.split(":");
  return type === "app" ? { type } : { type, guildId, channelId };
}

export function drawWires() {
  const board = refs.wiringBoard;
  const svg = refs.wireSvg;
  if (!board || !svg || !app.wiringOpen) return;
  const bounds = board.getBoundingClientRect();
  svg.setAttribute("viewBox", `0 0 ${bounds.width} ${bounds.height}`);
  svg.replaceChildren();

  const addCable = (sourceTarget, x2, y2, className) => {
    const sourcePort = board.querySelector(
      `[data-wire-source-id="${CSS.escape(sourceTarget)}"] .wire-source-port`,
    );
    if (!sourcePort) return;
    const rect = sourcePort.getBoundingClientRect();
    const x1 = rect.right - bounds.left;
    const y1 = rect.top + rect.height / 2 - bounds.top;
    const bend = Math.max(32, Math.abs(x2 - x1) * 0.4);
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute(
      "d",
      `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
    );
    path.setAttribute("class", className);
    svg.append(path);
  };

  for (const source of wireSources()) {
    for (const link of linksOf(source.id)) {
      const destinationPort = board.querySelector(
        `[data-wire-destination="voice:${CSS.escape(link.guildId)}:${CSS.escape(link.channelId)}"] .wire-destination-port`,
      );
      if (!destinationPort) continue;
      const rect = destinationPort.getBoundingClientRect();
      addCable(
        source.id,
        rect.left + rect.width / 2 - bounds.left,
        rect.top + rect.height / 2 - bounds.top,
        "wire-cable connected",
      );
    }
  }

  if (app.listen && app.webAudioSourceTarget) {
    const appPort = board.querySelector(
      '[data-wire-destination="app"] .wire-destination-port',
    );
    if (appPort) {
      const rect = appPort.getBoundingClientRect();
      addCable(
        app.webAudioSourceTarget,
        rect.left + rect.width / 2 - bounds.left,
        rect.top + rect.height / 2 - bounds.top,
        "wire-cable connected",
      );
    }
  }

  if (activeWireDrag) {
    addCable(
      activeWireDrag.sourceTarget,
      activeWireDrag.x - bounds.left,
      activeWireDrag.y - bounds.top,
      "wire-cable dragging",
    );
  }
}

function startWireDrag(event) {
  if (event.button !== 0 || !event.target.closest(".wire-source-port")) return;
  const source = event.target.closest("[data-wire-source-id]");
  if (!source) return;
  event.preventDefault();
  app.wireSourceTarget = source.dataset.wireSourceId;
  activeWireDrag = {
    sourceTarget: app.wireSourceTarget,
    x: event.clientX,
    y: event.clientY,
  };
  refs.wiringBoard?.classList.add("wiring");
  drawWires();
}

export function moveWireDrag(event) {
  if (!activeWireDrag) return;
  activeWireDrag.x = event.clientX;
  activeWireDrag.y = event.clientY;
  const target = document.elementFromPoint(event.clientX, event.clientY)
    ?.closest("[data-wire-destination]");
  refs.wiringBoard
    ?.querySelectorAll(".drop-target")
    .forEach((element) => element.classList.remove("drop-target"));
  target?.classList.add("drop-target");
  drawWires();
}

export function finishWireDrag(event) {
  if (!activeWireDrag) return;
  const sourceTarget = activeWireDrag.sourceTarget;
  const destination = parseWireDestination(event);
  activeWireDrag = null;
  refs.wiringBoard?.classList.remove("wiring");
  refs.wiringBoard
    ?.querySelectorAll(".drop-target")
    .forEach((element) => element.classList.remove("drop-target"));
  drawWires();
  if (destination) routeWire(sourceTarget, destination);
}

export function renderWiringPanel() {
  const sources = wireSources();
  if (!sources.some((source) => source.id === app.wireSourceTarget)) {
    app.wireSourceTarget = sources[0]?.id ?? "local";
  }
  const sourceLinks = linksOf(app.wireSourceTarget);

  const destination = (
    name,
    subtitle,
    route,
    linked = false,
    disabled = false,
  ) =>
    h(
      "button",
      {
        class: `wire-destination ${linked ? "linked" : ""}`,
        disabled,
        "data-wire-destination":
          route.type === "app"
            ? "app"
            : `voice:${route.guildId}:${route.channelId}`,
        onclick: () => routeWire(app.wireSourceTarget, route),
      },
      h(
        "span",
        { class: "wire-destination-icon" },
        icon(route.type === "app" ? "headphones" : "discord", 18),
      ),
      h(
        "span",
        { class: "wire-destination-text" },
        h("b", null, name),
        h("small", null, subtitle),
      ),
      h(
        "span",
        { class: "wire-destination-port-wrap" },
        h("span", { class: "wire-destination-port" }),
      ),
    );

  const channels = app.guilds.flatMap((guild) =>
    guild.channels.map((channel) => ({
      guild,
      channel,
    })),
  );

  return h(
    "section",
    { class: "wiring-panel", "aria-label": "Bảng nối đầu ra âm thanh" },
    h(
      "header",
      { class: "wiring-head" },
      h(
        "div",
        null,
        h("b", null, "Nối đầu ra"),
        h(
          "small",
          { class: "muted" },
          "Chọn một đầu ra bên trái, rồi kéo dây tới đầu vào bên phải",
        ),
      ),
    ),
    h(
      "div",
      {
        class: "wiring-board",
        onpointerdown: startWireDrag,
      },
      (() => {
        const svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "wire-cables");
        svg.setAttribute("aria-hidden", "true");
        refs.wireSvg = svg;
        return svg;
      })(),
      h(
        "div",
        { class: "wire-source-column" },
        h("span", { class: "wire-label" }, "Đầu ra · kéo từ trái sang phải"),
        sources.map((source) => {
          const linked = linksOf(source.id).length;
          return h(
            "button",
            {
              class: `wire-source ${app.wireSourceTarget === source.id ? "selected" : ""}`,
              "data-wire-source-id": source.id,
              title: `${source.label} · ${source.detail}`,
              onclick: () => {
                app.wireSourceTarget = source.id;
                renderPlayer();
              },
            },
            h("span", { class: "wire-source-status" }),
            h(
              "span",
              { class: "wire-source-text" },
              h("b", null, source.label),
              h("small", null, source.detail),
            ),
            linked
              ? h(
                  "span",
                  { class: "wire-source-linked" },
                  linked > 1 ? `Đang nối ×${linked}` : "Đang nối",
                )
              : null,
            h("span", { class: "wire-source-port" }),
          );
        }),
      ),
      h(
        "div",
        { class: "wire-destinations" },
        h("span", { class: "wire-label" }, "Đầu vào · thả dây tại đây"),
        destination(
          "Ứng dụng",
          app.listen
            ? `Đang nghe · nguồn: ${wireSourceLabel(app.webAudioSourceTarget)} (bấm để rút dây)`
            : "Kéo dây tới đây để nghe trên máy",
          { type: "app" },
          app.webAudioSourceTarget === app.wireSourceTarget && app.listen,
        ),
        app.discord.status !== "ready"
          ? h(
              "button",
              {
                class: "wire-destination wire-login",
                onclick: () => switchView("discord"),
              },
              icon("discord", 18),
              h(
                "span",
                { class: "wire-destination-text" },
                h("b", null, "Discord Voice"),
                h("small", null, "Đăng nhập bot để kết nối"),
              ),
            )
          : channels.length
            ? channels.map(({ guild, channel }) =>
                destination(
                  `#${channel.name}`,
                  guild.name,
                  {
                    type: "voice",
                    guildId: guild.id,
                    channelId: channel.id,
                  },
                  sources.some((source) =>
                    linksOf(source.id).some(
                      (link) =>
                        link.guildId === guild.id &&
                        link.channelId === channel.id,
                    ),
                  ),
                  app.wireSourceTarget === guild.id,
                ),
              )
            : h(
                "small",
                { class: "muted" },
                "Bot chưa có quyền truy cập kênh thoại nào.",
              ),
      ),
      h(
        "p",
        { class: "wire-hint" },
        "Một nguồn nối được tới Ứng dụng và nhiều kênh Voice (mỗi server một kênh), tất cả cùng phát. Bấm lại cổng đang nối (hoặc nút Rút dây) để ngắt; nguồn vẫn phát bình thường.",
      ),
    ),
    h(
      "div",
      { class: "wire-unlink-row" },
      ...sourceLinks.map((link) =>
        h(
          "button",
          {
            class: "danger small wire-unlink",
            onclick: () =>
              unlinkVoiceAction(app.wireSourceTarget, link.guildId),
          },
          `Rút dây khỏi #${link.channelName || "Voice"}`,
        ),
      ),
      app.listen
        ? h(
            "button",
            {
              class: "danger small wire-unlink",
              onclick: () => disconnectApp(),
            },
            "Rút dây khỏi Ứng dụng",
          )
        : null,
    ),
  );
}
