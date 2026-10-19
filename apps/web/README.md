# apps/web

The public website: a Next.js 16 app with the landing page, the stake pot
deposit page, tester signups and a small operator console. It is standalone:
it has its own Postgres database and talks to the game server only through
the server's public and admin HTTP APIs.

## Running it

```bash
cp apps/web/.env.example apps/web/.env
npm run migrate --workspace @gaming-platform/web   # applies migrations/*.sql
npm run web                                        # from the repo root, serves on :4000
```

It needs a Postgres database of its own (`DATABASE_URL`, or the discrete
`POSTGRES_*` variables). Workspace scripts: `dev`, `build`, `start`,
`typecheck`, `migrate`.

The `Dockerfile` builds a standalone Next.js server on port 4000 and runs the
migrations before starting. `NEXT_PUBLIC_*` values are baked in at build time
as build args.

## Environment

| Variable | |
| --- | --- |
| `DATABASE_URL` or `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | This app's database |
| `POSTGRES_SSL` | `true` for managed Postgres |
| `ADMIN_TOKEN` | Unlocks `/admin` and `/moderation` (minimum 10 characters) |
| `PLATFORM_API_URL`, `PLATFORM_ADMIN_TOKEN` | Server-side access to the game server's admin API for `/admin/stats` |
| `NEXT_PUBLIC_PLATFORM_API_URL` | Game server API, used for recipient lookup on the stake page |
| `NEXT_PUBLIC_CHAIN_ID`, `NEXT_PUBLIC_STAKE_POT_ADDRESS`, `NEXT_PUBLIC_EXPLORER_URL` | Stake pot deployment |
| `NEXT_PUBLIC_ENS_RPC_URL` | Optional mainnet RPC for resolving ENS names |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Optional; injected wallets work without it |
| `NEXT_PUBLIC_DEMO_APP_URL`, `NEXT_PUBLIC_SITE_URL` | Link targets and the canonical origin for link previews |

## Pages

- `/`: landing page with a games carousel (screenshots and optional looping
  clips from `public/`) and the tester signup form.
- `/stake`: connect any wallet (wagmi and ConnectKit) and deposit into the
  `StakePot` contract for a Kombat player, found by username, ENS name or
  address. Uses `stake` after an ERC-20 approval.
- `/admin`: tester signups, behind `ADMIN_TOKEN`. `/admin/stats` proxies the
  game server's admin statistics, so the server's admin token never reaches
  the browser.
- `/moderation`: an authenticated placeholder for future tools.

Signup endpoints are rate limited per IP and per visitor cookie.
