# packages/core

`@gaming-platform/core`: the platform-agnostic TypeScript shared by the
server, the mobile app, the web clients and the lobby bots. No React Native,
DOM or Node-specific dependencies.

```bash
npm run build --workspace @gaming-platform/core   # tsc to dist/
```

Consumers import the compiled CommonJS in `dist/`, so rebuild after any change
(`npm run typecheck` at the root also builds it first).

## Contents

| Path | What it holds |
| --- | --- |
| `games/battleship` | Fleet and grid rules, mines, torpedo and bomb power-ups, shot resolution, bot targeting |
| `games/ludo` | Board topology, dice and turn rules, abilities (launcher, jump, teleport, shield), bot policy |
| `games/salvo` | Seeded terrain generation, wind, projectile integration, blast damage, craters, bot aiming |
| `games/chroma` | Deck, playability, card effects, seat order and direction, bot play |
| `games/rps` | Triple Cut round resolution (best of five) |
| `games/*/*.protocol.ts` | Socket event names and payload types for each game |
| `games/game-room.types.ts` | Game types, room lifecycle and lobby events, multi-seat rules |
| `games/turn-based.ts` | The shared turn clock (`TURN_SECONDS`, `MAX_TIMEOUTS`) |
| `games/stake*.ts` | Stake assets, presets and stake pot types |
| `wallets/token-registry.ts` | Token addresses and decimals per chain |
| `api/` | Typed REST client and error codes used by every client |
| `players/` | Bot roster, rankings, stats, referral codes, ENS label rules |
| `platform/` | Maintenance and app version status types |

Anything that decides a game outcome belongs here, so the server (which
applies moves) and the clients (which preview them and run offline demos)
cannot disagree about the rules.
