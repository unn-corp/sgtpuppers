# Sgt Puppers

A small, read-only Wardogs Discord status bot. TypeScript, Node.js 24, discord.js 14.

- Presence: `NA1 | 0/100 | Bakurani`.
- `/status` creates one persistent, self-updating panel per channel. Reusing the command returns its link.
- English match details, player count, UUID join code in a copyable code block, next map, and faction scores with inline emblems and twenty-segment progress bars (5 points each, 100-point display scale). One unified embed keeps the sections the same width, with the banner below the scores.
- Bakurani, Ozeti, and Zestafona display names, including aliases for the API's internal/older names.
- One shared status request every minute. Rotation and join code refresh every five minutes, with cached catalogs, serialized requests, timeouts, and backoff.
- Panels survive restarts through a small JSON state file. No database or inbound ports.

## Deploy

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications). Invite it with the `bot` and `applications.commands` scopes. Grant **View Channel, Send Messages, Embed Links, Read Message History** in your status channel. No privileged intents or Administrator permission are needed.
2. Point your Docker host at this repository on `main`, using **`compose.yaml`** or **`Dockerfile`** at the repository root.
3. Supply the environment values listed below through your host's environment editor or env file. Use `.env.example` as the template. Compose accepts the host's injected variables or a local `.env`; it does not require an env file in the Git checkout.
4. Deploy. The container automatically registers `/status` and starts the bot. There are no install, registration, or startup commands to run manually.
5. Run `/status` in Discord with the configured command role (or **Manage Server** permission when no role is configured) to create the public status panel.

**Compose (recommended):** builds the image, restarts the service, and automatically creates and mounts the Docker-managed `bot-data` named volume at `/app/data`, matching `DATA_DIR`. No bind mount, host directory, or manual volume setup is required. The volume preserves panel registrations across container recreation and redeployment; do not delete it when updating the bot. Use a Docker Compose deployment capable of building from the repository (not a Swarm stack that ignores `build`).

**Dockerfile only:** keep its default start command and supply the same environment variables. Configure a persistent named volume at **`/app/data`** and a restart policy in your Docker host's UI. Use Compose above to have the repository configure these automatically.

No domain, reverse proxy, or exposed port is needed. Allow outbound HTTP to Wardogs and HTTPS/WebSocket access to Discord. Redeploy after changing environment values. Command registration upserts only `/status`, preserving other commands.

## Environment

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Bot token (required) |
| `DISCORD_APPLICATION_ID` | Application ID (required) |
| `DISCORD_GUILD_ID` | Discord guild ID (required) |
| `DISCORD_COMMAND_ROLE_ID` | Optional role required for **all slash commands**. Blank retains Manage Server access. When set, role holders need no Manage Server permission; even administrators must hold the role. |
| `WARDOGS_URL` | HTTP(S) origin, e.g. `http://192.0.2.1:20026` (required) |
| `WARDOGS_PASSWORD` | RCON bearer password (required) |
| `SERVER_LABEL` | Short presence label, default `NA1`; distinct from the UUID join code |
| `DATA_DIR` | Set automatically to `/app/data`, backed by the `bot-data` named volume in Compose; no configuration needed |
| `BANNER_URL` | Defaults to the repository’s `assets/banner.webp` in Compose and `.env.example`. Set an empty value to hide the banner, or supply another HTTP(S) image URL. |
| `LONESTAR_EMOJI`, `VALKYRA_EMOJI`, `MANTICORE_EMOJI` | Optional custom emoji strings, e.g. `<:lonestar:123456789012345678>` |
| `LONESTAR_ICON_URL`, `VALKYRA_ICON_URL`, `MANTICORE_ICON_URL` | Optional HTTP(S) image sources for application emoji |

Default faction images come from the community [Wardogs Handbook faction page](https://wardogshandbook.com/Factions): [Lonestar](https://wardogshandbook.com/images/Factions/Lonestar.webp), [Valkyra](https://wardogshandbook.com/images/Factions/valkyra.webp), [Manticore](https://wardogshandbook.com/images/Factions/manticore.webp). On startup the bot reuses or creates three application-owned emoji (`wardogs_lonestar`, `wardogs_valkyra`, `wardogs_manticore`) from these images. They require no extra guild permissions or guild emoji slots. Setup failures fall back to colored squares without stopping the bot. Existing application emoji are reused; to replace an image, remove its emoji in the application settings before restarting, or set a custom emoji override. These are remotely hosted game emblems, not bundled assets or an endorsement. Custom emoji overrides take precedence; use emoji accessible to the bot. External guild emoji may require Use External Emojis permission.

## Slash-command access

Set `DISCORD_COMMAND_ROLE_ID` to a role ID copied using Discord Developer Mode, then redeploy. The runtime check applies before command dispatch, in the configured guild only. With a role configured, command registration removes the Manage Server default so ordinary role holders can use commands. Other members may see commands but are denied privately; you can also restrict their visibility in Discord’s integration settings. Existing Discord-side command/channel restrictions still apply. Leave the value blank to retain the original Manage Server requirement.

## Failure handling

The bot allows only a narrow set of GET endpoints. It never issues configuration, moderation, or gameplay commands. Requests have ten-second timeouts and at least five seconds between calls. A 429 response pauses all Wardogs requests, honoring `Retry-After`; failures otherwise use approximately 1, 2, 4, then 5-minute retry delays. Discord publishing runs independently.

The footer uses Discord’s native timestamp for the last successful update, displayed in each viewer’s local time beside `Created by joinunn.com | Updated`.

A failed status read marks the last snapshot **Stale**; five minutes without fresh status shows **Unavailable**. This does not claim the game server itself is offline. Last-known values and their original timestamp remain visible. Join-code and rotation freshness are tracked separately. Missing match duration stays absent. Score bars use a fixed 100-point display scale, not a claimed server win condition. Bars clamp at 0–100 while numeric scores remain exact.

401/403 pauses Wardogs polling until you correct the env file and restart. Unsupported optional endpoints are disabled until restart. Deleted panels are removed from state. Permission failures suspend the affected panel; fix permissions and invoke `/status` again, or restart, to resume it. Transient Discord errors retry after a minute.

Back up the data volume to retain panel registrations. Do not share a writable state volume between bot replicas. For now, use one process and one server; state registrations include the server endpoint and the poller is server-scoped, leaving room for a later multi-server configuration without introducing it yet.

## Validation

The Docker build compiles TypeScript and runs fixture tests before producing the runtime image. Tests never contact the live server or Discord. The runtime image excludes development dependencies and env files.

See [API catalog](docs/wardogs-api.md) and [implementation design](docs/implementation-plan.md). The API catalog distinguishes advertised endpoints from those actually read during research.
