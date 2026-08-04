/**
 * viem reports a revert as a multi-paragraph dump with the ABI, args and a
 * docs link. None of that is readable on a phone, so known failures get their
 * own sentence and anything unrecognised is cut to its first line.
 */

/** OpenZeppelin v5 custom errors. erc20Abi carries no error entries, so viem
 *  cannot decode these and prints the raw selector instead. */
const SELECTORS: Record<string, string> = {
  '0xe450d38c': 'insufficient-balance',
  '0xfb8f41b2': 'insufficient-allowance',
  '0xec442f05': 'invalid-receiver',
};

export function describeTransferError(err: unknown, symbol: string): string {
  const raw = err instanceof Error ? err.message : String(err);

  for (const [selector, kind] of Object.entries(SELECTORS)) {
    if (!raw.includes(selector)) continue;
    if (kind === 'insufficient-balance') {
      return `Not enough ${symbol} in this wallet to send that amount.`;
    }
    if (kind === 'insufficient-allowance') {
      return `This wallet has not approved enough ${symbol} to send.`;
    }
    return 'That recipient address cannot receive this token.';
  }

  if (/insufficient funds/i.test(raw)) {
    return 'Not enough ETH in this wallet to cover the network fee.';
  }
  if (/user rejected|denied transaction/i.test(raw)) {
    return 'You cancelled the transaction.';
  }
  if (/nonce/i.test(raw)) {
    return 'A previous transaction is still pending. Wait for it to confirm.';
  }
  if (/network|fetch|timeout/i.test(raw)) {
    return 'Could not reach the network. Check your connection and try again.';
  }

  return raw.split('\n')[0].trim() || 'Withdrawal failed';
}
