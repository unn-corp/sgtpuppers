import type { Config } from "./config.js";

type Emoji = { name: string | null; toString(): string };
type EmojiManager = {
  fetch(): Promise<{ values(): IterableIterator<Emoji> }>;
  create(options: { name: string; attachment: string }): Promise<Emoji>;
};

async function imageData(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok || !response.body) throw new Error("Icon download failed");
  const mime = response.headers.get("content-type")?.split(";")[0];
  if (
    !mime ||
    ![
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
      "image/avif",
    ].includes(mime)
  )
    throw new Error("Unsupported icon type");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error("Icon exceeds Discord emoji limit");
    chunks.push(chunk);
  }
  return `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`;
}

// Application-owned emoji need no extra guild permissions or guild emoji slots.
// Failure is cosmetic: preserve explicit overrides and fall back to colored squares.
export async function prepareFactionEmojis(
  manager: EmojiManager,
  c: Config,
  load = imageData,
) {
  const factions = ["lonestar", "valkyra", "manticore"].filter(
    (name) => !c.emojis[name],
  );
  if (!factions.length) return;
  try {
    const existing = [...(await manager.fetch()).values()];
    for (const faction of factions) {
      try {
        const name = `wardogs_${faction}`;
        const emoji =
          existing.find((e) => e.name === name) ||
          (await manager.create({
            name,
            attachment: await load(c.icons[faction]!),
          }));
        c.emojis[faction] = emoji.toString();
      } catch {
        console.warn(
          JSON.stringify({ event: "faction_emoji_unavailable", faction }),
        );
      }
    }
  } catch {
    console.warn(JSON.stringify({ event: "faction_emojis_unavailable" }));
  }
}
