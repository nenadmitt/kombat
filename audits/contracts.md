# Audit — `apps/evm-contracts`

**Scope:** `src/StakePot.sol`, `src/KombatCoin.sol`, `src/MockUSDC.sol`, `script/*`, `test/*`, `foundry.toml`, and the server ABI mirror `apps/server/src/stake-pot/stake-pot.abi.ts`.
**Toolchain:** solc 0.8.26 (pinned), EVM `cancun`, OpenZeppelin 5.6.1, forge-std. `forge test`: 50/50 pass.
**Reviewed by:** two independent passes; findings below are the union, de-duplicated.

## Bottom line (answers the primary concern)

**There is no way for an external attacker — anyone who is not the `operator` or `owner` key — to drain the pot.** Every outflow (`withdrawTo` = `onlyOperator`, `ownerWithdrawTo` = `onlyOwner`) is access-gated. There is no `delegatecall`, no arbitrary external call, no `selfdestruct`, no fund-moving `receive`/`fallback`, no unguarded approval. Deposits are strictly additive. Reentrancy is real but closed (see I-1). Idempotency and the daily-limit math are correct and well-tested.

The only residual exposure is exactly the **documented custody trust**: a compromised `operator` can withdraw up to the daily limit; a compromised `owner` can withdraw everything. That is the accepted trust model, not a bug. **No Critical or High findings.**

## Medium

### M-1 — "Rolling 24h" limit is a fixed window: real blast radius is 2× the cap
`src/StakePot.sol:290-303`. `_consumeWithdrawAllowance` resets the window on the first withdrawal after expiry, so a compromised operator can drain the full `dailyWithdrawLimit` at the tail of one window and the full limit again seconds later when it rolls — **2× the configured cap within minutes**, repeatable every ~24h. Inherent to fixed-window limiters. Fix: size limits assuming worst case is 2×, correct the natspec ("rolling 24h" → fixed window, worst case 2×), or switch to a true sliding window / a shorter (e.g. hourly) window to tighten the bound.

### M-2 — Fee-on-transfer / rebasing token would over-credit the ledger
`src/StakePot.sol:169-170, 189-190, 196`. `stake*` emit `Staked` with the *requested* `value`, and the server credits the ledger off that value. If such a token were ever allowlisted, the pool receives less than the ledger credits → `holdings()` drifts below aggregate ledger balances and the last withdrawals revert with `InsufficientHoldings` (an accounting insolvency). Gated behind the owner-only allowlist and documented as unsupported, so **not attacker-reachable** — but nothing enforces it on-chain. Fix: measure `balanceOf(this)` delta across the transfer and credit the delta, or keep the allowlist discipline and add an explicit off-chain check that only fee-free tokens are ever allowlisted.

## Low

### L-1 — Deploy flow leaves an `owner == operator` window; invariant claimed but not enforced
`src/StakePot.sol:117-121` and `script/DeployStakePot.s.sol:50,61`. The header comment states "Owner and operator must be different keys," but the constructor never checks it, and the deploy script sets both to the broadcaster and only later `transferOwnership`s to the cold key. If the script dies between deploy and the transfer, the hot key holds both roles — and `ownerWithdrawTo` (which bypasses `paused` **and** the daily limit) becomes reachable from the hot key, voiding every bound the trust model relies on. Fix: `if (initialOwner == operator_) revert ...` in the constructor (or a post-deploy assertion + a monitoring alert on `owner() == operator()`).

### L-2 — Single-step `Ownable`, live `renounceOwnership`
`src/StakePot.sol:36`. Uses OZ `Ownable`, not `Ownable2Step`; `transferOwnership`/`renounceOwnership` are both live. A typo'd transfer to a dead address or an accidental renounce permanently removes pause + `ownerWithdrawTo` rescue (operator payouts keep working, so it fails silently until an incident). Fix: `Ownable2Step`; if renounce is never intended, override it to revert.

