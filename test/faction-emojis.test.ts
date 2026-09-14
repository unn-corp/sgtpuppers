import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareFactionEmojis } from "../src/faction-emojis.js";
import type { Config } from "../src/config.js";
const config = () =>
  ({
    emojis: { lonestar: "", valkyra: "", manticore: "" },
    icons: {
      lonestar: "https://example.com/l.webp",
      valkyra: "https://example.com/v.webp",
      manticore: "https://example.com/m.webp",
    },
  }) as unknown as Config;
test("emoji setup reuses existing emblems, preserves overrides and creates only missing ones", async () => {
  const c = config();
  c.emojis.valkyra = "<:custom:123>";
  let downloads = 0;
  const created: string[] = [];
  await prepareFactionEmojis(
    {
      fetch: async () =>
        new Map([
          [
            "1",
            {
              name: "wardogs_lonestar",
              toString: () => "<:wardogs_lonestar:1>",
            },
          ],
        ]),
      create: async ({ name }) => {
        created.push(name);
        return { name, toString: () => "<:wardogs_manticore:2>" };
      },
    },
    c,
    async () => {
      downloads++;
      return "data:image/webp;base64,dGVzdA==";
    },
  );
  assert.equal(c.emojis.lonestar, "<:wardogs_lonestar:1>");
  assert.equal(c.emojis.valkyra, "<:custom:123>");
  assert.equal(c.emojis.manticore, "<:wardogs_manticore:2>");
  assert.deepEqual(created, ["wardogs_manticore"]);
  assert.equal(downloads, 1);
});
test("emoji download or API failure does not prevent startup or other factions", async () => {
  const c = config();
  let loads = 0;
  await prepareFactionEmojis(
    {
      fetch: async () => new Map(),
      create: async ({ name }) => ({ name, toString: () => `<:${name}:1>` }),
    },
    c,
    async () => {
      if (++loads === 1) throw new Error("unavailable");
      return "data:image/webp;base64,dGVzdA==";
    },
  );
  assert.equal(c.emojis.lonestar, "");
  assert.ok(c.emojis.valkyra);
  assert.ok(c.emojis.manticore);
  await prepareFactionEmojis(
    {
      fetch: async () => {
        throw new Error("Discord unavailable");
      },
      create: async () => {
        throw new Error("unexpected");
      },
    },
    config(),
  );
});

test("default icons upload bundled WebP files without an external image host", async () => {
  const c = config();
  c.icons = { lonestar: "", valkyra: "", manticore: "" };
  const created: string[] = [];
  await prepareFactionEmojis(
    {
      fetch: async () => new Map(),
      create: async ({ name, attachment }) => {
        assert.ok(attachment.startsWith("data:image/webp;base64,"));
        const bytes = Buffer.from(attachment.split(",")[1]!, "base64");
        assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
        assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
        assert.ok(bytes.length <= 256 * 1024);
        created.push(name);
        return { name, toString: () => `<:${name}:1>` };
      },
    },
    c,
  );
  assert.deepEqual(created, [
    "wardogs_lonestar",
    "wardogs_valkyra",
    "wardogs_manticore",
  ]);
});
