import { config } from 'dotenv';

config();

// Runs before the app loads: ConfigModule only fills keys missing from process.env, so '' beats delete.
const BASE_DB = process.env.POSTGRES_DB ?? 'gaming_platform';

process.env.POSTGRES_DB = process.env.E2E_POSTGRES_DB ?? `${BASE_DB}_e2e`;

// Sharing the dev Redis would let a running server's deadlines and match state bleed into the suite.
process.env.REDIS_URL = '';

// Every chain-backed job is guarded on these; unset, the watchers and sweepers don't spin.
process.env.CHAIN_RPC_URL = '';
process.env.STAKE_POT_ADDRESS = '';
process.env.OPERATOR_PRIVATE_KEY = '';
process.env.FAUCET_KEY = '';
process.env.RESEND_API_KEY = '';

// A fixed valid key: the suite asserts that a stored key decrypts back.
process.env.W_ENCRYPT = 'ZTJlLXRlc3Qta2V5LWZvci13YWxsZXRzLTMyYnl0ZXM=';

process.env.DEMO_LOGIN_EMAIL = 'demo@e2e.local';
// Eight characters: ExchangeTokenDto validates the length.
process.env.DEMO_LOGIN_CODE = 'DEMO2026';
