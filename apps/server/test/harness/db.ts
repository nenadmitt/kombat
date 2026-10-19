import { DataSource } from 'typeorm';

// Separate from the stake-pot suite's database: this suite truncates the whole schema.
const CONNECTION = {
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(process.env.POSTGRES_PORT ?? '5433', 10),
  username: process.env.POSTGRES_USER ?? 'admin',
  password: process.env.POSTGRES_PASSWORD ?? 'admin',
  ssl:
    process.env.POSTGRES_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
};

// `migrations_typeorm` is deliberately absent.
const TABLES = [
  'stake_ledger_entries',
  'stake_pot_withdrawals',
  'stake_pot_grants',
  'stake_pot_cursor',
  'staked_balances',
  'match_settlements',
  'game_rooms',
  'email_login_tokens',
  'refresh_tokens',
  'wallets',
  'users',
];

// Postgres has no CREATE DATABASE IF NOT EXISTS; 42P04 is "already exists".
export async function ensureE2eDatabase(): Promise<void> {
  const admin = new DataSource({
    type: 'postgres',
    ...CONNECTION,
    database: 'postgres',
  });
  await admin.initialize();
  try {
    await admin.query(`CREATE DATABASE "${process.env.POSTGRES_DB}"`);
  } catch (error) {
    if ((error as { code?: string }).code !== '42P04') {
      throw error;
    }
  } finally {
    await admin.destroy();
  }
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `TRUNCATE ${TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
