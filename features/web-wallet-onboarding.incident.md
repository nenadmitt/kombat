# What went wrong: web embedded wallet onboarding

Written 2026-08-09, after several failed runs of web email onboarding. Four
defects, all mine. The first three are ordinary bugs. The fourth is the one
that mattered: I built the wrong architecture, was told the right one more
than once, and did not hear it.

## The requirement, as it was actually stated

Two kinds of account:

1. **Connected wallet (SIWE).** The player brings their own. Nothing to
   onboard, existing flow, untouched.
2. **Embedded wallet (email).** On signup the platform creates a wallet. A
   separate onboarding step after the username shows the address, the ENS
   name and the recovery phrase to save. From then on **the server returns the
   private key, the browser loads it, and everything downstream behaves
   exactly like a connected wallet.**

## Defect 4 (the important one): I built server-side custody instead

I read "the server stores the encrypted private key" and stopped there. I
built the key as something the server holds and never releases, concluded
that spending would need a server-side signing endpoint, wrote that up as a
future phase, and **disabled the deposit and stake buttons behind a banner
explaining the limitation**. I then described that limitation in summaries as
though it were a property of the design rather than a consequence of my
choice.

The actual design has no such limitation. Storing the key server-side is
about *durability* - a browser has nowhere safe to keep one, unlike the phone
keystore - not about withholding it. The key is meant to reach the client,
which is exactly how the mobile app already works: `createWallet` returns the
mnemonic, the device derives the key, and `walletFromKey` produces a local
signer that signs transactions in-process. Web is the same picture with the
server standing in for the keystore.

The cost of not hearing this: an entire round of work aimed at the wrong
target, a wallet page that reported a working wallet as unusable, and the
user repeating the requirement several times while I kept answering with
implementation detail about a design they had not asked for.

Now built: `GET /wallets/embedded-key` returns the decrypted key to its
authenticated owner, and `embeddedWallet()` wraps it in a wagmi connector
(`createConnector` over a viem local account) that `EmbeddedWalletGate`
connects on session load. Every existing wagmi call site - balances, pot
deposits, permits, staking - now works unchanged for an email account. The
signing restriction and its banner are gone.

## Defect 1: the wallet step never rendered

Two causes, and I only found the second by driving a real browser.

`OnboardingPage.submit` did `setUser(updated)`, then `await listWallets()`,
then `setNeedsWallet(true)`. The `await` between them flushes a render where
the username is set but the wallet step is not yet armed, and that render hits
`if (user?.username) return <Navigate to="/lobby" />`. The player lands in the
lobby and the wallet screen never mounts. This is why the answer to "why is
there no wallet onboarding" was, for several rounds, "there is, it must have
run" - the code existed and could not execute.

Fixed by ordering the state writes so the step is armed before the redirect
unlocks, and by deriving the decision once instead of re-reading state
mid-flight.

That fix was not enough, and I shipped it believing it was. The step then
mounted and immediately sent the player to the lobby anyway, because
`onDone` was an inline arrow in the parent: a fresh identity on every
render, in the dependency array of the setup `useCallback`, so any re-render
re-ran the setup. The second run listed wallets, found the one the first run
had just created, concluded the account already had a wallet and called
`onDone()`. The screen unmounted before anyone could read it.

Fixed by running the setup once per mount behind a ref, caching the whole
"does this need a wallet, and here it is" answer for the page load rather
than just the create call, and wrapping the parent's callbacks in
`useCallback` so they stop churning.

The lesson is the process one: I diagnosed this twice from reading code and
was wrong both times. It took driving the actual browser over CDP - filling
the username, submitting, reading the DOM - to see what was happening. That
should have been the first move, not the third.

## Defect 2: two wallets on an account capped at one

`MAX_WALLETS_PER_USER = 1` was a count-then-insert: a check-then-act race with
nothing holding the gap. React StrictMode double-fires effects in development
and `WalletSetupPage` created from an effect, so one visit minted two wallets.
`mintSubname` resolves the address with `wallets[0]`, so the ENS name pointed
at one of them while the app could read the other.

Fixed with a unique index (`UQ_wallets_user_id`), `23505` mapped to the same
`409`, and a shared in-flight promise on the client so the second request is
never sent. An e2e test fires two creations concurrently and asserts one 201,
one 409, one row.

## Defect 3: "Wallet disconnected" for a wallet that existed

`WalletPage` read its address only from wagmi's `useAccount()`. Before
Defect 4 was fixed there was no connector, so the page reported a working
wallet as disconnected while printing its ENS name beside it. This is now
moot - the wallet genuinely connects - but the shape of the mistake is worth
keeping: I added a new kind of account and never asked what the existing
screens would do when they met one.

## What the tests could not catch

208 unit and 53 integration tests are green, and none of them would have
caught Defects 1, 2 or 4.

- **No client tests at all.** Defect 1 was pure React state ordering and
  Defect 2 was a runtime behaviour (StrictMode). Both are invisible to a
  server suite. This remains the largest hole in the feature.
- **Sequential-only wallet tests.** Two creations in a row return 201 then
  409 and look correct; the race only exists when they overlap.
- **No test asserted the requirement.** Every test I wrote asserted what my
  implementation did - key stored, key never returned - which is precisely
  the thing that was wrong. A test can only catch a misread requirement if
  someone writes down the requirement first.

## Still open

- The recovery phrase is shown exactly once, at creation. An interrupted
  onboarding leaves a working wallet whose phrase can never be shown again.
  Fixing it means storing the mnemonic encrypted as well as the key.
- Shipping the key to the browser means an XSS on this app is a wallet
  compromise. That is inherent to a browser-side signer and matches the
  mobile model, but it is a real property of the design and should be
  weighed before mainnet.
