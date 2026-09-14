export type Status = {
  serverName: string;
  map: string;
  experiences: string[];
  lighting?: string;
  alternator?: string;
  players: { current: number; max: number };
  factionScores: { name: string; score: number; colorHex?: string }[];
  rotation?: { nowIndex?: number | null; nextIndex?: number | null };
  matchSeconds?: number;
  scoreCap?: number;
};
export type Rotation = {
  enabled: boolean;
  entries: {
    index: number;
    map: string;
    experiences: string[];
    status?: string | null;
  }[];
};
export type Catalog = { id: string; displayName: string }[];
export type Snapshot = {
  status?: Status;
  updatedAt?: number;
  failed: boolean;
  catalogs?: Record<string, Catalog>;
  rotation?: Rotation;
  rotationAt?: number;
  rotationFailed?: boolean;
  joinCode?: string;
  joinAt?: number;
  joinFailed?: boolean;
};
export function parseStatus(raw: unknown): Status {
  const s = raw as Status;
  if (
    !s ||
    typeof s.serverName !== "string" ||
    typeof s.map !== "string" ||
    !s.players ||
    ![s.players.current, s.players.max].every(
      (n) => Number.isInteger(n) && n >= 0,
    )
  )
    throw new Error("Invalid status response");
  const strings = (v: unknown): v is string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string");
  if (s.experiences !== undefined && !strings(s.experiences))
    throw new Error("Invalid experiences");
  if (
    s.factionScores !== undefined &&
    (!Array.isArray(s.factionScores) ||
      s.factionScores.some(
        (f) => !f || typeof f.name !== "string" || !Number.isFinite(f.score),
      ))
  )
    throw new Error("Invalid scores");
  return {
    ...s,
    experiences: s.experiences || [],
    factionScores: s.factionScores || [],
    lighting: typeof s.lighting === "string" ? s.lighting : undefined,
    alternator: typeof s.alternator === "string" ? s.alternator : undefined,
    matchSeconds:
      Number.isFinite(s.matchSeconds) && s.matchSeconds! >= 0
        ? s.matchSeconds
        : undefined,
    scoreCap:
      Number.isFinite(s.scoreCap) && s.scoreCap! > 0 ? s.scoreCap : undefined,
  };
}
const names: Record<string, string> = {
  Kavkazi: "Bakurani",
  Bakurani: "Bakurani",
  Europe: "Ozeti",
  Madrid: "Ozeti",
  Ozeti: "Ozeti",
  NorthAmerica: "Zestafona",
  Detroit: "Zestafona",
  Zestafona: "Zestafona",
};
export function friendlyMap(map: string, catalog: Catalog = []) {
  return Object.hasOwn(names, map)
    ? names[map]!
    : humanize(catalog.find((x) => x.id === map)?.displayName || map);
}
export function humanize(value: string) {
  return value
    .replace(/[_]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}
export function freshness(s: Snapshot, now = Date.now()) {
  return !s.status || !s.updatedAt || now - s.updatedAt >= 300_000
    ? "Unavailable"
    : s.failed
      ? "Stale"
      : "Online";
}
