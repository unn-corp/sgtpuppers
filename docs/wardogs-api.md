# Wardogs RCON API catalog

Researched 2026-09-14. Addresses and join UUIDs below are documentation placeholders; actual connection details remain in local environment configuration.

## Evidence and scope

Primary source: [official console client](http://rcon.wardogs.com/js/api.js), inspected as source text, not executed. Live evidence: authenticated GET requests to the supplied server at `http://192.0.2.1:20026`. Capabilities reported API `1`, build `++Wardogs+Live-CL-501228`, and the 29 routes below. Advertised support does not prove every operation works. No mutation, config read, player-list read, moderation action, or broadcast was sent.

Nine live GET requests were made: capabilities, status, maps, experiences, lightings, alternators for Bakurani, rotation, server-id, and alternators for Kavkazi. All returned 200. Discovery requests were sequential; the six-request catalog/rotation batch had five-second gaps. No retries or limit testing were performed.

## Transport

- Plain HTTP; `Authorization: Bearer <password>` on each request.
- JSON responses; mutation JSON bodies use `Content-Type: application/json`.
- Config validation/application use `text/plain`, with quoted `If-Match` revision for application.
- Advertised limits: 600 requests/minute/client IP, 65,536-byte request body. Actual throttling may differ; operational backoff remains necessary.
- User observation (2026-09-14): rate limiting caused problems previously, but this morning's patch may have improved it. That improvement is unverified; the nine successful discovery reads did not test sustained throughput. Reassess if future features need more frequent polling rather than treating the earlier throttling as a confirmed current limitation.
- Console error parser expects `{error:{code,message}}` on non-success responses. Actual error responses and Retry-After behavior were not exercised.

## Read routes

All routes below were advertised by this server. “Read” means tested here; “advertised” means deliberately not invoked.

| GET path | Purpose / response | Evidence |
| --- | --- | --- |
| `/v1/capabilities` | API/build, authentication, limits, config availability, route strings | Read |
| `/v1/status` | Name, map, experiences, lighting, alternator, players, faction scores, score tick, rotation indices | Read |
| `/v1/catalog/maps` | `{maps:[{id,displayName}],count}` | Read |
| `/v1/catalog/experiences` | `{experiences:[{id,displayName}],count}` | Read |
| `/v1/catalog/lightings` | `{lightings:[{id,displayName}],count}` | Read |
| `/v1/catalog/maps/{map}/alternators` | `{map,alternators:[{index,tag,displayName}],count}`; requires internal map ID | Read for Bakurani and Kavkazi |
| `/v1/catalog/maps/{map}/experiences` | Console expects `{experiences:[id]}` | Advertised; console source |
| `/v1/rotation` | `{enabled,mode,entries,count}`; entries contain index, map, experiences, lighting, status, zoneAlternator, denied | Read |
| `/v1/server-id` | `{serverId}`; live value is a UUID | Read |
| `/v1/players` | Console consumes name, steamId, faction, kills, deaths, cash, pingMs under `players` | Advertised; console source |
| `/v1/bans` | Console consumes steamId and optional bannedAtUtc, bannedBy, reason under `bans` | Advertised; console source |
| `/v1/reserved-slots` | Console expects `{reservedSlots:[steamId]}` | Advertised; console source |
| `/v1/sponsor` | Console expects `{imageUrl}` | Advertised; console source |
| `/v1/audit?limit=N` | Console consumes `entries` with timestampUtc, peer, sessionId, event, detail; client clamps N to 1–500 | Advertised; console source |
| `/v1/config` | Console expects revision, writable, text, sections, warnings | Advertised; console source; may contain secrets |
| `/v1/health` | Listener health; response shape not verified here | Advertised only |

## Non-GET routes — cataloged only, never called

Body descriptions are from the official console source. These operations are outside the initial bot scope.

| Method and path | Body / behavior |
| --- | --- |
| `PATCH /v1/players/{id}` | `{faction}`; console supplies Steam ID. Its change-team UI separately calls kill afterward. |
| `POST /v1/players/{id}/kick` | `{reason}` |
| `POST /v1/players/{id}/kill` | No body |
| `POST /v1/players/{id}/message` | `{message}` |
| `POST /v1/bans` | `{steamId,reason?}` |
| `DELETE /v1/bans/{steamId}` | Remove ban |
| `POST /v1/broadcast` | `{message}` |
| `POST /v1/match/end` | No body |
| `POST /v1/match/restart` | No body |
| `POST /v1/match/map` | `{map,experiences?,lighting?,zoneAlternator?}` |
| `PUT /v1/world/lighting` | `{lighting}` |
| `POST /v1/config/validate` | INI text; console describes validation; not tested, even as a dry run |
| `PUT /v1/config` | INI text and `If-Match: "revision"`; optional `force=true`, `fullApply=true`; console recognizes HTTP 412 conflict |

The current console implements next-map selection, rotation edits, reserved-slot edits, and score-tick settings by editing the configuration document. Do not mistake those UI features for independent REST endpoints. No arbitrary command execution endpoint was advertised. This inventory describes this build, not all possible future Wardogs versions.

## Observed status and display implications

At sampling time:

- Server: `[NA 1] Unnamed - discord.gg/unnamedcorp`.
- Players: `0/100`.
- Current map: `Bakurani`; experience: `Bakurani_KOTH_01`; lighting: `DayClear`.
- Alternator: `ZoneAlternator.Bakurani.Lumberyard.Circle`.
- Lonestar, Valkyra, Manticore: score 0 each, with supplied colorHex values.
- Score tick: current 24, min 18, max 30. This is not a match score cap.
- Rotation enabled, ordered, 12 entries. Status nowIndex null and nextIndex 0; entry zero marked `next`, NorthAmerica / Detroit_KOTH_01.
- `matchSeconds` and `scoreCap` were absent although the console client references them. Do not synthesize elapsed match time or use player capacity as the score denominator.
- Server ID was `00000000-0000-4000-8000-000000000001`. The user confirmed on 2026-09-14 that this exactly matches the server's new join code following the morning patch; UUID join codes replace the old short format. Fetch `serverId` from `/v1/server-id` and show it in the status embed's Join code field as a fenced code block for easy copying.

### Friendly names (updated with user confirmation)

The map catalog's displayName currently repeats its internal ID. The user confirmed the actual map names on 2026-09-14: Bakurani, Ozeti, and Zestafona. Rotation experiences retain older names; use the confirmed aliases below:

| Internal map | Experience | Proposed English name |
| --- | --- | --- |
| Kavkazi | Bakurani_KOTH_01 | Bakurani |
| Europe | Madrid_KOTH_01 | Ozeti |
| NorthAmerica | Detroit_KOTH_01 | Zestafona |

The zone tags contain Ozeti and Zestafona, consistent with the user-confirmed names. Treat Madrid and Detroit in experience IDs as legacy aliases. Use a small explicit alias map, prefer useful catalog display names when available, and preserve unknown values as a readable fallback. Decode KOTH as King of the Hill, InfantryOnly as Infantry Only, DayClear as Day Clear, and the current zone as Lumberyard Circle.

`/catalog/maps/Bakurani/alternators` returned an empty successful result; `/catalog/maps/Kavkazi/alternators` returned Default, Farmland, and Lumberyard Circle. Catalog lookups must use internal map IDs.
