# evm-contracts — bugs and inconsistencies

## 2026-08-09 - DAI is allowlisted on the live pot with no daily withdrawal cap

- **Where:** StakePot Sepolia `0xa3Ff9Ef44aeD74C773Cb69692f334dD3cB3AE529`,
  on-chain state for DAI `0x776b6fC2eD15D6Bb5Fc32e0c89DE68683118c62A`
  (`allowedTokens` true, `dailyWithdrawLimit` 0).
- **Why it's wrong:** `dailyWithdrawLimit` 0 means unlimited, and that limit is
  the only bound on a compromised operator key — every other allowlisted asset
  has one (ETH 10, KOMBAT 500k, USDC 100k). DAI was also never recorded in
  `apps/evm-contracts/README.md`'s allowlisted-assets line, so it was allowed
  out-of-band at some point after deployment.
- **Suggested fix:** owner calls `setDailyWithdrawLimit(DAI, 100_000e18)` to
  match the USDC cap, and `DeployStakePot.s.sol` grows a DAI entry so a
  redeploy reproduces it.

## 2026-08-09 - DeployStakePot allowlists the superseded KombatCoin by default

- **Where:** `apps/evm-contracts/script/DeployStakePot.s.sol:32` (`DEFAULT_KOMBAT`).
- **Why it's wrong:** it points at `0xFE25C2b2400144c6536b9F707F06b751D6eeF943`,
  the KC retired in the 2026-07-30 redeployment. The live pot and
  `packages/core/src/wallets/token-registry.ts` both use
  `0x01a659Df789D3E433D7cdFf4CAc70596C56B03c0`. A redeploy without
  `KOMBAT_ADDRESS` set would allowlist a token no client can stake, and leave
  the real KC blocked. The neighbouring `DEFAULT_USDC` comment is stale too —
  it calls the address "MockUSDC" when it is Circle's Sepolia USDC.
- **Suggested fix:** point `DEFAULT_KOMBAT` at the current KC and correct the
  USDC comment.
