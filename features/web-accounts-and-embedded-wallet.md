# Web accounts and the embedded wallet

Plan for the third account type described in
[the brief](web-accounts-and-embedded-wallet.brief.md): a WEB user who signs
in with email and gets a server-held, encrypted private key, plus a hard
mobile/web split on which app an account may sign in from.

Status: phases 1-3 built and covered by integration tests; phase 4's sign-in
screens are built against the supplied design. Remaining: the seed-phrase
onboarding screen (design still to come) and phase 5, spending.

Shipped so far:

- `UserPlatform` in core, `users.platform` (migration `UserPlatform1785800000000`,
  backfilled by the rule below).
- The split enforced at every token-issuing path, refresh included, keyed off
  `X-App-Platform` via a `@CallerPlatform()` decorator.
- `W_ENCRYPT` (32-byte base64, validated at boot), AES-256-GCM in
  `wallets/key-cipher.util.ts`, `WalletOrigin.Embedded` and
  `wallets.encrypted_private_key` with a CHECK tying the two together
  (migration `EmbeddedWalletKeys1785900000000`).
- Custody is chosen from `user.platform` inside `createWallet`, never from a
  caller flag.
- Web sign-in: method picker and OTP screens (`AuthShell`, `OtpInput`).
- The shared demo identity (`DEMO_LOGIN_EMAIL`) is exempt from the split: it
  is classified mobile by the backfill because it has an email, but it is the
  account the *web* demo hands out, so pinning it to one app would have locked
  demo.playkombat.xyz out of itself.
- Tests: 9 unit (cipher) + 14 integration (`test/accounts-and-wallets.e2e-spec.ts`).

## Where the code stands today

Two account types exist, distinguished only by which columns happen to be
null:

- **Email + device wallet (mobile).** Email OTP flow
  (`/authentication/request-token` then `/exchange-token`,
  `authentication.controller.ts`). Onboarding then calls `POST /wallets`
  (`wallets.service.ts#createWallet`), which generates a wallet, returns the
  mnemonic **once**, and persists **only the address**. The private key
  lives on the phone. The wallets table says so explicitly: "The private key
  is deliberately NOT stored - it never left the player's device"
  (`wallet.entity.ts`).
- **Own wallet (SIWE).** `/authentication/siwe/nonce` + `/siwe/verify`
  (`siwe.service.ts`); `users.email` is null
  (migration `1785700000000-WalletOnlyUsers`). This is the only sign-in the
  web client (`apps/webgames`) offers today, through ConnectKit's modal.

Other pieces the plan builds on:

- `users` (`user.entity.ts`): no platform field, nothing marks an account as
  mobile or web.
- `wallets` (`wallet.entity.ts`): `WalletOrigin.Platform | Imported`, unique
  address, no key material, `MAX_WALLETS_PER_USER = 1`.
- The core `ApiClient` already sends `X-App-Platform` but only webgames sets
  it (`'web'`); the mobile app sends nothing. The server reads it in exactly
  one place (`supported-version.guard.ts`, to exempt web from the store
  version floor).
- Sessions: 30d JWT (`JWT_EXPIRES_IN`) + 30d rotating refresh tokens.

## What actually changes, in one sentence

For WEB accounts the platform becomes a custodian: the private key is
generated server-side, encrypted with a key from the environment, and stored
in Postgres, which deliberately reverses the "no key ever touches the
server" stance that the mobile wallet was built on. Everything else is
bookkeeping around that decision.

## Phase 1: classify accounts (schema + backfill)

1. `users.platform` smallint: `0 = mobile`, `1 = web`. Enum `UserPlatform`
   in `@gaming-platform/core` next to `WalletNetwork`.
2. Migration, in one transaction:
   - add the column nullable;
   - backfill per the brief's rule: an account whose wallet was **given to
     it** (email set, `WalletOrigin.Platform` wallet or no wallet yet) is
     `mobile`; an account that **connected its own** wallet (email null,
     SIWE) is `web`;
   - set NOT NULL.
3. New accounts stamp `platform` at creation time from the request's
   `X-App-Platform` (exchange-token and siwe/verify both create users on
   first sign-in).

## Phase 2: enforce the split at sign-in

