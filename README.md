# Sgt Puppers

A read-only Wardogs Discord bot with live player-count presence and a self-updating server status panel. Shows the current and next map, server join ID, and faction scores. Updates approximately once a minute.

## Deploy

1. Create a bot in the [Discord Developer Portal](https://discord.com/developers/applications). Invite it with the `bot` and `applications.commands` scopes. Grant **View Channel**, **Send Messages**, **Embed Links**, and **Read Message History** in your status channel. No privileged intents are needed.
2. Deploy this repository using **`compose.yaml`** in Dokploy or another Docker Compose host that supports building images.
3. Set the required environment variables below, using [.env.example](.env.example) as a template. Your host's environment settings or an env file can supply them.
4. Deploy, then run **`/status`** in Discord. Commands register automatically on startup.

Compose manages the persistent `bot-data` volume automatically. Keep this volume when redeploying to preserve status-panel registrations. No exposed ports or reverse proxy are required.

For **Dockerfile-only** deployments, mount a persistent named volume at `/app/data`, supply the same environment variables, and configure a restart policy.

## Configuration

| Required variable | Value |
| --- | --- |
| `DISCORD_TOKEN` | Discord bot token |
| `DISCORD_APPLICATION_ID` | Discord application ID |
| `DISCORD_GUILD_ID` | Discord server ID |
| `WARDOGS_URL` | Wardogs RCON HTTP(S) address, including port |
| `WARDOGS_PASSWORD` | Wardogs RCON password |

Optional settings in [.env.example](.env.example):

- **`SERVER_LABEL`** — short presence label; defaults to `NA1`.
- **`DISCORD_COMMAND_ROLE_ID`** — allows administrators or members with this role to use slash commands. When blank, **Manage Server** is required.
- **`BANNER_URL`** — banner image URL. Defaults to the included banner; set blank to hide it.
- **Faction emoji/image overrides** — customize the faction emblems. Defaults use [bundled faction icons](assets/factions); no external image host is required.

Redeploy after changing configuration. Use one bot instance per Wardogs server.

## Usage

Run `/status` to create a public status panel in the current channel. Running it again returns the existing panel's link. Panels resume updating after restarts.

If a panel is deleted, run `/status` to recreate it. If channel permissions change, restore them and run `/status` again or restart the bot.

When the server API is unreachable, the panel retains the last known data and marks it stale. Repeated failures trigger retry backoff. Check container logs for authentication or permission errors.

See the [Wardogs API reference](docs/wardogs-api.md) for endpoint details.
