# apps/webgames

The browser client. Plain React + Vite, wallet sign-in (SIWE), and Triple Cut
(rock paper scissors) against a person or a bot.

```bash
cp .env.example .env      # point VITE_API_URL at your server
npm run webgames          # from the repo root, serves on :5173
```

## Shipping it

`Dockerfile` builds the bundle and serves `dist/` from nginx on **:8080**
(`/healthz` for the load balancer, everything unknown falls back to
`index.html` for react-router). Build from the repo root, not from here:

```bash
docker build -f apps/webgames/Dockerfile -t webgames .
```

`VITE_*` values are inlined into the bundle by `vite build`, so they are baked
into the image rather than read at boot: the Dockerfile carries the Sepolia
defaults and each is a `--build-arg`. Publishing is the
`publish-webgames-image` workflow, run by hand from the Actions tab against
whichever commit should ship; its dispatch inputs override the chain and API.

## What it is

- **Auth is the wallet.** No email. `POST /authentication/siwe/nonce` then
  `POST /authentication/siwe/verify` with an EIP-4361 message; the server
  registers the connected address as an **imported** wallet row and mints the
  same JWT the mobile app uses. There is no custodial wallet on web, so
  `POST /wallets` is never called from here.
- **One game.** Triple Cut is the only arena with a web board. The lobby lists
  every game's rooms but only offers Join on the ones this client can play.
- **Domain logic comes from `@gaming-platform/core`** - rules, socket
  protocol, the turn clock, stake maths and the REST client. Nothing in here
  re-derives a game outcome.

## Conventions

- **Tokens only.** Every colour, spacing and radius value comes from the
  custom properties at the top of `src/styles.css`. No raw pixel values for
  padding, margin, gap or border-radius, and no literal hex in a component.
- **No em-dashes**, anywhere, same as the rest of the repo.
- Comments explain a constraint or a why, never what the next line does.

## Layout

```
src/
  lib/        api client, socket-less helpers, chain + wagmi config
  store/      zustand: session, websocket, lobby, pot, username cache
  components/ app shell (rail + topbar) and shared cards
  pages/      one file per route
  games/rps/  the engine seam: useDemoRps + useMultiplayerRps -> RpsBoard
```

`RpsEngine` is what keeps the demo and the multiplayer board identical: both
hooks return the same shape and `RpsBoard` never knows which one it has.

## Gotchas

- Core ships CommonJS (the server and Metro both need it), which Rollup cannot
  see through. `vite.config.ts` adds the linked package to the CJS interop -
  removing that breaks `vite build` but not `vite dev`.
- The socket server kicks a user's previous socket when a new one connects, so
  two tabs will fight. The websocket store surfaces this as `kicked` rather
  than reconnecting in a loop.
- `stake-pot` 503s entirely when the server has no chain configured; the wallet
  page renders a disabled state instead of erroring.
