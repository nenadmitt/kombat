# Gaming platform monorepo

Realtime multiplayer mini-games (Battleship, Ludo Royale) with optional
on-chain stakes. npm workspaces + turbo.

## Layout

- `apps/mobile` - React Native app (React Navigation, Skia/Reanimated for the
  game boards, socket.io client, custodial-wallet UI). Has its own
  `CLAUDE.md` with UI conventions - follow it for any mobile work.
- `apps/server` - NestJS monolith: REST API (`/api/v1`), socket.io gateways
  (auth'd by the same JWT as HTTP), TypeORM/Postgres entities, Redis-backed
  cache for live match state, one GameDeadlineSweeper for every game's
  turn/setup timeouts, and the staking/escrow chain service (operator hot
  key, stake sweeper).
- `apps/evm-contracts` - Solidity (Foundry): `StakePot`, the pooled custody
  contract players deposit into, plus the KombatCoin token;
  `apps/server/src/stake-pot/stake-pot.abi.ts` is the hand-kept ABI mirror and
  must stay in sync with it. There is no escrow contract - `MatchEscrow` and
  `escrow.abi.ts` were deleted at the pot cutover (see `STAKEPOT_CLEANUP.md`).
  The surviving `stake_escrows` table is a per-room **settlement-state** row,
  not an escrow: matches settle in the off-chain ledger.
- `packages/core` - platform-agnostic shared domain code: game rules
  (`games/battleship`: fleet, mines, power-ups, shot resolution;
  `games/ludo`: board topology, dice/turn rules, bot policy), the socket
  protocol types shared by server and mobile, the shared turn clock
  (`games/turn-based`), stake helpers. **Consumed via `dist/`** - after
  editing core, run `npm run build --workspace @gaming-platform/core` (or
  `npm run typecheck` at the root, which builds it) or the apps keep seeing
  stale code.

Key flows: match state lives in the cache (Redis when `REDIS_URL` is set,
in-memory fallback otherwise - single instance only); every gameplay mutation
runs under a per-room cache lock; socket broadcasts go through
`WebsocketsService.sendToUser/sendToChannel`. With Redis configured, the
socket.io Redis adapter (`main.ts`) relays broadcasts across instances.
Rooms: NavalBattle rooms are 2-player and start on join; Ludo rooms hold up
to 4 (`opponent_ids`), start when full or via the creator's start-early
endpoint, and eliminate players on forfeit/triple-timeout until one stands.

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

Keep comments to an absolute minimum. The default is none. Write one only when
a reader would otherwise get the code wrong, never to narrate what the code
already says.

Before writing a comment, try to make the code say it: a clearer name, a named
constant, a smaller function.

Worth writing: why a non-obvious choice was made, a constraint that lives in
another system (an external API, a chain or provider quirk), a gotcha that
looks like a mistake, the reason for a lint suppression.

Not worth writing: a summary of the next line, a doc block restating a
signature, `@param` lists repeating parameter names, file header blocks,
section divider comments, commented-out code, TODOs without an owner and a
reason.

One line, not a paragraph.