Where: token issuance, not the guard layer. Both `exchangeToken` and
`siweVerify` load or create the user; compare `user.platform` against the
caller platform and reject with a clear 403 ("This account belongs to the
mobile app. Sign in there." and the mirror). Also check on `/refresh`, or a
stolen refresh token crosses the fence the login check built.

Caller platform resolution: `x-app-platform: web` means web; anything else
(including absent) means mobile, because every existing mobile build sends
nothing. The core `ApiClient`'s `appPlatform` option widens from `'web'` to
`'web' | 'mobile'` and the mobile client starts sending it, but the server
must never require it: old builds stay signed in.

Ordering note: ship Phase 1's backfill and Phase 2's checks in the same
release. A window where accounts are classified but unenforced is fine; the
reverse (enforcement reading a null column) is not.

## Phase 3: the embedded wallet (server custody)

1. **Env**: `W_ENCRYPT` (the brief spells it `W_ENCRIPT`; flagged below), a
   32-byte base64 key, validated at boot in `configuration.service.ts` the
   way other required secrets are. Boot fails loudly if it is missing or the
   wrong length.
2. **Crypto**: AES-256-GCM via node `crypto`. Random 12-byte IV per record;
   stored value is `v1:` + base64(iv | tag | ciphertext). The version prefix
   is the future migration path to KMS or per-user derived keys without a
   schema change.
3. **Schema**: on `wallets`, `WalletOrigin.Embedded = 2` and a nullable
   `encrypted_private_key` text column. A CHECK that the column is non-null
   exactly when `type = 2` keeps the two custody models from blurring.
4. **Creation path**: `createWallet` grows a variant for web users: generate
   (same `generateEthereumWallet`), encrypt and store the private key,
   still return the mnemonic exactly once for the seed-phrase screen, still
   fund gas and attach the ENS subname. Guard: embedded wallets only for
   `platform = web` users, device wallets only for mobile, so the custody
   model is a function of the account type and never a caller choice.
5. **What is stored**: the private key only, per the brief. The mnemonic is
   shown once and gone; the address plus key is enough to operate the
   wallet. If we ever want server-side seed restore, that is a separate
   decision to store the mnemonic, not an accident of this one.
6. **Hygiene**: the decrypted key must never appear in logs, errors, or any
   API response. Nothing decrypts in this phase at all; the first consumer
   of the stored key is Phase 5.

The custody reversal deserves its own paragraph in the PR description, not
just here: after this ships, a Postgres dump plus the `W_ENCRYPT` value
equals every web user's funds. The two secrets live in different systems on
purpose. Losing `W_ENCRYPT` bricks every embedded wallet with no recovery,
so it needs the same backup discipline as the operator key.

## Phase 4: web client (webgames)

1. **Sign-in**: email option beside the wallet button on `SignInPage`. The
   OTP endpoints already exist and are platform-agnostic in the core
   `ApiClient`; the screen state machine (email, then code) mirrors the
   mobile one. SIWE stays as-is for wallet-type accounts.
2. **Onboarding**: after the username step, web email users get the
   wallet-creation screen mirroring mobile's: call `POST /wallets`, show the
   seed phrase, require the "I saved it" confirmation. Blocked on the screen
   design from the brief ("I will later give you a screen design"); the
   route and flow can be built behind the existing `OnboardingPage` gate.
3. **Session store**: needs to know the account type (embedded vs
   connected) so the wallet page, the topbar, and the SIWE provider only
   engage wagmi for connected-wallet accounts.

## Phase 5 (explicitly out of scope now): spending from an embedded wallet

The brief stops at storage, so this plan does too, but the shape of the gap
matters: on web today every on-chain action (stake deposit, permit) is
signed by the connected wallet through wagmi. An embedded-wallet user has no
wagmi wallet, so until a server-side signing endpoint exists (the first
consumer of the stored key), web email users can browse but cannot stake
from their wallet. That endpoint, its authorization model, and rate limits
are the next feature after this one.

## Testing

- Crypto util round-trip, wrong-key failure, and tamper (bad tag) failure.
- Backfill classification against fixtures of all three existing shapes:
  email + platform wallet, email + no wallet, SIWE wallet-only.
- Sign-in matrix: {mobile user, web user} x {mobile caller, web caller} x
  {exchange-token, siwe, refresh}; the four cross cases 403, everything on
  the diagonal still works, absent header behaves as mobile.
- Embedded wallet creation: key stored encrypted, mnemonic in the response
  and nowhere else, mobile users rejected from the embedded path.

## Open questions for Nenad

1. `W_ENCRIPT` as written, or the corrected `W_ENCRYPT`? The plan assumes
   the correction.
2. May a WEB user also connect an external wallet later (SIWE on an email
   account), or is one custody model per account final?
3. Should the mobile app start sending `X-App-Platform: mobile` in its next
   release? Costless and makes the server rule explicit rather than
   default-based.
4. The backfill classifies email users with no wallet as mobile. Correct?
   (Today that shape can only have come from the mobile flow.)
