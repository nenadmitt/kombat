# apps/mobile

The Kombat mobile app: bare React Native 0.86 with the New Architecture,
native `ios/` and `android/` projects (no Expo). All five games, the lobby,
match history, profile and a wallet with stake pot deposits.

## Running it

Complete the [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment)
first. Then, from the repo root:

```bash
npm install
npm run build --workspace @gaming-platform/core
cp apps/mobile/.env.example apps/mobile/.env

cd apps/mobile && bundle install && npm run pods && cd ../..   # iOS, first time and after native dependency changes

npm run mobile            # Metro
npm run mobile:ios        # build and run on the iOS simulator
npm run mobile:android    # build and run on an Android emulator or device
```

Other workspace scripts: `ios-one` and `ios-two` (two named simulators, handy
for playing yourself), `typecheck`, `version:sync`, `version:bump`.

## Environment

Read through `react-native-config` and bundled into the app, so nothing here
may be secret beyond a client-side RPC token.

| Variable | |
| --- | --- |
| `API_BASE_URL` | Required. Server origin. `localhost` works from the iOS simulator; use the machine's LAN IP on a device, or `10.0.2.2` on the Android emulator. |
| `ALCHEMY_TOKEN` | Required. Alchemy key for the RPC endpoints the wallet uses. |
| `MAINTENANCE_DETAILS_URL` | Optional. Status page linked from the maintenance banner. |
| `STAKE_POT_ADDRESS_PIN` | Optional. If set, a server-supplied deposit target that differs is refused. |

## Design points

- **Rules from core.** Game logic comes from `@gaming-platform/core`, the
  same code the server runs. Each game has a local engine (demo games against
  a bot, fully offline) and a multiplayer engine driven by socket.io, behind
  the same interface, so the board components are shared.
- **Boards in Skia and Reanimated.** Battleships, Ludo and Salvo draw with
  `@shopify/react-native-skia` and animate on the UI thread. Salvo replays the
  projectile path the server computed rather than simulating it on the device.
- **Wallet.** Login is an emailed one-time code. The server creates the
  account's wallet and returns the recovery phrase once; the app stores it in
  the device keychain (one slot per account) and signs locally with viem,
  including EIP-2612 permits for single-transaction `stakeWithPermit`
  deposits into the stake pot.
- **Session.** Refresh tokens live in the keychain; the API client refreshes
  access tokens and replays the request.
- **Operations.** Every request carries the app version; the server can
  require an update or switch on maintenance mode, which the app shows as a
  blocking screen or a banner.
- **UI conventions** (spacing and radius scale, typography) are documented in
  [`CLAUDE.md`](CLAUDE.md) in this directory.
