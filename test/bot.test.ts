import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { Poller, ApiError, WardogsClient, retryAfter } from "../src/poller.js";
import { parseStatus, friendlyMap, freshness } from "../src/model.js";
import { embeds, presence, scoreBar } from "../src/render.js";
import { config } from "../src/config.js";
import { Panels } from "../src/panels.js";
const fixture = {
  serverName: "[NA 1] Unnamed",
  map: "Bakurani",
  experiences: ["Bakurani_KOTH_01"],
  lighting: "DayClear",
  players: { current: 0, max: 100 },
  factionScores: [
    { name: "Lonestar", colorHex: "#4CB1EF", score: 0 },
    { name: "Valkyra", score: 12 },
    { name: "Manticore", score: 5 },
  ],
  alternator: "ZoneAlternator.Bakurani.Lumberyard.Circle",
  rotation: { nowIndex: null, nextIndex: 0 },
};
const c = config({
  DISCORD_TOKEN: "test",
  DISCORD_APPLICATION_ID: "12345678901234567",
  DISCORD_GUILD_ID: "12345678901234568",
  WARDOGS_URL: "http://example.invalid",
  WARDOGS_PASSWORD: "test",
});
async function temporary(t: { after: (f: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), "sgtpuppers-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const store = new Store(dir);
  await store.load();
  return { dir, store };
}
test("real shape renders confirmed aliases, exact presence, UUID and no invented timer/cap", () => {
  const status = parseStatus(fixture),
    s = {
      status,
      failed: false,
      updatedAt: 1_000_000,
      joinCode: "00000000-0000-4000-8000-000000000001",
    };
  assert.equal(
    presence(s, c, 1_000_000).activities[0]!.state,
    "NA1 | 0/100 | Bakurani",
  );
  const output = embeds(s, c, 1_000_000);
  assert.equal(output.length, 1);
  assert.ok(
    output[0]!
      .fields!.find((f) => f.name === "Join code")!
      .value.startsWith("```\n00000000"),
  );
  assert.ok(!output[0]!.fields!.some((f) => f.name === "Match duration"));
  assert.equal(
    output[0]!.fields!.find((f) => f.name === "🟦 Lonestar")!.value,
    "**0 / 100** points\n`▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱`",
  );
  for (const [raw, name] of Object.entries({
    Europe: "Ozeti",
    Madrid: "Ozeti",
    NorthAmerica: "Zestafona",
    Detroit: "Zestafona",
    Kavkazi: "Bakurani",
    NewMap: "New Map",
  }))
    assert.equal(friendlyMap(raw), name);
  assert.throws(() =>
    parseStatus({ ...fixture, players: { current: "0", max: 100 } }),
  );
});
test("status poll shares one request, retains stale data, honors server cooldown and recovers", async (t) => {
  const { store } = await temporary(t);
  let now = 1_000_000,
    calls = 0,
    fail = false;
  const poller = new Poller(
    {
      get: async () => {
        calls++;
        if (fail) throw new ApiError(429, 600_000);
        return fixture;
      },
    },
    store,
    () => now,
    () => 0,
  );
  await Promise.all([poller.tick(), poller.tick(), poller.tick()]);
  assert.equal(calls, 1);
  now += 60_000;
  fail = true;
  await poller.tick();
  assert.equal(poller.blockedUntil, now + 600_000);
  assert.equal(freshness(poller.snapshot, now), "Stale");
  assert.equal(poller.snapshot.status!.players.current, 0);
  now += 300_000;
  assert.equal(freshness(poller.snapshot, now), "Unavailable");
  await poller.tick();
  assert.equal(calls, 2);
  now += 300_000;
  fail = false;
  await poller.tick();
  assert.equal(calls, 3);
  assert.equal(freshness(poller.snapshot, now), "Online");
});
test("timeouts back off, authentication halts and optional 404 does not stop status", async (t) => {
  const { store } = await temporary(t);
  let now = 1_000_000;
  const timeout = new Poller(
    {
      get: async () => {
        throw new DOMException("timeout", "TimeoutError");
      },
    },
    store,
    () => now,
    () => 0,
  );
  await timeout.tick();
  assert.equal(timeout.blockedUntil, now + 60_000);
  now += 60_000;
  await timeout.tick();
  assert.equal(timeout.blockedUntil, now + 120_000);
  let calls = 0;
  const auth = new Poller(
    {
      get: async () => {
        calls++;
        throw new ApiError(401);
      },
    },
    store,
    () => now,
    () => 0,
  );
  await auth.tick();
  now += 1_000_000;
  await auth.tick();
  assert.equal(calls, 1);
  const paths: string[] = [];
  const p = new Poller(
    {
      get: async (path) => {
        paths.push(path);
        if (path === "/v1/status") return fixture;
        throw new ApiError(404);
      },
    },
    store,
    () => now,
    () => 0,
  );
  await p.tick();
  now += 5000;
  await p.tick();
  now += 60_000;
  await p.tick();
  assert.deepEqual(paths, ["/v1/status", "/v1/capabilities", "/v1/status"]);
});
test("client is GET-only, uses timeout signal, rejects redirects and parses Retry-After", async () => {
  let options: RequestInit | undefined;
  const client = new WardogsClient(
    "http://example.invalid",
    "secret",
    async (_url, opts) => {
      options = opts;
      return new Response(JSON.stringify(fixture));
    },
  );
  await client.get("/v1/status");
  assert.equal(options?.method, "GET");
  assert.equal(options?.redirect, "error");
  assert.ok(options?.signal);
  await assert.rejects(client.get("/v1/match/end"));
  assert.equal(retryAfter("120", 1000), 120_000);
  assert.equal(retryAfter("Thu, 01 Jan 1970 00:02:00 GMT", 1000), 119_000);
  const limited = new WardogsClient(
    "http://example.invalid",
    "secret",
    async () =>
      new Response("", { status: 429, headers: { "Retry-After": "120" } }),
  );
  await assert.rejects(
    limited.get("/v1/status"),
    (e: unknown) => e instanceof ApiError && e.retryMs === 120_000,
  );
});
test("atomic serialized state survives restart, corrupt state is not silently overwritten", async (t) => {
  const { store, dir } = await temporary(t);
  store.state.panels.push({
    guildId: "g",
    channelId: "c",
    messageId: "m",
    serverKey: "s",
  });
  const first = store.save();
  store.state.catalogs.maps = { at: 123, items: [] };
  await Promise.all([first, store.save()]);
  const restored = new Store(dir);
  await restored.load();
  assert.deepEqual(restored.state, store.state);
  await writeFile(join(dir, "state.json"), "broken");
  await assert.rejects(new Store(dir).load());
  assert.equal(await readFile(join(dir, "state.json"), "utf8"), "broken");
});
test("deleted panels are removed; forbidden panels suspend independently and can resume", async (t) => {
  const { store } = await temporary(t);
  store.state.panels = ["deleted", "forbidden", "good"].map((id) => ({
    guildId: "g",
    channelId: id,
    messageId: id,
    serverKey: "s",
  }));
  const panels = new Panels(store);
  const calls: string[] = [];
  const send = async (p: { messageId: string }) => {
    calls.push(p.messageId);
    if (p.messageId === "deleted") throw { code: 10008 };
    if (p.messageId === "forbidden") throw { code: 50013 };
  };
  await panels.update("a", send, () => true);
  assert.equal(store.state.panels.length, 2);
  await panels.update("b", send, () => true);
  assert.deepEqual(calls, ["deleted", "forbidden", "good", "good"]);
  panels.resume("forbidden");
  await panels.update(
    "c",
    async () => {},
    () => true,
  );
});
test("join code and rotation refresh independently with correct internal next map", async (t) => {
  const { store } = await temporary(t);
  let now = 1_000_000;
  const poller = new Poller(
    {
      get: async (path) =>
        path === "/v1/status"
          ? fixture
          : path === "/v1/capabilities"
            ? {
                routes: [
                  "GET /v1/status",
                  "GET /v1/rotation",
                  "GET /v1/server-id",
                ],
              }
            : path === "/v1/rotation"
              ? {
                  enabled: true,
                  entries: [
                    {
                      index: 0,
                      map: "NorthAmerica",
                      experiences: ["Detroit_KOTH_01"],
                      status: "next",
                    },
                  ],
                }
              : { serverId: "00000000-0000-4000-8000-000000000001" },
    },
    store,
    () => now,
    () => 0,
  );
  for (let i = 0; i < 4; i++) {
    await poller.tick();
    now += 5000;
  }
  assert.equal(
    poller.snapshot.joinCode,
    "00000000-0000-4000-8000-000000000001",
  );
  assert.equal(
    embeds(poller.snapshot, c, now)[0]!.fields!.find(
      (f) => f.name === "Next map",
    )!.value,
    "Zestafona",
  );
});

test("custom emoji uses embed body and cached catalogs name new maps", () => {
  const status = parseStatus(fixture);
  const output = embeds(
    { status, failed: false, updatedAt: 1_000_000 },
    { ...c, emojis: { lonestar: "<:lonestar:123456789012345678>" } },
    1_000_000,
  );
  assert.equal(output[0]!.author, undefined);
  assert.ok(
    output[0]!.fields!.some((f) =>
      f.name.startsWith("<:lonestar:123456789012345678>"),
    ),
  );
  assert.equal(
    friendlyMap("FutureMap", [
      { id: "FutureMap", displayName: "New Frontier" },
    ]),
    "New Frontier",
  );
  assert.equal(friendlyMap("constructor"), "constructor");
});

test("malformed status keeps last valid snapshot rather than replacing it", async (t) => {
  const { store } = await temporary(t);
  let now = 1_000_000;
  let malformed = false;
  const poller = new Poller(
    { get: async () => (malformed ? { players: { current: 0 } } : fixture) },
    store,
    () => now,
    () => 0,
  );
  await poller.tick();
  malformed = true;
  now += 60_000;
  await poller.tick();
  assert.equal(poller.snapshot.status!.map, "Bakurani");
  assert.equal(poller.snapshot.updatedAt, 1_000_000);
  assert.equal(poller.snapshot.failed, true);
});

test("one embed aligns metadata and places banner below full-width score bars", () => {
  const output = embeds(
    { status: parseStatus(fixture), failed: false, updatedAt: 1_000_000 },
    { ...c, banner: "https://example.com/banner.webp" },
    1_000_000,
  );
  assert.equal(output.length, 1);
  const fields = output[0]!.fields!;
  const players = fields.findIndex((f) => f.name === "Players");
  assert.equal(fields[players + 1]!.name, "Next map");
  assert.ok(fields[players]!.inline && fields[players + 1]!.inline);
  assert.deepEqual(output[0]!.image, {
    url: "https://example.com/banner.webp",
  });
  assert.ok(
    fields
      .slice(-3)
      .every((f) => f.inline === false && f.value.includes("/ 100")),
  );
});
test("score bars have twenty segments and clamp fill while retaining exact scores", () => {
  for (const [score, filled] of [
    [-10, 0],
    [0, 0],
    [4, 0],
    [5, 1],
    [59, 11],
    [100, 20],
    [150, 20],
  ]) {
    const bar = scoreBar(score!);
    assert.equal(bar.length, 20);
    assert.equal([...bar].filter((x) => x === "▰").length, filled);
  }
});

test("footer uses native Discord timestamp for viewer-local time", () => {
  const now = Date.parse("2026-09-14T08:35:00Z");
  const [embed] = embeds(
    { status: parseStatus(fixture), failed: true, updatedAt: now },
    c,
    now + 60_000,
  );
  assert.equal(embed!.color, 0x87cefa);
  assert.equal(embed!.timestamp, "2026-09-14T08:35:00.000Z");
  assert.equal(embed!.footer!.text, "Created by joinunn.com | Updated");
  assert.ok(
    !embed!.fields!.some(
      (f) => f.name === "Faction scores" || f.value.includes("per segment"),
    ),
  );
  const [empty] = embeds({ failed: false }, c, now);
  assert.equal(empty!.timestamp, undefined);
  assert.equal(
    empty!.footer!.text,
    "Created by joinunn.com | Awaiting first update",
  );
});
