# Sgt Puppers

A small, read-only Wardogs Discord status bot. TypeScript, Node.js 24, discord.js 14.

- Presence: `NA1 | 0/100 | Bakurani`.
- `/status` creates one persistent, self-updating panel per channel. Reusing the command returns its link.
- English match details, player count, UUID join code in a copyable code block, next map, and faction scores with emblem images.
- Bakurani, Ozeti, and Zestafona display names, including aliases for the API's internal/older names.
- One shared status request every minute. Rotation and join code refresh every five minutes, with cached catalogs, serialized requests, timeouts, and backoff.
- Panels survive restarts through a small JSON state file. No database or inbound ports.

## Deploy

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications). Invite it with the `bot` and `applications.commands` scopes. Grant **View Channel, Send Messages, Embed Links, Read Message History** in your status channel. No privileged intents or Administrator permission are needed.
2. Point your Docker host at this repository on `main`, using **`compose.yaml`** or **`Dockerfile`** at the repository root.
3. Supply the environment values listed below through your host's environment editor or env file. Use `.env.example` as the template. Compose accepts the host's injected variables or a local `.env`; it does not require an env file in the Git checkout.
4. Deploy. The container automatically registers `/status` and starts the bot. There are no install, registration, or startup commands to run manually.
5. Run `/status` in Discord with **Manage Server** permission to create the public status panel.

**Compose:** builds the image, restarts the service, and mounts the `bot-data` named volume automatically. Use a Docker Compose deployment capable of building from the repository (not a Swarm stack that ignores `build`).

**Dockerfile:** keep its default start command, supply the same environment variables, and mount a persistent volume at **`/app/data`**. Configure restart-on-failure or unless-stopped in your host. The container runs as UID/GID 1000; a bind-mounted directory must be writable by that user.

No domain, reverse proxy, or exposed port is needed. Allow outbound HTTP to Wardogs and HTTPS/WebSocket access to Discord. Redeploy after changing environment values. Command registration upserts only `/status`, preserving other commands.

## Environment

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Bot token (required) |
| `DISCORD_APPLICATION_ID` | Application ID (required) |
| `DISCORD_GUILD_ID` | Discord guild ID (required) |
| `WARDOGS_URL` | HTTP(S) origin, e.g. `http://192.0.2.1:20026` (required) |
| `WARDOGS_PASSWORD` | RCON bearer password (required) |
| `SERVER_LABEL` | Short presence label, default `NA1`; distinct from the UUID join code |
| `DATA_DIR` | State directory; Compose sets `/app/data` |
| `BANNER_URL` | Optional HTTP(S) banner image |
| `LONESTAR_EMOJI`, `VALKYRA_EMOJI`, `MANTICORE_EMOJI` | Optional custom emoji strings, e.g. `<:lonestar:123456789012345678>` |
| `LONESTAR_ICON_URL`, `VALKYRA_ICON_URL`, `MANTICORE_ICON_URL` | Optional HTTP(S) image overrides |

Default faction images come from the community [Wardogs Handbook faction page](https://wardogshandbook.com/Factions): [Lonestar](https://wardogshandbook.com/images/Factions/Lonestar.webp), [Valkyra](https://wardogshandbook.com/images/Factions/valkyra.webp), [Manticore](https://wardogshandbook.com/images/Factions/manticore.webp). These are remotely hosted game emblems, not bundled assets or an endorsement. You can point the env variables at your own hosted copies. A custom emoji overrides that faction's image; use emoji accessible to the bot. External guild emoji may require Use External Emojis permission.

## Failure handling

The bot allows only a narrow set of GET endpoints. It never issues configuration, moderation, or gameplay commands. Requests have ten-second timeouts and at least five seconds between calls. A 429 response pauses all Wardogs requests, honoring `Retry-After`; failures otherwise use approximately 1, 2, 4, then 5-minute retry delays. Discord publishing runs independently.

A failed status read marks the last snapshot **Stale**; five minutes without fresh status shows **Unavailable**. This does not claim the game server itself is offline. Last-known values and their original timestamp remain visible. Join-code and rotation freshness are tracked separately. Missing match duration and score caps stay absent; the bot never assumes that player capacity is a score cap.

401/403 pauses Wardogs polling until you correct the env file and restart. Unsupported optional endpoints are disabled until restart. Deleted panels are removed from state. Permission failures suspend the affected panel; fix permissions and invoke `/status` again, or restart, to resume it. Transient Discord errors retry after a minute.

Back up the data volume to retain panel registrations. Do not share a writable state volume between bot replicas. For now, use one process and one server; state registrations include the server endpoint and the poller is server-scoped, leaving room for a later multi-server configuration without introducing it yet.

## Validation

The Docker build compiles TypeScript and runs fixture tests before producing the runtime image. Tests never contact the live server or Discord. The runtime image excludes development dependencies and env files.

See [API catalog](docs/wardogs-api.md) and [implementation design](docs/implementation-plan.md). The API catalog distinguishes advertised endpoints from those actually read during research.
