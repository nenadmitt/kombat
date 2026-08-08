import { config } from 'dotenv';

config();

/**
 * Runs before the app module is imported, which is the only window that works:
 * `ConfigModule.forRoot` assigns .env values only for keys not already present
 * in `process.env`, so setting them here wins. Empty string rather than
 * `delete` for the same reason — a deleted key is eligible for .env again.
 */
const BASE_DB = process.env.POSTGRES_DB ?? 'gaming_platform';

process.env.POSTGRES_DB = process.env.E2E_POSTGRES_DB ?? `${BASE_DB}_e2e`;

// In-memory cache and socket adapter. Sharing the dev Redis would let a
// running server's deadline schedule and match state bleed into the suite.
process.env.REDIS_URL = '';

// Staking stays off for now: every chain-backed job is guarded on these, so
// unsetting them keeps the watchers and sweepers from spinning. Phase 4 seeds
// balances directly rather than turning any of this on.
process.env.CHAIN_RPC_URL = '';
process.env.STAKE_POT_ADDRESS = '';
process.env.OPERATOR_PRIVATE_KEY = '';
process.env.FAUCET_KEY = '';
process.env.RESEND_API_KEY = '';

// Custodial key encryption. A fixed 32-byte key: the suite asserts that a
// stored key decrypts back, which needs the value to be stable and valid.
process.env.W_ENCRYPT = 'ZTJlLXRlc3Qta2V5LWZvci13YWxsZXRzLTMyYnl0ZXM=';
