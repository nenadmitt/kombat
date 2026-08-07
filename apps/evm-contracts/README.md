# @gaming-platform/evm-contracts

Solidity contracts for the platform's on-chain payment flows (match stakes,
payouts, platform fees), built with [Foundry](https://book.getfoundry.sh/).

```
.
├── src/
│   ├── KombatCoin.sol   # KC — the platform's play currency
│   ├── MatchEscrow.sol  # per-match stake escrow (being superseded)
│   └── StakePot.sol     # pooled stake balance + off-chain ledger
├── test/                # forge tests (+ test/mocks)
├── script/              # deployment scripts
├── lib/                 # forge-std (vendored); OZ comes from npm
└── foundry.toml
```

## Deployed contracts

| Contract | Network | Address |
| --- | --- | --- |
| KombatCoin | Sepolia | [`0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0`](https://sepolia.etherscan.io/address/0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0) |
| KombatCoin (superseded) | Sepolia | [`0xFE25C2b2400144c6536b9F707F06b751D6eeF943`](https://sepolia.etherscan.io/address/0xFE25C2b2400144c6536b9F707F06b751D6eeF943) |
| MatchEscrow v2 | Sepolia | [`0x2D3C6e3b41365B2b221982B5fAc5F496746160f2`](https://sepolia.etherscan.io/address/0x2D3C6e3b41365B2b221982B5fAc5F496746160f2) |
| USDC (Circle) | Sepolia | [`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238) |
| StakePot | Sepolia | [`0xa3Ff9Ef44aeD74C773Cb69692f334dD3cB3AE529`](https://sepolia.etherscan.io/address/0xa3Ff9Ef44aeD74C773Cb69692f334dD3cB3AE529) |

Roles: owner (admin + fee withdrawal) is the platform cold key
`0x0aB34352B087a107302aFF5d155e23a11637Caa1`; operator (creates/funds/
settles — the game server's hot signer) is `0x4b9801173b21cBb3f290eaDED98D8f5AdE8D90e5`.
Allowlisted stake assets: native ETH, KombatCoin, USDC.

KombatCoin was redeployed on 2026-07-30 (block 11378578) together with
StakePot (block 11378580). KC has no mint function, so a fresh deployment was
the only way to position a float for the signup faucet at genesis: 1,000,000 KC
to the faucet hot wallet `0x998197bEB90cF6a35C010AfF03221644cf104855`
(`FAUCET_KEY` on the server), 99,000,000 KC to the treasury. The old KC is
still referenced by the retired MatchEscrow deployment; the server's
`TOKEN_REGISTRY` and the mobile `CHAIN_TOKENS` both point at the new one.

The previous escrows (`0x2889A311…D874A` operator-funded; `0x968696cf…F577`
v2 without the batched allowance open) are superseded. v2 pulls stakes from
the players themselves — the primary path is `openWithApprovals` (one
operator tx pulling both stakes via standing allowances the platform
pre-approves from its custodial wallets); permits and `fundNative` (ETH)
remain. The fee is owner-updatable and the operator can `voidStake` for
immediate refunds on cancelled matches.

## Contracts

### KombatCoin (KC)

Standard 18-decimal ERC20 with EIP-2612 permit and a fixed supply:
100,000,000 KC minted to the platform treasury at deployment, with no way to
mint more. Distribution is earn-only as a matter of platform policy — the
treasury hands tokens out as rewards. The token itself stays freely
transferable.

### MatchEscrow

Minimal 1v1 stake escrow driven by a trusted `operator` (the platform's game
contract or backend key). Supports any exact-transfer ERC20 and native ETH
(`token = address(0)`).

Lifecycle — three functions:

| Function | Who | What |
| --- | --- | --- |
| `createStake(matchId, player1, player2, token, amount)` | operator | Opens a match and escrows the whole pot (`2 × amount`) from the caller in one call: attached as `msg.value` for ETH, or pulled via a prior ERC20 approval. The match is immediately `Active`. |
| `settleStake(matchId, winner)` | operator | Pays the winner the pot minus the platform fee. The winner must be one of the two recorded players. |
| `withdrawStake(matchId)` | anyone | Escape hatch: if a match is still unsettled 7 days after creation (`WITHDRAW_DELAY`), refunds each player's stake **to the players directly, never to the operator**. |

Fees:

- `feeBps` is set at deployment (immutable) and hard-capped at 10%
  (`MAX_FEE_BPS = 1000`). The deployment script sets **5%** (500 bps).
- Fees are **not** transferred out on settlement — they accrue on the
  contract in a per-token `feePot`. The owner withdraws them explicitly with
  `withdrawFeePot(token, to, amount)`.
- `withdrawFeePot` is capped at what settlements have actually accrued, so
  fee withdrawals can never touch an active match's escrowed stakes.

Trust model & caveats:

- The operator can settle to either player, but can never redirect a pot to
  an arbitrary address; if the platform goes dark, `withdrawStake` makes
  every stake recoverable by the players after 7 days.
- Because timeout refunds pay the players, the operator should only
  `createStake` with funds actually collected from those two players.
- Fee-on-transfer / rebasing tokens are **not supported** — they transfer
  less than the pot and would drain other matches' balances.
- Reentrancy is guarded with OpenZeppelin's `ReentrancyGuardTransient`
  (EIP-1153 transient storage), so the target chain must support Cancun —
  mainnet, Base and both Sepolias do.

### StakePot

Supersedes per-match escrow. Players deposit once into a shared pool; every
match's stakes, prizes and fees are settled in the server's off-chain ledger,
so a staked match costs **zero** on-chain transactions (the escrow path cost
two per match, ~350k gas). The contract keeps **no per-user balances** — it
cannot know a match result, so it cannot validate a withdrawal amount.

| Function | Who | What |
| --- | --- | --- |
| `stakeWithPermit(beneficiary, token, value, sig)` | anyone | Deposit an EIP-2612 token in one tx (the mobile app signs the permit locally). Primary deposit path. |
| `stake(beneficiary, token, value)` | anyone | Deposit a plain ERC20 the caller has approved. |
| `stakeNative(beneficiary)` | anyone | Deposit native ETH with the amount attached. |
| `withdrawTo(withdrawalId, to, token, value)` | operator | Pay out on the platform's authority — player withdrawals and fee sweeps alike. Exactly-once per `withdrawalId`. |
| `ownerWithdrawTo(withdrawalId, to, token, value)` | owner | Escape hatch. Ignores `paused` and the daily limit (both bound a compromised *operator*, and pausing is when the owner most needs to act). Shares the `withdrawalId` space, so no id pays twice via either route. |

`beneficiary` is separate from the payer, so topping up from an exchange or
another wallet credits the right player.

Trust model & caveats:

- **This is custody.** A compromised operator key can withdraw pooled funds
  to any address. The contract bounds the damage rather than preventing it:
  `dailyWithdrawLimit` caps payouts per token per rolling 24h, and the owner
  (a cold key, ideally a multisig) can `setPaused(true)` to freeze all
  movement and then `ownerWithdrawTo` to rescue the pool. There is no
  *player*-side escape hatch — unlike MatchEscrow's 7-day `withdrawStake`, a
  dark server means funds stay pooled until the owner acts, so recovery is a
  promise the operator makes rather than one the contract keeps.
- Anything moved with `ownerWithdrawTo` bypasses the ledger, so reconciliation
  will report a shortfall afterwards. That is intended: it is a rescue, not a
  payout path. Ordinary withdrawals and fee sweeps go through the server.
- `withdrawalId` replay protection is what makes the server's crash-retry
  loop safe: a resend after an uncertain outcome reverts `AlreadyProcessed`
  instead of paying twice.
- The authority on who owns what is the server ledger. The tying invariant,
  `holdings(token) == Σ(ledger balances) + Σ(in-flight withdrawals)`, is
  asserted by the server's reconciliation job — the contract can't check it.
- Fee-on-transfer / rebasing tokens are **not supported**: the `Staked` event
  carries the requested value, which is what the ledger credits.
- A future user-signed cumulative-claim withdrawal path can be added without
  disturbing stored state; the absence of on-chain per-user balances is what
  keeps that open.

## Setup

```bash
cd apps/evm-contracts
cp .env.example .env   # fill in RPC URLs / keys before deploying or verifying
```

## Use

```bash
forge build                # compile
forge test                 # run tests
forge test --gas-report    # run tests + gas report
forge coverage             # coverage report
forge fmt                  # format
anvil                      # local devnet
```

Or via the root workspace scripts (from the repo root):

```bash
npm run build --workspace @gaming-platform/evm-contracts
npm run test --workspace @gaming-platform/evm-contracts
```

### Deploy

`script/DeployMatchEscrow.s.sol` deploys both contracts in one run:
KombatCoin (fixed supply minted to the platform key) and MatchEscrow with a
5% fee and the platform key `0x0aB34352B087a107302aFF5d155e23a11637Caa1` as
both owner (admin + fee withdrawal) and operator (creates/settles stakes).
The operator can be repointed later via `setOperator` — e.g. to the game
contract once it is deployed.

```bash
# dry run
forge script script/DeployMatchEscrow.s.sol --rpc-url sepolia

# deploy + verify
source .env && forge script script/DeployMatchEscrow.s.sol \
  --rpc-url sepolia \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

After a broadcast, the deployed addresses land in
`broadcast/DeployMatchEscrow.s.sol/<chainId>/run-latest.json` — record them
in the table at the top of this file.

`--rpc-url` accepts either a raw URL or one of the aliases defined in
`foundry.toml`'s `[rpc_endpoints]` (`mainnet`, `sepolia`, `base`,
`base_sepolia`), which read from `.env`.

`script/DeployStakePot.s.sol` deploys the pot the same way (broadcaster
becomes operator, ownership transfers to the platform cold key), allowlists
ETH/KOMBAT/USDC and sets their rolling 24h withdrawal caps:

```bash
source .env && forge script script/DeployStakePot.s.sol \
  --rpc-url sepolia --private-key $PRIVATE_KEY --broadcast --verify
```

Then set `STAKE_POT_ADDRESS` **and `STAKE_POT_DEPLOY_BLOCK`** (printed by the
script) on the server — the deposit watcher needs the block to know where to
start scanning. Every token allowlisted here must also exist in the server's
`apps/server/src/chain/token-registry.ts`.

## Dependencies

Solidity dependencies come from npm where possible: `@openzeppelin/contracts`
is a regular npm dependency of this workspace (hoisted to the repo root's
`node_modules` and pinned by the lockfile), wired to Foundry via
`remappings.txt` and `foundry.toml`'s `libs`. Run `npm install` at the repo
root before building.

`forge-std` has no official npm package, so it stays vendored under
`lib/forge-std` as plain files (installed with `forge install --no-git`) —
tracked directly in git, no submodule step needed after cloning.
