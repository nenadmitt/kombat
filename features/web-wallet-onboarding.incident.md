# What went wrong: two wallets, no onboarding, "Wallet disconnected"

Written 2026-08-09, after the first real run of web email onboarding. Three
separate defects, all mine, all shipped as "done" and none caught by the
tests I had written. Kept as the record of why, and of what the tests were
missing.

## What the user saw

Signed in with email on webgames. Onboarding never appeared. The Wallet page
said **Wallet disconnected** with an ENS name printed underneath it, and both
balances empty. The database had **two** embedded wallets on the account, and
the ENS name resolved to only one of them.

## Defect 1: two wallets on an account capped at one

`MAX_WALLETS_PER_USER = 1` was enforced as count-then-insert inside
`createWallet`. That is a check-then-act race with nothing holding the gap:
two concurrent calls both count zero and both insert.

React StrictMode makes that race the *default* in development. It mounts
effects twice, and `WalletSetupPage` created the wallet from an effect, so a
single visit fired two creations a few milliseconds apart. Both passed the
count. Two wallets, one account.

The consequences were not limited to a spare row. `mintSubname` resolves the
address with `wallets[0]`, so the ENS name was minted against whichever row
came back first, while the rest of the app could read the other one. That is
a name resolving to an address the account may not spend from.

Fixed in two places, deliberately:

- **`UQ_wallets_user_id`**, a unique index (migration
  `OneWalletPerUser1786000000000`). The database is the only place a
  uniqueness rule actually holds; the service check is advisory. The
  migration also resolves pre-existing duplicates to the oldest row.
- `createWallet` maps the resulting `23505` to the same `409 Conflict` the
  count check returns, so the loser of a race gets a coherent answer.
- Client-side, `createWalletOnce()` shares one in-flight promise across
  mounts, so StrictMode stops sending the second request at all.

Why both: the index makes it impossible, the client guard stops a pointless
round trip and a confusing 409 on a screen the user did nothing wrong on.

## Defect 2: onboarding never showed

The account already had a username and a wallet by the time the user looked,
so the gate I added in `010c016` correctly let them through. The screen they
never saw had already run. This one was not a defect in the end state, but it
read as one because of Defect 1 and Defect 3: the wallet existed, the app said
disconnected, so nothing looked like it had happened.

Worth keeping as a note: "the feature did not run" and "the feature ran and
its result is invisible" look identical to the person reporting it. The
Wallet page was the only surface that could have distinguished them, and it
was the one that was lying.

## Defect 3: the Wallet page could not see a custodial wallet

`WalletPage` read the address exclusively from wagmi's `useAccount()`. A
custodial wallet has no browser connector by design: it lives on the server.
So the page rendered `Wallet disconnected` for a wallet that demonstrably
existed, printed the ENS name beside it from the profile (which does not need
a connector), and showed empty balances because every balance read is keyed
on the connector's address.

This is the same class of mistake as the original "server capability with no
caller": I built the custodial path end to end on the server and never asked
what the *existing* screens would do when they met one.

Fixed by reading `listWallets()` and falling back to the custodial address
for display and balances. Writes are a different matter, and are now gated on
`canSign` (a real connector) rather than on having any address at all, with a
banner that says why: deposits and withdrawals are signed in the browser, and
there is no server-side signing endpoint yet.

## What the tests missed, and why

At the time of the failure: 208 unit tests, 48 integration tests, all green.
None of them could have caught any of this.

- **The race.** Every test created wallets sequentially. `POST /wallets`
  twice in a row returns 201 then 409 and looks correct; the defect only
  appears when the two calls overlap. There is now a test that fires both
  concurrently and asserts exactly one 201, one 409, and one row.
- **The client.** No test drives the React flow, so an effect firing twice
  was invisible. Still true, and still the largest hole.
- **The screens.** Nothing asserts what an existing page does when it meets
  a new kind of account. A server-side test proving the wallet row is correct
  says nothing about a page that never asks for it.

The pattern across all three: I tested the code I wrote, in the shape I wrote
it. The failures were all at the seams with things I did not write, or with
the runtime's behaviour rather than my own.

## Still open

- Custodial wallets cannot spend. Staking, depositing and withdrawing are all
  signed by the connector, so a web email account can receive funds and see
  them, but not move them. That needs the server-side signing endpoint, which
  is Phase 5 and deliberately not built.
- The recovery phrase is shown exactly once, at creation. An interrupted
  onboarding leaves a working wallet whose phrase can never be shown again.
