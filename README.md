# Gaming Platform

Blank **Turborepo** monorepo: an **Expo** (managed) React Native app plus a
shared, platform-agnostic package (reusable by a future web app).

```
.
├── apps/
│   └── mobile/                 # Expo SDK 57 app (New Architecture on by default)
│       ├── App.tsx             # single screen, shows core's APP_NAME
│       ├── app.json
│       └── metro.config.js     # monorepo-aware
├── packages/
│   └── core/                   # shared TS, no react-native/DOM (one example constant)
├── package.json                # npm workspaces
├── turbo.json
└── tsconfig.base.json
```

> Managed Expo means there are no committed `ios/`/`android/` folders — they're
> generated on demand with `npx expo prebuild` or built in the cloud via EAS.

## Use

```bash
npm install

npm run mobile           # expo start (scan QR with Expo Go, or press i / a)
npm run mobile:ios       # open iOS simulator
npm run mobile:android   # open Android emulator
npm run typecheck        # tsc across workspaces
```
