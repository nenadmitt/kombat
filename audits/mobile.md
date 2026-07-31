# Audit — `apps/mobile`

**Scope:** React Native (Expo) custodial staking client — wallet/key handling, JWT storage, permit signing, deposit/withdraw flows, networking, trust boundary.

## Trust model (as built)

The wallet secret is generated **server-side**: `POST /wallets` returns `{ address, mnemonic }` (`packages/core/src/api/api-client.ts:91`, `packages/core/src/wallets/wallet.types.ts:12-15`), consumed in `src/store/currentUser.store.ts:260-264`. The device re-derives the private key, stores it in the Keychain, and signs locally (transfers, EIP-2612 permits). This means **the server inherently knows every user's private key** — the platform is fully custodial. If that is the intended product, it is defensible; but it should be an explicit, documented decision, because nothing in the client treats the key as secret-from-server.

Positives worth stating up front:
- The wallet key is **never sent back** to the server from the client; signing is fully local (`src/wallet/transfer.ts`, `src/wallet/stake-pot-deposit.ts`).
- Game/money outcomes are **server-authoritative**: the client emits moves only and receives `winnerUserId` from the server; the "winner takes" math in `CreateGameRoomModal.tsx:119` is display-only.
- Pot withdrawal destination is fixed to the caller's own wallet server-side, so the withdraw path has **no client-supplied `toAddress`** — the resolved checksummed address is shown in a review step before signing.
- Permit `value` is amount-scoped (not infinite) with a 30-min deadline.
- No secrets/tokens are logged (grep over `console.*` for secret/key/mnemonic/token returned nothing).

## High

### H1 — Wallet mnemonic is generated on the server and sent over the network
`src/store/currentUser.store.ts:260-264`, `packages/core/src/api/api-client.ts:91-93`. The full BIP-39 mnemonic (hence the private key to all of a user's funds) is produced server-side and transmitted in an HTTP response body. Server compromise = total loss of all custodial funds, and the seed traverses the network on wallet creation, so its confidentiality is only as good as the transport (see H2). If custodial is intended, document it as a deliberate model and treat the seed as a server-known secret; otherwise move key generation onto the device.

### H2 — Cleartext HTTP is the default; nothing enforces TLS
`src/config/env.ts:18`, `.env:2` (`API_BASE_URL=http://localhost:3000`), `src/store/websocket.store.ts:56`, `packages/core/src/api/api-client.ts:333`. Both the REST client and the socket.io connection use `env.apiBaseUrl` verbatim with no `https://`/`wss://` requirement and no scheme validation. Everything sensitive rides this channel: the JWT bearer header, the socket auth token, and the wallet **mnemonic** on the `POST /wallets` response. No iOS ATS exception / Android `usesCleartextTraffic` config was found, so cleartext is gated only by the URL. Fix: reject non-TLS `baseUrl` in `env.ts` outside local dev, and keep ATS/cleartext disabled in release builds.

### H3 — JWT stored in AsyncStorage (plaintext), not the Keychain — ✅ FIXED 2026-07-31
`src/storage/storage-keys.ts:2`, `src/store/currentUser.store.ts:166,174,179`, `src/api/client.ts:14`. The access token lives in AsyncStorage (unencrypted on disk, included in unencrypted backups, readable on a jailbroken/rooted or physically-extracted device). The wallet secret is correctly in the Keychain — the bearer token, which grants full API/socket access to the account and its custodial funds, deserves the same. Move it to `react-native-keychain` / expo-secure-store.

**Fixed.** The session (access **and** refresh token) now lives in the Keychain /
Android Keystore via `src/storage/session-keychain.ts`, stored with
`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` so it stays out of backups and off any
restored device. AsyncStorage now holds only the non-sensitive boot snapshot.
An existing plaintext token is migrated into the Keychain once on upgrade and
the old key deleted, so nobody is logged out by the change.

Alongside it, access tokens dropped from **30d to 2d** and a rotating refresh
token (30d, single-use, hashed at rest, with reuse detection) now carries
session longevity - so this also closes most of server S-4. See
[server.md](server.md#auth-session-hardening-2026-07-31).

## Medium

### M1 — Keychain item stored with default protection — no device-only flag, no biometric gate
`src/wallet/wallet-keychain.ts:14`. `Keychain.setGenericPassword` is called with only `{ service }` — no `accessible` and no `accessControl`. Without `…THIS_DEVICE_ONLY` the item can migrate into backups / restore to another device; without a biometric `accessControl` the mnemonic can be read and used to sign, or revealed/copied, with no re-auth. `OnboardingScreen.handleReveal`/`handleCopy` (`src/screens/OnboardingScreen.tsx:80,95`) and every `sendTransfer`/`depositToStakePot` read the raw key with zero user-presence check. Fix: set the strictest `accessible` option and gate reveal/copy/sign behind biometrics.

### M2 — Deposit contract and permit spender trusted from the server with no allowlist
`src/components/wallet/StakePotModal.tsx:143`, `src/wallet/stake-pot-deposit.ts:112-125,149-225`. The pot address from `GET /stake-pot/deposit-target` is used both as the contract the client calls and as the `spender` in the locally-signed permit, with no client-side verification against a known deployment. A compromised/malicious server response could make the user sign a permit granting allowance to an attacker address while the UI says "Add to stake pot." Blast radius is bounded (permit `value` = entered amount, 30-min deadline), but the destination trust is misplaced. Fix: pin expected pot addresses per chain in the client and verify the server response before signing.

### M3 — Mnemonic copied to the OS clipboard with no auto-clear
`src/screens/OnboardingScreen.tsx:100`. The seed phrase is placed on the shared system clipboard (readable by other apps, surfaced in clipboard history, syncable via Universal Clipboard); only the "Copied" UI flag resets after 2s, not the contents. Fix: clear the clipboard after a timeout and warn the user, or drop copy-to-clipboard for the seed.

## Low / Informational

- **L1 — Native transfer ignores `token.decimals`.** `src/wallet/transfer.ts:44` uses `parseEther(amount)` for the native branch instead of `parseUnits(amount, token.decimals)`. Correct for 18-decimal ETH today; latent unit bug if a non-18-decimal native token is added. (Candidate `MOBILE.BAI.md` entry.)
- **L2 — No JWT expiry validation on boot.** `src/store/currentUser.store.ts:163-171` only checks token presence; a stale token is caught on the first 401. Carries a `TODO`.
- **L3 — Recipient field over-promises.** `WithdrawModal` placeholder says "Address or Kombat username" (`WithdrawModal.tsx:294`) but `resolveRecipient` (`src/wallet/ens.ts:23-51`) only accepts raw addresses and `.eth` names. UX, not security.
- **L4 — Alchemy API token embedded in the app binary.** `src/config/env.ts:19`, used in `src/wallet/rpc.ts:15,30`. `react-native-config` bundles it into the binary (extractable → quota/cost abuse). `.env` is git-ignored and only `.env.example` is tracked. Restrict the key to allowed bundle IDs/domains in the Alchemy dashboard and rotate.
- **L5 — No TLS cert pinning** on REST or socket. Informational, but relevant given H1/H2 carry a seed phrase and bearer token.

## Priority

Enforce TLS (H2) and move the JWT into secure storage (H3) first — together they close the plaintext-token and plaintext-mnemonic exposure. Then harden the Keychain item (M1) and pin the pot address (M2). Decide and document the custodial key model (H1).
