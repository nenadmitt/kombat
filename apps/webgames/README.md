# apps/webgames

The browser client: React 19 and Vite, with all five games playable against
people (through the server) or against a local bot in demo mode.

## Running it

```bash
cp apps/webgames/.env.example apps/webgames/.env   # VITE_API_URL=http://localhost:3000
npm run webgames                                    # from the repo root, serves on :5173
```

Workspace scripts: `dev`, `build`, `preview`, `typecheck`.

For wallet sign-in against a local server, add `localhost:5173` to the
server's `SIWE_DOMAINS`.

## Environment

`VITE_API_URL`, `VITE_CHAIN_ID`, `VITE_RPC_URL`, `VITE_EXPLORER_URL`,
`VITE_WALLETCONNECT_PROJECT_ID` (optional; injected wallets work without it).

`VITE_*` values are inlined by `vite build`, so they are fixed per image
rather than read at runtime. The `Dockerfile` takes each as a `--build-arg`
and serves `dist/` from nginx on port 8080 (`/healthz` for health checks,
unknown paths fall back to `index.html`). Build it from the repo root:

```bash
docker build -f apps/webgames/Dockerfile -t webgames .
```

## How it works

- **Sign-in** is either an emailed one-time code or Sign-In With Ethereum
  (ConnectKit and viem's EIP-4361 message). Both end in the same JWT the
  mobile app uses. Accounts that use the platform's custodial wallet get it
  connected to wagmi as an in-memory connector; a wallet the player connected
  themselves always wins.
- **Domain logic comes from `@gaming-platform/core`**: rules, socket
  protocol, the turn clock, stake maths and the REST client. Nothing here
  re-derives a game outcome.
- **One board, two engines.** Each game has a `useDemo<Game>` hook (local bot,
  rules run in the browser) and a `useMultiplayer<Game>` hook (server state
  over socket.io). Both return the same engine shape, so the board component
  never knows which one it is driving.
- **Stake pot.** The wallet page shows ledger balances and deposits straight
  into `StakePot` with `stake` or `stakeNative`. When the server has no chain
  configured, the pot endpoints return 503 and the page shows a disabled
  state.
- **One socket per user.** The server disconnects a user's previous socket
  when a new one connects, so a second tab takes over; the first tab shows a
  "kicked" state instead of reconnecting in a loop. Room memberships are
  replayed on reconnect.

## Layout

```
src/
  lib/         API client, env, chain and wagmi config, SIWE, embedded wallet
  store/       zustand: session, websocket, lobby, pot, active room
  components/  app shell, modals, shared cards
  pages/       one file per route
  games/<game> board components, theme, demo and multiplayer engines
```

## Gotchas

- Core is published as CommonJS (the server and Metro need that), which
  Rollup cannot see through on its own. `vite.config.ts` adds the linked
  package to the CommonJS interop; removing it breaks `vite build` but not
  `vite dev`.
- Styling uses the custom properties at the top of `src/styles.css` for every
  colour, spacing and radius value.