### L-3 — Server ABI mirror omits errors the server can actually receive
`apps/server/src/stake-pot/stake-pot.abi.ts`. The mirror matches the contract exactly for everything it declares (verified per-selector), but its error list stops at the five recognised-by-name cases. `withdrawTo` can also revert with `NativeTransferFailed(address,uint256)`, `ZeroAddress()`, `ZeroValue()`, and OZ's `SafeERC20FailedOperation(address)`. `NativeTransferFailed` in particular is **player-triggerable** (withdrawing to a contract wallet that rejects ETH), and without it in the mirror the sweeper can't classify the revert and may retry blindly. Fix: add at least `NativeTransferFailed` to the mirror so it can be treated as "recipient problem, don't retry."

### L-4 — `holdings()` is a live `balanceOf`, inflatable by donation
`src/StakePot.sol:268-270`. The withdraw ceiling is the live balance, so force-fed ETH (`selfdestruct`/coinbase) or a direct token transfer raises it above what the ledger tracks. **Not an attacker drain** (only operator/owner withdraw, daily limit still applies) and there is no read-only-reentrancy exploit (`holdings()` is only read inside `nonReentrant` functions with clean CEI). Flagged so the reconciliation job treats a *surplus* as benign, never an alert.

## Informational

- **I-1 — Reentrancy closed (confirmed).** All entrypoints carry `nonReentrant` over OZ `ReentrancyGuardTransient`; the guard is held across the native `.call` payout, blocking cross-function reentry. Tests cover the malicious-operator reentry case. **Caveat:** `ReentrancyGuardTransient` needs EIP-1153 (transient storage) — all four configured targets (mainnet, Sepolia, Base, Base Sepolia) support Cancun, but deploying the same bytecode to a non-Cancun chain would make every guarded function revert. Worth a one-line note in the contract/README.
- **I-2 — `stakeWithPermit` try/catch is correct.** A front-runner can only replay the user's own signature (setting the pot's allowance to exactly `value`); the swallowed revert falls through to `safeTransferFrom`, which succeeds. No allowance zeroing/redirect, no DoS beyond a harmless retry. It binds the permit to `_msgSender()`, so no gasless relaying — the player's device pays gas (matches design).
- **I-3 — Withdrawal idempotency is sound.** `processedWithdrawals` is set before `_payout`; a failed native payout reverts the flag and the daily-limit consumption; the mapping is shared across the operator and owner paths, so no id ever pays twice. Ids are operator/owner-chosen and gated, so no third party can pre-register or grief an id.
- **I-4 — Deposit-spam griefing.** Anyone can `stake(beneficiary, token, 1)` and emit `Staked` for any beneficiary with no on-chain minimum. The server watcher must tolerate dust/spam credits (attacker pays gas — low practical risk).
- **I-5 — `withdrawTo` ignores `allowedTokens`** — correct: de-allowlisting a token must not trap already-pooled funds; also lets the operator sweep airdropped junk.
- **I-6 — `KombatCoin` is clean.** Fixed 100M supply minted once in the constructor, no post-deploy mint/owner/`_mint` exposure, standard ERC20 + ERC20Permit. No mint-authority risk.
- **I-7 — `MockUSDC` open faucet is testnet-only** (documented). `DeployStakePot.s.sol` allowlists it by default (Sepolia addresses) — running the script against another chain without `KOMBAT_ADDRESS`/`USDC_ADDRESS` overrides would allowlist dead addresses (harmless but worth a chain-id guard). Ensure the mainnet deploy allowlists only real USDC.
- **I-8 — Ops:** `apps/evm-contracts/.env` holds `PRIVATE_KEY`/`PLATFORM_PRIVATE_KEY` in plaintext — verified git-ignored and untracked. Consider a keystore (`cast wallet import`) over raw keys in `.env`.

## Priority

Act on M-1 (document/size the 2× blast radius) and L-1 (close the `owner == operator` deploy gap) before mainnet; add `NativeTransferFailed` to the ABI mirror (L-3). Everything else is hardening.
