# @gaming-platform/evm-contracts

Solidity contracts for the platform's on-chain payment flows (match
entry fees, payouts, etc.), built with [Foundry](https://book.getfoundry.sh/).

Currently a boilerplate: `Counter` is Foundry's default sample contract,
kept only as a build/test smoke check. Real payment contracts land here next.

```
.
├── src/            # contracts
├── test/           # forge tests
├── script/         # deployment / operational scripts
├── lib/            # dependencies (forge-std, vendored — not a git submodule)
└── foundry.toml
```

## Setup

```bash
cd apps/evm-contracts
cp .env.example .env   # fill in RPC URLs / keys before deploying or verifying
```

## Use

```bash
forge build              # compile
forge test                # run tests
forge test --gas-report   # run tests + gas report
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

```bash
forge script script/Counter.s.sol:CounterScript \
  --rpc-url sepolia \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --verify
```

`--rpc-url` accepts either a raw URL or one of the aliases defined in
`foundry.toml`'s `[rpc_endpoints]` (`mainnet`, `sepolia`, `base`,
`base_sepolia`), which read from `.env`.

## Dependencies

`forge-std` is vendored under `lib/forge-std` as plain files (installed with
`--no-git`) rather than a git submodule, so it's tracked directly by this
monorepo's git history — no `git submodule update --init` step needed after
cloning.

To add another dependency the same way:

```bash
forge install <org>/<repo> --no-git
```
