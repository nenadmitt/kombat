# Gaming Platform

Turborepo monorepo: a **bare React Native CLI** app (New Architecture), a
NestJS server, a web app, on-chain payment contracts, and a shared
platform-agnostic package.

```
.
├── apps/
│   ├── mobile/                  # React Native 0.86 (New Arch on), native ios/ + android/
│   │   ├── App.tsx              # NavigationContainer + SafeAreaProvider
│   │   └── src/
│   │       ├── navigation/      # RootNavigator (native stack) + types
│   │       └── screens/         # HomeScreen, DetailsScreen
│   ├── server/                  # NestJS API + websockets
│   ├── web/                     # web app
│   └── evm-contracts/           # Solidity payment contracts (Foundry)
├── packages/
│   └── core/                    # shared TS, no react-native/DOM
├── package.json                 # npm workspaces
├── turbo.json
└── tsconfig.base.json
```

## Use

```bash
npm install
cd apps/mobile && npm run pods && cd ../..   # iOS only, first time

npm run mobile             # start Metro
npm run mobile:ios         # build + run on iOS (simulator/device)
npm run mobile:android     # build + run on Android
npm run typecheck          # tsc across workspaces
```

### Run on a physical iPhone
```bash
cd apps/mobile
npx react-native run-ios --device        # pick your connected iPhone
```
Set a bundle identifier and signing Team in Xcode
(`open ios/GamingPlatform.xcworkspace` → target → Signing & Capabilities) the
first time. If `pod install` ever fails with a Ruby encoding error, prefix it
with `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8`.
```

### Contracts (Foundry)
```bash
cd apps/evm-contracts
forge build
forge test
```
See [apps/evm-contracts/README.md](apps/evm-contracts/README.md) for deploy
and dependency-management details. Requires [Foundry](https://book.getfoundry.sh/getting-started/installation).
