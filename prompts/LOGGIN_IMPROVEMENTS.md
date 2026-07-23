# Offline mode + maintenance mode

Two features. Branch: `feat/offline-and-maintenance` off `develop`.

## Feature 1 - Offline mode (server unreachable)

The wallet is fully client-side today (mnemonic + private key in the iOS
Keychain via `src/wallet/wallet-keychain.ts`, transfers signed on-device with
viem and sent straight to Alchemy, balances fetched from chain directly). The
only server dependencies at boot are the profile fetch (`/users/me`) and the
wallet-list fetch (`GET /wallets`) - `RootNavigator` hard-fails to an error
screen when either is unreachable. Offline mode removes that hard gate.

### Mobile

1. **Server-reachability store** (`src/store/server.store.ts`) - single
   source of truth: `serverStatus: 'online' | 'offline' | 'maintenance'`.
   Fed by: network-failure errors from the bootstrap calls, the existing
   socket status, and a light `/health` poll (~20s) only while offline to
   detect recovery.
2. **Cached bootstrap** - after every successful boot, persist a snapshot
   `{ profile, wallet }` to AsyncStorage. On boot, if the server calls fail
   as network errors and a JWT + snapshot exist: hydrate stores from the
   snapshot, mark `offline`, enter the app normally. Even with no snapshot,
   the wallet address can be derived locally from the Keychain secret, so
   the Wallet tab stands entirely on its own.
3. **Recovery** - when `/health` answers again: re-run profile/wallet loads,
   flip to `online`, socket reconnects (existing logic), banner disappears.
4. **Global banner** - slim persistent bar above the tabs: "Can't reach the
   game server - online games are unavailable", with tap-to-retry.
5. **Gating while offline**:
   - Lobby: offline empty-state; Create Room / Join by code disabled;
     resume-prompt and waiting popup suppressed.
   - Demo games: fully playable (all four are local bots).
   - Wallet: fully functional - balances and transfers already go
     device -> Alchemy -> chain, no server in the path.
   - History (and other server-fed lists): no caching - show a plain
     "Failed to fetch history" style error state.
   - No JWT at all + offline: login screen shows an honest "server
     unreachable" state (login inherently needs the server).

## Feature 2 - Maintenance mode

When toggled, multiplayer games cannot be played. Everything else (wallet,
history, profile, demos) stays live since the server is reachable.

### Server

1. **Flag + toggle** - a small `app_settings` key-value table (entity +
   migration) holding `{ enabled, message? }`, read through the cache with a
   ~30s TTL. Toggled at runtime via `POST /admin/maintenance`, guarded by a
   new `ADMIN_TOKEN` env var (header check, curl-friendly). No redeploy
   needed to flip it.
2. **Public status** - unauthenticated `GET /status` returning
   `{ maintenance, message }`; the app reads it at boot alongside `/health`.
3. **Enforcement (server-authoritative)** - `assertNotInMaintenance()`
   called in `createRoom`, `joinRoom`, `startRoom`, and every gateway's
   `enter` handler (same seam as the stake-funding gate). Client gating is
   UX only; the server is the real wall.
4. **In-flight matches drain naturally** - only NEW rooms/joins/starts are
   blocked; running matches may finish (moves/turns still allowed).
5. **Live flip** - toggling broadcasts a `platform:maintenance`
   `{ enabled, message }` socket event to all connected clients (add a
   `sendToAll` to `WebsocketsService`) so banners appear instantly without
   waiting for a poll.

### Mobile

6. `serverStatus: 'maintenance'` in the same reachability store; sourced
   from `GET /status` at boot plus the socket event. Banner copy:
   "Maintenance in progress - multiplayer is temporarily unavailable."
   Only multiplayer is gated (same lobby lock as offline); wallet, history,
   profile and demos stay fully live.

## Verification

- Server smoke tests: toggle endpoint (ADMIN_TOKEN required), guards reject
  create/join/enter during maintenance, `GET /status` shape.
- Manual mobile passes:
  - Kill the server: app boots from cache with the offline banner, demos
    playable, wallet balances + transfers still work, history shows the
    failed-to-fetch state.
  - Restore the server: auto-recovery, banner clears.
  - Toggle maintenance: banner appears live, lobby locks, wallet/history
    keep working.
