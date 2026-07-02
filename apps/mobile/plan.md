# Login & Wallet — implementation plan

Source: `LOGIN_AND_WALLET.md`. Branch: `feat/login-and-wallet` (off `develop`).

## Assumptions (flagging before building, correct me if wrong)

1. **"Login/SignedIn/Wallet page"** — reading "SignedIn" as the authenticated
   navigator/stack (Wallet as its landing screen, with the existing
   Home/Battleship/Details screens still reachable from there), not a
   separate visible screen with its own content. Nothing in the doc
   describes what a distinct "SignedIn" screen would show.
2. **Bottom sheet** — no extra native dependency (`@gorhom/bottom-sheet` etc).
   `react-native-reanimated` is already installed but a plain RN `Modal`
   with `animationType="slide"` + `transparent` gives the same
   "coming from bottom" behavior with zero new native modules / no pod
   install risk.
3. **Wallet screen Figma design** (`wallet-screen` frame, node `2:28`) has a
   "Recent Transactions" section and a bottom tab bar (Games/Wallet/History/
   Profile). The doc explicitly says "no Recent transactions" and never
   mentions bottom tabs — building **only** the header + Receive/Deposit/
   Withdraw row + Assets grid, skipping both. Bottom tab navigation is a
   bigger nav-architecture change than this doc asks for.
4. **Fonts** — the Figma design uses "Outfit" and "Geist"/"Geist Mono".
   Neither is linked in this RN project (no font-linking setup exists yet).
   Using the existing system default font, matching how `LoginScreen`/
   `HomeScreen` already work, rather than adding native font linking.
5. **Icons** — Figma uses individual Lucide SVG assets (arrow-down-to-line,
   plus, arrow-up-from-line, gem, etc.). No SVG/icon library is installed.
   Using emoji, matching the existing app convention (LoginScreen already
   uses 💎/⚔️): ↓ Receive, + Deposit, ↑ Withdraw, 💎 KOMBAT, Ξ ETH, 💵 USDC/USDT.
6. **No Figma frame exists** for the sign-in-methods bottom sheet or the
   email/code entry form — designing that to match the login screen's
   existing visual language (dark surface, brand gradient CTA, same
   spacing/radius tokens).
7. **Balances are mocked** — using the exact placeholder values from the
   Figma design (USDC 1,240.50 / USDT 450.00 / ETH 0.45 / KOMBAT 12,500)
   since there's no balance-fetching endpoint yet, matching "mocked for now".
8. **JWT vs. mnemonic/key storage** — doc distinguishes "local storage" for
   the JWT from "securely store" for mnemonic/private key. Using
   `@react-native-async-storage/async-storage` for the JWT and
   `react-native-keychain` (hardware-backed) for the mnemonic + derived
   private key.
9. **Private key derivation on-device** — server already returns `{ address,
   mnemonic }` and stores the encrypted private key itself. Doc says client
   should "securely store mnemonics **and private key** on device", so the
   client re-derives the private key from the mnemonic via viem's
   `mnemonicToAccount` (same derivation server uses) and stores both.

## 1. Shared API client + types (`packages/core`)

Doc: *"create maybe an api client in /core and reuse that. Maybe even move
server types in core."*

- `packages/core/src/wallets/wallet.types.ts` — move `WalletNetwork` enum
  here (currently duplicated conceptually — only defined server-side).
  `apps/server/src/db/types/wallet.ts` re-exports it from
  `@gaming-platform/core` instead of declaring it locally; keeps
  `WalletOrigin` server-only (mobile doesn't need it).
- `packages/core/src/wallets/wallet.types.ts` also exports `WalletSummary`
  (`{ address, network }`) and `CreateWalletResponse`
  (`{ address, mnemonic }`) — the shapes the wallets API actually returns.
- `packages/core/src/authentication/authentication.types.ts` — 
  `ExchangeTokenResponse` (`{ accessToken }`).
- `packages/core/src/api/api-client.ts` — small class, constructed with
  `{ baseUrl, getAccessToken? }` (core stays platform-agnostic, so the
  access-token getter is injected by the mobile app rather than core
  reading AsyncStorage/Keychain itself):
  - `requestLoginToken(email)`
  - `exchangeLoginToken(email, token)`
  - `createWallet(network)`
  - `listWallets()`
- `apps/server/package.json` gets `@gaming-platform/core` as a workspace
  dependency (it doesn't have one yet).

## 2. New mobile dependencies

- `@react-native-async-storage/async-storage` — JWT persistence.
- `react-native-keychain` — secure mnemonic/private-key storage.
- `viem` — mobile-side wallet derivation (`mnemonicToAccount`), matching
  the server's approach.

All three need `pod install` (native modules) — will verify with a real
build + simulator launch, not just typecheck, same as every other native
dependency added this session.

## 3. State

- `src/store/auth.store.ts` — replaces the auth-relevant parts of
  `currentUser.store.ts`. `status: 'loading' | 'unauthenticated' |
  'authenticated'`, `accessToken`. `load()` reads AsyncStorage on boot;
  `loginWithToken()` persists + updates state; `logout()` clears both.
- `src/store/wallet.store.ts` — `status: 'idle' | 'checking' | 'creating' |
  'ready'`, `wallet: WalletSummary | null`. `ensureWallet()`: list wallets;
  if empty, create one (Ethereum only), derive + Keychain-store the private
  key, then set state; if present, just set state from the existing entry.

## 4. Screens / navigation

- `RootNavigator` — auth-gated like the DB-migration-strategy work on the
  server: spinner while `auth.status === 'loading'`; unauthenticated →
  `LoginScreen` only; authenticated → `ensureWallet()` runs (spinner while
  checking/creating), then `Wallet` as the initial route with
  Home/Details/Battleship still reachable behind it.
- `LoginScreen` — rebuilt: centered logo + "Continue" button by default.
  Tapping Continue opens a bottom-sheet `Modal` (slide up) listing sign-in
  methods: "Continue with Email" (active) and "Continue with Google"
  (visibly present, disabled, "Coming soon"). Tapping email swaps the sheet
  content to an email input + "Send code"; after a successful
  `requestLoginToken`, swaps to an 8-character code input (server requires
  exactly 8 chars) + "Verify"; on success, `exchangeLoginToken` → JWT →
  `auth.loginWithToken()` → sheet closes → nav reacts automatically.
- `WalletScreen` (new) — matches Figma node `2:28`'s header + action-row +
  token-section exactly (colors/spacing/radii pulled from the design):
  header "My Wallet" + address pill (truncated address, copy-to-clipboard);
  Receive/Deposit/Withdraw row (mocked — no-op for now); Assets list with
  the 4 token cards (KOMBAT card gets the amber `#f59e0b` border/icon
  background per the design, others use the neutral `#1c1c24` icon
  background). No transactions section, no bottom tabs (see assumption 3).

## 5. Verification

- `tsc --noEmit` across `packages/core`, `apps/server`, `apps/mobile`.
- `apps/server` boots against the real local Postgres.
- Full live round-trip against the running server from the simulator:
  request a token, exchange it, confirm wallet auto-creation, confirm JWT
  persists across an app relaunch (no login screen shown), confirm
  Keychain actually holds the mnemonic/key (not just that the call
  succeeded).
- Real `npm run ios` build + launch, not just `tsc`.
