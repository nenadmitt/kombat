# Mobile Improvements 01 - Implementation Plan

Branch: `feat/mobile-improvements-01`

## 0. Fresh start (DB reset)
Truncate `game_rooms` and `stake_escrows` so history starts clean. Keeps
`users` / `wallets`. Done via the local gaming-platform-postgres container.

Root-cause note for the "VOIDED with free stake" report: the 29 completed
rooms in the DB had `winner_user_id = NULL` and `end_reason = NULL`. Those are
stale pre-migration rooms (migration `1783600000000-AddGameRoomStakes` notes
that winner/end_reason/completed_at were never persisted before it landed). The
two recent staked matches recorded winner + settled escrow correctly, and the
history mapping in `games.service.getHistory` is sound. Wiping clears the noise.

Latent race worth flagging (not in scope here): `handleFundingFailure` writes
`winnerUserId: null` and forfeit is allowed on an InProgress room whose escrow
is still Funding, so a decided winner could be nulled if funding then fails.
Also escrow settlement never reconciles back into `game_rooms`.

## 1. History - proper feed + infinite scroll
- core `ApiClient.getMatchHistory(limit?, offset?)` - query params.
- server `GET /games/rooms/history` accepts `limit` / `offset` (new DTO);
  `GamesService.getHistory(userId, limit, offset)`;
  `DbService.findCompletedGameRoomsForUser(userId, limit, offset)` adds `skip`.
- mobile `HistoryScreen` -> `FlatList`, initial 10, load 8 more on `onEndReached`
  until a short page comes back. Stat tiles become the list header.

## 2. Reusable confirmation bottom sheet
- `ConfirmProvider` + `useConfirm()` imperative hook returning `Promise<boolean>`.
- Bottom sheet chrome (reuse `BottomSheet`), destructive tone, optional
  info-only single-button variant.
- Mounted in `App.tsx`. Replaces every `Alert.alert` confirmation/notice.

## 3. Fun staking loading overlay
- `StakeFundingOverlay` with rotating playful copy (no escrow / on-chain /
  transaction wording). Used by the lobby funding overlay and the creator-side
  waiting popup.

## 4. Em-dashes
- Replace all `-` (U+2014) with `-` across `apps/mobile/src`.
- Add a "never use em-dashes" rule to `apps/mobile/CLAUDE.md`.

## 5. Asset selector + typeable amount
- "Betting asset" label -> "Asset".
- Per-asset icon in each chip (free = gift, USDC = dollar, KOMBAT = swords,
  ETH = gem). Add a `dollar` icon to `Icon.tsx`.
- Extend `Stepper` with an `editable` mode: the value box becomes a numeric
  `TextInput`, keeping the -/+ buttons.
