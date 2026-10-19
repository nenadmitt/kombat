# apps/evm-contracts

Solidity contracts for Kombat's stakes, built with
[Foundry](https://book.getfoundry.sh/).

```
src/
  StakePot.sol     pooled custody that players deposit into
  KombatCoin.sol   KOMBAT, the platform's fixed-supply ERC-20
  MockUSDC.sol     testnet USDC with a public faucet
script/
  DeployStakePot.s.sol
  DeployKombatCoin.s.sol
test/              forge tests (+ test/mocks)
```

## Deployed (Sepolia)

| Contract | Address |
| --- | --- |
| StakePot | [`0xa3Ff9Ef44aeD74C773Cb69692f334dD3cB3AE529`](https://sepolia.etherscan.io/address/0xa3Ff9Ef44aeD74C773Cb69692f334dD3cB3AE529) |
| KombatCoin | [`0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0`](https://sepolia.etherscan.io/address/0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0) |

The token addresses the apps use, including the third-party stablecoins, are
listed per chain in `packages/core/src/wallets/token-registry.ts`.

## StakePot

Players deposit once into a shared pool. Every staked match after that locks,
settles and pays fees in the server's off-chain ledger, so a match costs no
on-chain transaction at all. The contract keeps no per-user balances: it
cannot see match results, so it could not validate a withdrawal amount
anyway.

| Function | Caller | Purpose |
| --- | --- | --- |
| `stakeWithPermit(beneficiary, token, value, sig)` | anyone | Deposit an EIP-2612 token in one transaction (the mobile app signs the permit locally) |
| `stake(beneficiary, token, value)` | anyone | Deposit an approved ERC-20 |
| `stakeNative(beneficiary)` | anyone | Deposit native ETH |
| `withdrawTo(withdrawalId, to, token, value)` | operator | Pay out on the platform's authority: player withdrawals and fee sweeps |
| `ownerWithdrawTo(withdrawalId, to, token, value)` | owner | Rescue path; ignores `paused` and the daily limit |
| `setPaused`, `setTokenAllowed`, `setDailyWithdrawLimit`, `setOperator` | owner | Administration |

`beneficiary` is separate from the payer, so a deposit from an exchange or a
second wallet credits the right player.

Trust model:

- **This is custody.** A compromised operator key could withdraw pooled
  funds. The contract bounds the damage instead of preventing it: a per-token
  limit over a rolling 24 hour window, and an owner (cold key) that can pause
  everything and then rescue funds with `ownerWithdrawTo`.
- **Exactly-once withdrawals.** Each `withdrawalId` pays at most once across
  both withdrawal functions. That is what lets the server retry an uncertain
  send after a crash: a duplicate reverts with `AlreadyProcessed`.
- **The server ledger is the authority** on who owns what. The invariant
  `holdings(token) == sum(ledger balances) + sum(in-flight withdrawals)` is
  checked by the server's reconciliation job, not on-chain.
- Only allowlisted tokens are accepted. Fee-on-transfer and rebasing tokens
  are not supported, since the `Staked` event carries the requested value.
- Reentrancy is guarded with `ReentrancyGuardTransient` (EIP-1153), so the
  target chain must support Cancun.

## KombatCoin

An 18-decimal ERC-20 with EIP-2612 permit and a fixed supply of 100,000,000
minted at deployment. There is no mint function. `DeployKombatCoin.s.sol`
sends a float to the server's signup faucet wallet and the rest to the
treasury.

## Usage

Run `npm install` at the repo root first: OpenZeppelin comes from npm and is
wired in through `remappings.txt`. `forge-std` is vendored under `lib/`.

```bash
cd apps/evm-contracts
forge build
forge test
forge test --gas-report
forge coverage
forge fmt
```

The same commands are available as workspace scripts (`build`, `test`,
`test:gas`, `coverage`, `fmt`, `fmt:check`, `snapshot`, `anvil`, `clean`),
for example `npm test --workspace @gaming-platform/evm-contracts`.

### Deploying

```bash
cp .env.example .env   # keys, RPC URLs, explorer API keys, script inputs
source .env

forge script script/DeployKombatCoin.s.sol \
  --rpc-url sepolia --private-key $PRIVATE_KEY --broadcast --verify

forge script script/DeployStakePot.s.sol \
  --rpc-url sepolia --private-key $PRIVATE_KEY --broadcast --verify
```

`.env` holds `PRIVATE_KEY`, `MAINNET_RPC_URL`, `SEPOLIA_RPC_URL`,
`BASE_RPC_URL`, `BASE_SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`, `BASESCAN_API_KEY`,
and the script inputs: `FAUCET_ADDRESS` (required by `DeployKombatCoin`), and
`KOMBAT_ADDRESS` / `USDC_ADDRESS` (optional overrides of `DeployStakePot`'s
Sepolia defaults).

`--rpc-url` takes a URL or one of the aliases in `foundry.toml`
(`mainnet`, `sepolia`, `base`, `base_sepolia`). `DeployStakePot` makes the
broadcaster the operator, allowlists ETH, KOMBAT and USDC, sets their daily withdrawal limits, and
hands ownership to the platform owner key. It prints the deploy block: set
both `STAKE_POT_ADDRESS` and `STAKE_POT_DEPLOY_BLOCK` on the server, or
deposits made before the watcher's first scan are not credited. Any token
allowlisted on the pot must also be in the core token registry.
