# @gaming-platform/lobby-bots

Bot accounts that keep the lobby from looking empty. They hold it at
`BOTS_MIN_OPEN_ROOMS` open rooms, join a room a real player has been sitting in
for 20-30 seconds, and play the match out. They talk to the server as ordinary
clients over the public API and sockets - the only server-side support is the
`is_bot` mark that keeps them out of the rankings.

## Running it locally

**1. The accounts have to exist first.** The roster lives in
`packages/core/src/players/bot-accounts.ts` and the server creates it:

```bash
curl -X POST http://localhost:3000/api/v1/admin/bots/seed \
  -H "content-type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"count":20}'
```

Idempotent: re-running adds nothing. Each account gets an email, a username,
`is_bot`, and one custodial wallet. It never mints an ENS name and never
renames anyone - a username already held by someone else comes back as
`skipped`.

**2. The server needs `NODE_ENV=development`.** Bots sign in through the
test-token route, which 404s on anything the server considers production
(`NODE_ENV` unset counts as production). Signing in also *creates* an account
when one is missing, so the runner refuses to start if a username does not
match the roster - an unseeded roster would otherwise fill the lobby with
nameless, unflagged users.

**3. Run it**, either on the host:

```bash
npm run bots
```

or in Docker, from the repo root (the image needs the whole workspace, since
the runner consumes `@gaming-platform/core` from its build):

```bash
docker build -f apps/lobby-bots/Dockerfile -t kombat-lobby-bots .
docker run --rm --add-host=host.docker.internal:host-gateway \
  -e BOTS_COUNT=20 kombat-lobby-bots
```

The image ships no `.env`; every knob is an environment variable, and
`BOTS_SERVER_URL` defaults to `http://host.docker.internal:3000` so the
container reaches an API running on the host.

Stop a host runner with `pkill -f "tsx src/main.ts"` - the process name is
`tsx`, not something matching "lobby-bots".

## Configuration

See `.env.example`. The ones worth knowing:

| Key | Default | |
| --- | --- | --- |
| `BOTS_SERVER_URL` | `http://localhost:3000` | API and socket origin |
| `BOTS_COUNT` | 10 | how many of the roster to run |
| `BOTS_JOIN_DELAY_MS_MIN/MAX` | 20000 / 30000 | how long a room must sit unanswered |
| `BOTS_MIN_OPEN_ROOMS` | 4 | the lobby floor bots defend |
| `BOTS_GAME_MIX` | `NavalBattle:0.6,Ludo:0.4` | what they host |
| `BOTS_STAKES_ENABLED` | true | may join staked rooms |
| `BOTS_STAKE_ASSETS` | `Kombat` | the only asset they will stake |

## What they will not do

- **Join another bot's room.** Hosts are matched against the roster in core,
  not just this process's own account ids, so a second runner or an older
  roster is still recognised. A host that cannot be resolved is never joined.
- **Create a staked room.** Bots only ever match a stake a player chose, and
  only after checking their settled pot balance covers it.
- **Lose on the clock while "thinking".** Every pause is clamped to leave eight
  seconds before the turn deadline.
- **Play anything without a driver.** Only Battleship and Ludo have bot
  policies in core; a room of any other type is left alone.
