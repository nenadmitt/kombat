# apps/lobby-bots

A standalone runner for bot accounts that keep the lobby from looking empty.
Bots host rooms, join rooms a real player has been waiting in, and play the
match out. They talk to the server as ordinary clients over the public REST
API and socket.io; the only server-side support is the `is_bot` flag (which
keeps them out of the rankings) and a bot login route.

## Running it

**1. Seed the accounts.** The roster is defined in
`packages/core/src/players/bot-accounts.ts`, and the server creates it through
the admin API (`ADMIN_TOKEN` must be set on the server):

```bash
curl -X POST http://localhost:3000/api/v1/admin/bots/seed \
  -H "content-type: application/json" \
  -H "x-admin-token: $ADMIN_TOKEN" \
  -d '{"count":20}'
```

Seeding is idempotent. Each account gets an email, a username, the `is_bot`
flag and one custodial wallet. A username already taken by someone else is
reported as `skipped`.

**2. Share the secret.** Set `BOT_SECRET` on the server (16 characters
minimum) and the same value as `BOTS_SECRET` here. The runner signs in at
`POST /api/v1/authentication/bot-login` with a roster username and that
secret. The route only accepts accounts flagged `is_bot` and creates nothing,
so the secret cannot be used to sign in as a real player.

**3. Run.**

```bash
cp apps/lobby-bots/.env.example apps/lobby-bots/.env
npm run bots                 # from the repo root (tsx src/main.ts)
```

It also runs as part of the root `docker compose up -d --build`, or on its
own from an image built at the repo root:

```bash
docker build -f apps/lobby-bots/Dockerfile -t kombat-lobby-bots .
docker run --rm --add-host=host.docker.internal:host-gateway \
  -e BOTS_SECRET="$BOT_SECRET" kombat-lobby-bots
```

In the image, `BOTS_SERVER_URL` defaults to `http://host.docker.internal:3000`.

Workspace scripts: `dev`, `build`, `start`, `typecheck`, `test`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `BOTS_SERVER_URL` | `http://localhost:3000` | API and socket origin |
| `BOTS_SECRET` | none | Must equal the server's `BOT_SECRET` |
| `BOTS_COUNT` | 10 | How many roster accounts to run |
| `BOTS_GAME_MIX` | `NavalBattle:0.3,Ludo:0.3,TripleCut:0.2,Salvo:0.2` | Weighted mix of games the bots host |
| `BOTS_MIN_OPEN_ROOMS` | 4 | Open lobby rooms the bots keep available |
| `BOTS_MAX_HOSTED_ROOMS`, `BOTS_MAX_ROOMS_PER_GAME` | 4, 2 | Caps on bot-hosted rooms |
| `BOTS_JOIN_DELAY_MS_MIN/MAX` | 20000 / 30000 | How long a player's room waits before a bot joins |
| `BOTS_STAKES_ENABLED`, `BOTS_STAKE_ASSETS` | `true`, `Kombat` | Whether bots match staked rooms, and in which assets |
| `BOTS_LOG_LEVEL` | `info` | `debug` for verbose logs |

Pacing knobs (`BOTS_SEAT_FILL_*`, `BOTS_EARLY_START_*`, `BOTS_CONCEDE_DELAY_MS_*`,
`BOTS_HOSTED_ROOM_TTL_MS_*`, and per-game think times such as
`BOTS_LUDO_ROLL_MS_*`) are listed with their defaults in `.env.example`.

## Behaviour

- **Drivers** exist for Battleships, Ludo Royale, Triple Cut and Salvo, using
  the bot policies from `@gaming-platform/core`. Rooms of any other game are
  left alone.
- **Joining.** A bot takes one seat in a player's room only after it has sat
  unanswered for the join delay. Room hosts are classified against the whole
  roster, not only this process's accounts, so bots do not answer each
  other's rooms through this path.
- **Filling multi-seat rooms.** Ludo rooms a bot hosts or has joined get
  further bot seats on a slower schedule, and the host sometimes starts
  early, so tables fill the way they would with people.
  When every seat in a match is a bot from this process, one deterministic
  winner is picked and the others concede after a short delay; a match with a
  human in it is always played for real.
- **Stakes.** Bots never create a staked room. They only match a stake a
  player chose, in an allowed asset, after checking their settled pot balance
  covers it.
- **Clock safety.** Every thinking pause is clamped to finish at least eight
  seconds before the turn deadline.
- Stop a host runner with `pkill -f "tsx src/main.ts"` (the process is named
  `tsx`).
