# Private rooms + join by code - implementation plan

Branch: `feat/private-rooms` (off `develop`)

## Goal
- Every room gets a real, shareable **code** (6 chars). The code shown in the
  waiting popup is copyable and actually works.
- **Join Game** lets you paste a code and join that room (public or private).
- Rooms are **public** (appear in the lobby, also joinable by code) or
  **private** (do NOT appear in the lobby, joinable only by code).

## Design
The code is a stored, unique, indexed column - not derived from the UUID (the
old `formatRoomCode` was display-only and not reversible). Every room gets one
so it can always be shared. Join-by-code is a two-step client flow so staked
games can still show the stake confirm before money moves:
1. `GET /games/rooms/by-code/:code` resolves the code to a pending room summary.
2. The client then runs the **existing** join path (`joinGameRoom(id)` +
   staked confirm + funding overlay), so nothing about staking is duplicated.

Code alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I/O/0/1), length 6.
Generated server-side with collision retry.

## Server
1. Entity `game-room.entity.ts`: add
   - `code` `varchar` nullable, `@Index(unique)` (partial - where not null),
   - `isPrivate` `boolean NOT NULL default false`.
2. Migration (`> 1783600000001`): `ALTER TABLE game_rooms ADD "code" varchar`,
   `ADD "is_private" boolean NOT NULL DEFAULT false`, unique index on `code`.
3. `CreateGameRoomDto`: add `isPrivate?: boolean`.
4. `GamesService.createRoom`: accept `isPrivate`, generate a unique code
   (retry on collision via `findGameRoomByCode`), pass both to db.
5. `DbService.createGameRoom`: accept `code` + `isPrivate`.
6. `DbService.findGameRoomByCode(code)`: pending room by code (not cached; it is
   a one-off lookup).
7. `DbService.findPendingGameRooms`: add `isPrivate: false` to the where clause
   so private rooms never hit the lobby.
8. `GamesService.getRoomByCode(code)`: normalize (trim/upper), find pending room,
   404 if none; return summary.
9. Controller: `@Get('by-code/:code')`; thread `isPrivate` through create.
10. `toGameRoomSummary`: include `code` + `isPrivate`.

## Core
- `GameRoomSummary`: add `code: string | null`, `isPrivate: boolean`.
- `api-client`: `createGameRoom(gameType, stake?, isPrivate?)`;
  new `getGameRoomByCode(code)`.

## Mobile
- `CreateGameRoomModal`: pass `isPrivate` to `createGameRoom`; reword the toggle
  subtitle ("Hidden from the lobby - share the code to invite").
- `WaitingForPlayersPopup`: show `waitingRoom.code`; make the ROOM box a
  Pressable that copies the code (Clipboard + confirm toast); share message uses
  the real code; small "Private" hint when `isPrivate`.
- `WaitingForPlayersMinimizedBar`: show `waitingRoom.code`.
- Lobby `GameLobyScreen`:
  - Replace `handleJoinGame` with a `JoinByCodeSheet` (BottomSheet + code input +
    Paste + Join). On resolve: close sheet, then run the existing `handleJoin`
    (serialized to avoid the modal-stacking wedge - see the overlay-blocked
    report).
  - Lobby cards + ResumeMatchModal show `room.code ?? formatRoomCode(room.id)`.
- `room-code.ts`: keep `formatRoomCode` only as a fallback for legacy/null codes.

## Verify
- Create public room -> shows in lobby, has code, code copies.
- Create private room -> NOT in lobby; joinable by pasting the code.
- Join by code for a staked room still shows the stake confirm + funding overlay.
- Typecheck mobile + server + core.
