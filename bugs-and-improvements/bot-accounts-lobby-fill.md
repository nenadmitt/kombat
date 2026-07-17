# Bot accounts that fill slow lobbies (free + KOMBAT games)

Investigation notes (2026-07-17). Question: can we create server-side "bot"
accounts that join free or KOMBAT-staked lobby rooms when no human joins in
time? We already have bot logic — how much is reusable, what's missing, and
what are the risks? No code written; investigation only.

## TL;DR

Feasible with modest effort, and the architecture is unusually well shaped
for it. The gateway is a thin shell — every gameplay mutation already goes
through `BattleshipMatchService`, which any server-side driver can call
without a socket or JWT. The existing `BattleshipBot` (core) supplies the
aiming AI, `randomFleet()`/`randomMines()` supply setup, and the deadline
sweeper is a proven template for both triggers we need ("room waited too
long → join" and "bot's turn → fire after a human-like delay"). The hard
part is not engineering; it's policy: for KOMBAT games the bot stakes and
wins/loses *real tokens* from a treasury-funded custodial wallet, which
raises bankroll, bot-farming, and disclosure questions that need product
decisions before build.

## What already exists

- **Bot AI** — `packages/core/src/games/battleship/battleship.bot.ts`.
  Hunt/target with parity search, bomb power-up usage. Today only the mobile
  demo mode uses it (`apps/mobile/src/games/battleship/game/useDemoBattleship.ts`);
  the server does not reference it at all. Its aiming is fair: it takes the
  true opponent fleet but only uses it to resolve shots and to know which
  hits belong to already-sunk ships (information a real player also has).
- **Fleet setup** — `randomFleet()` and `randomMines()` in
  `packages/core/src/games/battleship/battleship.rules.ts`. Bot setup is a
  one-liner.
- **Server-side playability** — `BattleshipGateway` holds no logic; it just
  authenticates the socket and forwards to `BattleshipMatchService`
  (`getOrCreate`, `setFleet`, `fire`, `forfeit`, `setPresence`). A bot
  driver calls the same methods with the bot's userId. Broadcasts go through
  `WebsocketsService.sendToChannel`, so the human opponent sees bot moves on
  any instance (Redis adapter relays them). **The bot never needs a socket
  connection, a JWT, or any auth path.**
- **Restart-safe scheduling** — `BattleshipDeadlineSweeper` +
  the `bs:deadlines` Redis ZSET (`cache/stores/cache-store.ts`). Member
  format is `{roomId}|{kind}|{seq}`; `popDueDeadlines` is atomic, so exactly
  one instance acts on a member. Adding new kinds (`bot-join`, `bot-move`)
  is a small extension of `deadlineMember`/`parseDeadlineMember` (unknown
  kinds are currently dropped as malformed, so the change is backward-safe).
- **Join flow reuse** — `GamesService.joinRoom(botUserId, roomId)` already
  does everything a bot join needs: Pending check, balance check for staked
  rooms, `game:opponent-joined` to the creator for free rooms, and
  `StakesService.beginFunding` (escrow both stakes, gate match start on
  Funded) for staked rooms. Zero changes to the join path itself.
- **Custodial wallets** — `WalletsService.createWallet` generates a
  platform-held wallet (encrypted key in DB) and `prepareWalletForStaking`
  gas-dusts it and pre-approves the escrow for ERC20 assets (KOMBAT/USDC).
  A bot account gets a wallet exactly like a human account.

## What's missing (the build list)

1. **Bot identity.** `users` has no `is_bot` flag — just email + username.
   Bots need real user rows (opponents see the username in match history).
   Add an `is_bot` column (or a config list of bot user IDs) so the lobby
   query, matchmaking policy, analytics, and any UI disclosure can tell them
   apart. Plus a seed/provisioning script: N bot users, each with a wallet;
   KOMBAT + gas topped up from the operator/treasury.
2. **Lobby-fill trigger.** Nothing times out a Pending room today (the
   deadline schedule only covers setup/turn). Two options:
   - *Schedule-based:* on `createRoom` for a public free/KOMBAT room, push a
     `bot-join` member with score `now + N seconds`; sweeper pops it,
     re-checks the room is still Pending and public, picks a bot, calls
     `joinRoom`. Matches the existing architecture, exactly-once by design.
   - *Poll-based:* a sweeper scans Pending public rooms older than N via a
     `findPendingGameRooms`-style query. Simpler, no schema change to the
     deadline member, but needs its own multi-instance lock.
   Schedule-based is the better fit. Either way, bots must only join rooms
   that are public, not bot-created, and whose stake asset is null or KOMBAT
   (never ETH/USDC unless the policy says so).
3. **Bot match driver.** A service that, for rooms where one participant is
   a bot:
   - after join (and, for staked rooms, after escrow reaches Funded —
     re-check `assertRoomPlayable` and retry, since funding is async), calls
     `matchService.getOrCreate` + `setFleet(roomId, botId, randomFleet(), randomMines(...))`
     and `setPresence(..., true)`, and emits the same channel events the
     gateway does (`start`/`opponentReady`);
   - schedules a `bot-move` deadline (2–5 s jitter, reads as human) whenever
     the turn flips to the bot: after `setFleet` when `firstTurnUserId` is
     the bot, after a human `fire` resolves, and after a turn timeout. The
     sweeper pops it, runs `BattleshipBot.decideMove`, and calls
     `matchService.fire` with the chosen kind/row/col.
   The existing turn-timeout sweeper is a free safety net: if the bot driver
   ever fails to move, the human wins by timeout rather than hanging.
4. **Small `BattleshipBot` adaptation.** `decideMove` was written for the
   local demo, so it *resolves* its own shots and tracks `points`/`bombsUsed`
   in instance memory. Server-side, `matchService.fire` is authoritative and
   the driver may run on any instance, so either:
   - split "choose aim/weapon" from "resolve" (choose is already a pure
     function of `(fleet, shots)`), and persist the two counters
     (`points`, `bombsUsed`) in the cached MatchState or a tiny side key; or
   - accept a stateless bot that skips power-ups (weaker, simplest).
   This is a refactor measured in tens of lines, not a rewrite.

Total: roughly one new module (`games/bots/`), one core refactor, one
migration (`is_bot`), one provisioning script, two new deadline kinds.

## Risks and policy questions (decide before building)

- **Real money.** A KOMBAT bot genuinely escrows and settles on-chain. Bot
  losses are treasury payouts to players; bot wins take players' tokens
  (platform still collects the fee bps either way). Needs bankroll
  monitoring, per-bot stake caps (a bot-specific max well under `STAKE_MAX`),
  and auto-pause when a bot wallet runs dry — `assertSufficientBalance`
  already refuses the join, but silently, so lobby-fill would just stop.
- **Bot farming.** The current bot places ships randomly and hunts with
  parity — decent, but a skilled player beats it reliably. Against staked
  bots that is a token faucet: grind min-stake games vs the bot, extract
  treasury KOMBAT. Mitigations: bots default to free games only; if staked
  fill is wanted, min stakes only + per-user daily cap on bot matches +
  win-rate monitoring per user.
- **Disclosure.** Playing for real tokens against an undisclosed house bot
  is a fairness/trust problem (and potentially a legal one, depending on
  jurisdiction). Free games: common practice, low risk. Staked games:
  strongly consider labeling ("house player") or at minimum an explicit
  product decision to accept the risk.
- **Join race.** `dbService.joinGameRoom` is an unconditional UPDATE — a bot
  and a human joining simultaneously can silently evict each other. Small
  window today, real once automation joins rooms. Logged in
  `bugs-and-inconsistencies/SERVER.BAI.md`; fix (conditional UPDATE) should
  land with or before the bot work.
- **Concurrency per bot account.** `joinRoom` never checks whether the
  *joiner* already has an active room, so one bot user could technically
  play many matches at once. Fine mechanically (the driver is server-side),
  but reusing one identity everywhere looks fake and skews history. A small
  pool of bot accounts with varied usernames, allocated round-robin from the
  idle set, reads better.

## Ludo / future games

The trigger and driver split cleanly: the lobby-fill sweeper is
game-agnostic (it only needs "this game type has a bot driver"), while the
driver is per-game. With Ludo Royale incoming (and `getPlayerCountForGameType`
already supporting >2 players), lobby fill gets *more* valuable — a 4-player
room can wait for the last seat and be topped up with 1–3 bots. Worth
defining the driver as an interface from day one
(`canFill(room)`, `onJoined`, `onTurn`), with Battleship as the first
implementation; the in-progress `packages/core/src/games/turn-based.ts`
generic layer looks like the natural home for the shared turn hooks.
