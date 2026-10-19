// Hand-kept; must stay in sync with apps/evm-contracts/src/StakePot.sol.

export const STAKE_POT_ABI = [
  {
    type: 'event',
    name: 'Staked',
    inputs: [
      { name: 'beneficiary', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
      { name: 'sender', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'Withdrawn',
    inputs: [
      { name: 'withdrawalId', type: 'bytes32', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'token', type: 'address', indexed: true },
      { name: 'value', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'function',
    name: 'stake',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'beneficiary', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdrawTo',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'withdrawalId', type: 'bytes32' },
      { name: 'to', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'processedWithdrawals',
    stateMutability: 'view',
    inputs: [{ name: 'withdrawalId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'holdings',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'remainingDailyAllowance',
    stateMutability: 'view',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'error',
    name: 'AlreadyProcessed',
    inputs: [{ name: 'withdrawalId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'DailyLimitExceeded',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'requested', type: 'uint256' },
      { name: 'remaining', type: 'uint256' },
    ],
  },
  {
    type: 'error',
    name: 'InsufficientHoldings',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'requested', type: 'uint256' },
      { name: 'available', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'IsPaused', inputs: [] },
  { type: 'error', name: 'NotOperator', inputs: [] },
] as const;

export const ALREADY_PROCESSED_ERROR = 'AlreadyProcessed';
