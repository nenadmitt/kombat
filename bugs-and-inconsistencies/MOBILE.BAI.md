# MOBILE - bugs and inconsistencies

Entry format: date, one-line summary, location, why it's wrong, suggested
fix. Remove an entry in the same change that fixes it.

## 2026-07-17 - Multiplayer Ludo seats show color names, not usernames

- **Where:** `apps/mobile/src/games/ludo/useMultiplayerLudo.ts` (`nameOf`,
  seat building).
- **Why it's wrong:** opponents render as "Green"/"Yellow" because the match
  snapshot (`LudoRoomState.players`) carries only userIds and colors - the
  server never exposes usernames for match participants.
- **Suggested fix:** include usernames in `LudoRoomState.players` (server
  joins the users table once at snapshot time), then render them in the HUD
  and result screen. Battleship has the same gap ("Opponent").

## 2026-07-17 - Ludo captures stat resets on reconnect

- **Where:** `apps/mobile/src/games/ludo/useMultiplayerLudo.ts`
  (`myCaptures` accumulates from pushes only).
- **Why it's wrong:** the REST snapshot has no capture history, so a
  mid-match reconnect zeroes the result-screen CAPTURES stat.
- **Suggested fix:** track per-player capture counts in the server match
  state and expose them in the snapshot + moved payloads (same pattern as
  battleship's volley stats).
