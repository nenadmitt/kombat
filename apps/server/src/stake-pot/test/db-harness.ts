import { join } from 'path';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

/**
 * Ledger tests run against a real Postgres 18 - `uuidv7()` defaults and
 * row-locking semantics are exactly what they exercise, so an in-memory driver
 * would prove nothing.
 *
 * Same database as the app by default (POSTGRES_* from .env). Between cases the
 * harness truncates only the four `stake_pot_*` / `staked_balances` /
 * `stake_ledger_entries` tables, never users, wallets or game_rooms - but that
 * does mean running the suite clears local pot balances. Set TEST_POSTGRES_*
 * to point at a throwaway database instead if that ever matters.
 */
export const TEST_DB = {
  host: process.env.TEST_POSTGRES_HOST ?? process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(
    process.env.TEST_POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? '5433',
    10,
  ),
  database:
    process.env.TEST_POSTGRES_DB ?? process.env.POSTGRES_DB ?? 'gaming_platform',
  username: process.env.TEST_POSTGRES_USER ?? process.env.POSTGRES_USER ?? 'admin',
  password:
    process.env.TEST_POSTGRES_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'admin',
  ssl:
    (process.env.TEST_POSTGRES_SSL ?? process.env.POSTGRES_SSL) === 'true'
      ? { rejectUnauthorized: false }
      : false,
};

/** Tables the stake-pot tests own; truncated between cases. */
const POT_TABLES = [
  'stake_ledger_entries',
  'stake_pot_withdrawals',
  'staked_balances',
  'stake_pot_cursor',
];

export async function createTestDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'postgres',
    ...TEST_DB,
    entities: [
      join(__dirname, '..', '..', 'db', 'entities', '*.entity.{ts,js}'),
      join(__dirname, '..', 'entities', '*.entity.{ts,js}'),
    ],
    migrations: [join(__dirname, '..', '..', 'db', 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations_typeorm',
    synchronize: false,
  });
  await dataSource.initialize();
  await dataSource.runMigrations();
  return dataSource;
}

export async function truncatePotTables(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `TRUNCATE ${POT_TABLES.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}

/** A stable uuid per label, so tests can name their actors readably. */
export function testUserId(label: string): string {
  const hex = Buffer.from(label).toString('hex').padEnd(12, '0').slice(0, 12);
  return `00000000-0000-4000-8000-${hex}`;
}
