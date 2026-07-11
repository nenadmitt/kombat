# @gaming-platform/evm-contracts

Solidity contracts for the platform's on-chain payment flows (match stakes,
payouts, platform fees), built with [Foundry](https://book.getfoundry.sh/).

```
.
├── src/
│   ├── KombatCoin.sol   # KC — the platform's play currency
│   └── MatchEscrow.sol  # 1v1 stake escrow
├── test/                # forge tests (+ test/mocks)
├── script/              # deployment scripts
├── lib/                 # forge-std (vendored); OZ comes from npm
└── foundry.toml
```

## Deployed contracts

| Contract | Network | Address |
| --- | --- | --- |
| KombatCoin | Sepolia | [`0xFE25C2b2400144c6536b9F707F06b751D6eeF943`](https://sepolia.etherscan.io/address/0xFE25C2b2400144c6536b9F707F06b751D6eeF943) |
| MatchEscrow v2 | Sepolia | [`0x968696cf210a328c57C8Dff3079756BA945cF577`](https://sepolia.etherscan.io/address/0x968696cf210a328c57C8Dff3079756BA945cF577) |
| MockUSDC | Sepolia | [`0x277c9f3957633C99ef8F7421B980B50C41b31a7b`](https://sepolia.etherscan.io/address/0x277c9f3957633C99ef8F7421B980B50C41b31a7b) |

Roles: owner (admin + fee withdrawal) is the platform cold key
`0x0aB34352B087a107302aFF5d155e23a11637Caa1`; operator (creates/funds/
settles — the game server's hot signer) is `0x4b9801173b21cBb3f290eaDED98D8f5AdE8D90e5`.
Allowlisted stake assets: native ETH, KombatCoin, MockUSDC.

The previous v1 escrow (`0x2889A311…D874A`, operator-funded pot) is
superseded — v2 pulls stakes from the players themselves (permits for
USDC/KOMBAT, `fundNative` for ETH), the fee is owner-updatable, and the
operator can `voidStake` for immediate refunds on cancelled matches.

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

## Dependencies

Solidity dependencies come from npm where possible: `@openzeppelin/contracts`
is a regular npm dependency of this workspace (hoisted to the repo root's
`node_modules` and pinned by the lockfile), wired to Foundry via
`remappings.txt` and `foundry.toml`'s `libs`. Run `npm install` at the repo
root before building.

`forge-std` has no official npm package, so it stays vendored under
`lib/forge-std` as plain files (installed with `forge install --no-git`) —
tracked directly in git, no submodule step needed after cloning.
