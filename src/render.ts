import { ActivityType, type APIEmbed } from "discord.js";
import { freshness, friendlyMap, humanize, type Snapshot } from "./model.js";
import type { Config } from "./config.js";
const clean = (s: string, max = 1000) =>
  s.replace(/[`*_~|<>]/g, "").slice(0, max) || "Unknown";
export function presence(s: Snapshot, c: Config, now = Date.now()) {
  const state = freshness(s, now);
  const text =
    state === "Online"
      ? `${c.label} | ${s.status!.players.current}/${s.status!.players.max} | ${friendlyMap(s.status!.map, s.catalogs?.["catalog/maps"])}`
      : `${c.label} | ${state}`;
  return {
    status: state === "Online" ? ("online" as const) : ("idle" as const),
    activities: [
      {
        name: "Custom Status",
        type: ActivityType.Custom,
        state: text.slice(0, 128),
      },
    ],
  };
}
export function scoreBar(score: number) {
  const filled = Math.max(0, Math.min(20, Math.floor(score / 5)));
  return "▰".repeat(filled) + "▱".repeat(20 - filled);
}
export function embeds(s: Snapshot, c: Config, now = Date.now()): APIEmbed[] {
  const display = (kind: string, id: string) =>
    humanize(
      s.catalogs?.[`catalog/${kind}`]?.find((x) => x.id === id)?.displayName ||
        id,
    );
  const state = freshness(s, now),
    status = s.status;
  const e: APIEmbed = {
    title: `Server status · ${state}`,
    color: 0x3498db,
    fields: [],
    footer: {
      text:
        s.updatedAt !== undefined
          ? "Created by joinunn.com | Updated"
          : "Created by joinunn.com | Awaiting first update",
    },
  };
  if (s.updatedAt !== undefined)
    e.timestamp = new Date(s.updatedAt).toISOString();
  if (status) {
    e.description = `**${clean(status.serverName, 250)}**`;
    const modes = status.experiences.map((x) =>
      x.endsWith("_KOTH_01")
        ? "King of the Hill"
        : display("experiences", x).replace(/^KOTH /, ""),
    );
    e.fields!.push(
      {
        name: "Match",
        value: clean(
          [
            friendlyMap(status.map, s.catalogs?.["catalog/maps"]),
            ...new Set(modes),
            status.lighting && display("lightings", status.lighting),
            status.alternator &&
              humanize(status.alternator.split(".").slice(2).join(" ")),
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      },
      {
        name: "Players",
        value: `${status.players.current}/${status.players.max}${state !== "Online" ? " (last known)" : ""}`,
        inline: true,
      },
    );
  }
  const next =
    s.rotation?.entries.find((x) => x.status === "next") ||
    s.rotation?.entries.find((x) => x.index === status?.rotation?.nextIndex);
  e.fields!.push({
    name: `Next map${s.rotationFailed || (s.rotationAt && now - s.rotationAt > 600_000) ? " (last known)" : ""}`,
    value:
      s.rotation?.enabled === false
        ? "Rotation disabled"
        : next
          ? clean(friendlyMap(next.map, s.catalogs?.["catalog/maps"]))
          : "Unknown",
    inline: true,
  });
  if (status?.matchSeconds !== undefined)
    e.fields!.push({
      name: "Match duration",
      value: `${Math.floor(status.matchSeconds / 60)}m ${Math.floor(status.matchSeconds % 60)}s`,
      inline: true,
    });
  e.fields!.push({
    name: `Join by Server ID${s.joinFailed || (s.joinAt && now - s.joinAt > 600_000) ? " (last known)" : ""}`,
    value: s.joinCode ? "```\n" + s.joinCode + "\n```" : "Unavailable",
  });
  if (state !== "Online")
    e.fields!.push({
      name: "Connection",
      value:
        "Status data is unavailable or stale. Values shown are from the last successful update.",
    });

  const scores = status?.factionScores.slice(0, 3) || [];
  if (scores.length) {
    e.fields!.push(
      ...scores.map((f) => {
        const faction = f.name.toLowerCase();
        const custom = Object.hasOwn(c.emojis, faction)
          ? c.emojis[faction]
          : undefined;
        const fallback =
          new Map([
            ["lonestar", "🟦"],
            ["valkyra", "🟥"],
            ["manticore", "🟩"],
          ]).get(faction) || "⚑";
        return {
          name: `${custom || fallback} ${clean(f.name, 80)}`,
          value: `**${f.score} / 100** points\n\`${scoreBar(f.score)}\``,
          inline: false,
        };
      }),
    );
  }
  // Keep branding after all status and score content.
  if (c.banner) e.image = { url: c.banner };
  return [e];
}
