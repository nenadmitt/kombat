# Gaming platform monorepo

Realtime multiplayer mini-games (Battleship first) with optional on-chain
stakes. npm workspaces + turbo.

## Layout

- `apps/mobile` - React Native app (React Navigation, Skia/Reanimated for the
  game boards, socket.io client, custodial-wallet UI). Has its own
  `CLAUDE.md` with UI conventions - follow it for any mobile work.
- `apps/server` - NestJS monolith: REST API (`/api/v1`), socket.io gateways
  (auth'd by the same JWT as HTTP), TypeORM/Postgres entities, Redis-backed
  cache for live match state, deadline sweepers for turn/setup timeouts, and
  the staking/escrow chain service (operator hot key, stake sweeper).
- `packages/core` - platform-agnostic shared domain code: game rules
  (`games/battleship`: fleet, mines, power-ups, shot resolution), the
  socket protocol types shared by server and mobile, stake helpers.
  **Consumed via `dist/`** - after editing core, run
  `npm run build --workspace @gaming-platform/core` (or `npm run typecheck`
  at the root, which builds it) or the apps keep seeing stale code.

Key flows: match state lives in the cache (Redis when `REDIS_URL` is set,
in-memory fallback otherwise - single instance only); every gameplay mutation
runs under a per-room cache lock; socket broadcasts go through
`WebsocketsService.sendToUser/sendToChannel`. With Redis configured, the
socket.io Redis adapter (`main.ts`) relays broadcasts across instances.

## Bugs and inconsistencies (BAI)

When you notice a bug, dead code, or an inconsistency that is NOT part of the
task you were asked to do: do not silently fix it and do not ignore it. Log
it in `bugs-and-inconsistencies/` at the repo root, in the file for its area
(`SERVER.BAI.md`, `MOBILE.BAI.md`, `CORE.BAI.md` - create the file if
missing). Append an entry with the date, a one-line summary, the file/line,
why it's wrong, and a suggested fix. Mention it to the user in your summary.
Only fix it when the user asks; remove the entry in the same change that
fixes it.

## Comments

Write a comment only when it states something the code cannot: a non-obvious
constraint, a why, a protocol/ordering requirement, a deliberate trade-off.
Match the surrounding style (this codebase favors short "why" comments on
tricky seams). Never narrate what the next line does, never leave
change-log-style comments ("now uses X", "added for feature Y"), and never
comment to justify your change to a reviewer.
