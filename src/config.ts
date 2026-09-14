export function config(env = process.env) {
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new Error(`Missing ${key}`);
    return value;
  };
  const url = new URL(required("WARDOGS_URL"));
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("WARDOGS_URL must be an HTTP(S) origin");
  const snowflake = (key: string) => {
    const value = required(key);
    if (!/^\d{17,20}$/.test(value)) throw new Error(`Invalid ${key}`);
    return value;
  };
  const banner = env.BANNER_URL?.trim();
  if (banner && !/^https?:\/\//.test(banner))
    throw new Error("BANNER_URL must be HTTP(S)");
  for (const key of [
    "BANNER_URL",
    "LONESTAR_ICON_URL",
    "VALKYRA_ICON_URL",
    "MANTICORE_ICON_URL",
  ]) {
    if (env[key]) {
      let image: URL;
      try {
        image = new URL(env[key]!);
      } catch {
        throw new Error(`Invalid ${key}`);
      }
      if (
        !["http:", "https:"].includes(image.protocol) ||
        image.username ||
        image.password
      )
        throw new Error(`Invalid ${key}`);
    }
  }
  return {
    token: required("DISCORD_TOKEN"),
    applicationId: snowflake("DISCORD_APPLICATION_ID"),
    guildId: snowflake("DISCORD_GUILD_ID"),
    url: url.origin,
    password: required("WARDOGS_PASSWORD"),
    label: (env.SERVER_LABEL || "NA1").slice(0, 32),
    dataDir: env.DATA_DIR || "./data",
    banner,
    icons: {
      lonestar:
        env.LONESTAR_ICON_URL ||
        "https://wardogshandbook.com/images/Factions/Lonestar.webp",
      valkyra:
        env.VALKYRA_ICON_URL ||
        "https://wardogshandbook.com/images/Factions/valkyra.webp",
      manticore:
        env.MANTICORE_ICON_URL ||
        "https://wardogshandbook.com/images/Factions/manticore.webp",
    } as Record<string, string>,
    emojis: Object.fromEntries(
      ["LONESTAR", "VALKYRA", "MANTICORE"].map((name) => [
        name.toLowerCase(),
        env[`${name}_EMOJI`]?.trim() || "",
      ]),
    ),
  };
}
export type Config = ReturnType<typeof config>;
