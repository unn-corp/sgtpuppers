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
    color:
      state === "Online" ? 0x2ecc71 : state === "Stale" ? 0xf1c40f : 0x95a5a6,
    fields: [],
    footer: {
      text: s.updatedAt
        ? "Last successful status update"
        : "Waiting for first successful status update",
    },
  };
  if (s.updatedAt) e.timestamp = new Date(s.updatedAt).toISOString();
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
    if (status.matchSeconds !== undefined)
      e.fields!.push({
        name: "Match duration",
        value: `${Math.floor(status.matchSeconds / 60)}m ${Math.floor(status.matchSeconds % 60)}s`,
        inline: true,
      });
  }
  e.fields!.push({
    name: `Join code${s.joinFailed || (s.joinAt && now - s.joinAt > 600_000) ? " (last known)" : ""}`,
    value: s.joinCode ? "```\n" + s.joinCode + "\n```" : "Unavailable",
  });
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
  if (state !== "Online")
    e.fields!.push({
      name: "Connection",
      value:
        "Status data is unavailable or stale. Values shown are from the last successful update.",
    });
  const result: APIEmbed[] = [e];
  const scores = status?.factionScores.slice(0, 3) || [];
  if (scores.length) {
    result.push({
      title: "Faction scores",
      color: e.color,
      description: state !== "Online" ? "Last known scores" : undefined,
      fields: scores.map((f) => {
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
          value: `**${f.score}${status?.scoreCap ? ` / ${status.scoreCap}` : ""}** points`,
          inline: true,
        };
      }),
    });
  }
  // Keep branding after all status and score content.
  if (c.banner) result.push({ color: e.color, image: { url: c.banner } });
  return result;
}
