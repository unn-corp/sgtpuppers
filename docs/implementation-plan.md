# Initial bot — approved and implemented

## Stack and scope

TypeScript, Node.js 24 LTS, current stable discord.js 14, npm lockfile, built-in fetch and node:test. Verify the selected stable package's exact Node requirement when installing. One long-running process, one Wardogs server, one Discord guild initially. A small JSON state file is sufficient; no database, web dashboard, or web server is needed.

References: [Node releases](https://nodejs.org/en/about/previous-releases), [discord.js](https://discord.js.org/docs/packages/discord.js/14.22.1), [Discord interaction lifetime](https://docs.discord.com/developers/interactions/receiving-and-responding). Discord requires an initial interaction response within three seconds and interaction tokens expire after 15 minutes. Persistent panels therefore use ordinary bot-authenticated channel messages and saved message IDs.

## User-facing behavior

- Presence: `NA1 | 0/100 | Bakurani`, updated when values change.
- `/status`: create a public, self-updating English status panel in the invoking channel. Default command permission: Manage Guild; optional DISCORD_COMMAND_ROLE_ID replaces it with an Administrator-or-configured-role requirement for all slash commands. One panel per channel; repeated invocation returns its link rather than creating duplicates. Guild-only.
- Panel fields: server name, Online/Stale/Unavailable, Join code, current map/mode/weather/zone, players, next map, faction scores, last successful update timestamp. Fetch the UUID join code from `/v1/server-id` and display it in a fenced code block for easy copying, preserving the full value. Match duration appears only when supplied by the API. Support an optional banner URL; do not copy third-party branding from the screenshot.
- Use standard embed fields and one unified status embed with application-owned faction emoji sourced from the community Wardogs Handbook, twenty-segment bars on a 100-point display scale, and the banner below all fields; env-configured custom emoji or source image URLs can override the emblems. The user requested a fixed 100-point visual scale, with one filled segment per complete 5 points; this is not a confirmed server win condition. Numeric scores remain exact beyond 100.
- Persist guild/channel/message IDs and catalog cache via serialized, atomic JSON writes. Resume editing after restart. A deleted panel is unregistered; invoking the command can recreate it. Permission failures suspend that panel with a clear log, without stopping polling or other panels.
- Request only Guilds intent and View Channel, Send Messages, Embed Links, Read Message History permissions. No privileged intents or Administrator permission.

## Polling and failures

- One shared scheduler and cached snapshot for presence and every panel; commands never trigger their own Wardogs request bursts.
- Poll status every 60 seconds. Refresh rotation every five minutes and after a map/rotation-index change, using the same serialized request queue. Cache catalogs for 24 hours; fetch incrementally at startup with spacing. Read capabilities on startup to detect unsupported optional fields/routes.
- Fetch the join code on startup, every five minutes, and after status connectivity recovers, through the same queue. If unavailable, show Unavailable or explicitly mark a cached code as stale; a failed join-code request must not prevent status updates.
- At most one request in flight, ten-second timeout, and five-second minimum spacing between requests. No overlapping timer cycles or accumulated catch-up work.
- On HTTP 429, honor Retry-After if supplied (seconds or HTTP date). Otherwise, and for timeouts/5xx, defer the server queue using 1, 2, 4, then 5-minute backoff with jitter; server Retry-After may exceed that cap. Resume normal cadence after recovery. No immediate retry loops.
- Authentication errors produce a clear configuration failure and suspend polling until restart/config correction. Unsupported optional endpoints are disabled for the session; a broken optional catalog must not prevent core status updates. Validate core response fields and retain last good data on malformed responses.
- On a failed status read, mark cached data stale immediately and retain its original timestamp and values. After five minutes without a successful status read show Unavailable, not a false claim that the game server is offline. Missing data never becomes a false zero player count. A rotation failure marks next-map data independently stale.
- Discord failures/backoff are separate from Wardogs polling. Let discord.js handle Discord rate limits. Edit existing messages without mentions; refresh last-success timestamp on successful polls, and only change presence when its text/state changes.

## Implementation sequence

1. Set up this directory as the local project/repository, checking its existing Git state first. Add package scripts, TypeScript config, .gitignore, .env.example, and setup instructions. No remote or push.
2. Implement a narrow GET-only Wardogs client, response validation, alias handling, shared poller and cache. Keep the API catalog as documentation; do not implement moderation or config-write methods.
3. Add Discord presence, `/status`, panel rendering, and durable panel registration. Acknowledge/defer the command promptly, then post an ordinary bot message and save its IDs.
4. Add focused fixture tests for real response shape, missing duration/cap, internal map names, unknown maps, 429/backoff/timeouts, stale recovery, shared polling, and persistence/deleted-message behavior.
5. Run build/type checks and tests against mocked APIs. Provide a minimal Dockerfile/Compose service with persistent data volume, with env-based Docker-host startup instructions. Any deployment or live Discord posting waits for the relevant credentials and authorization.

Configuration: Discord token, application ID, guild ID, Wardogs URL/password, and optional banner URL. The join code is discovered automatically. Local .env can hold the supplied RCON password; keep it out of tracked files and routine logs. The public research documents do not contain it.

Approved by the user on 2026-09-14, with Docker/env-file deployment, confirmed map names Bakurani/Ozeti/Zestafona, faction icons where available, and simplified presence. Implemented locally; Discord registration happens automatically at container startup; deployment is described in README.md.
