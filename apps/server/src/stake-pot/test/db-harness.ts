import { join } from 'path';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';

config();

/**
 * Ledger tests run against a real Postgres 18 - `uuidv7()` defaults and row
 * locking are exactly what they exercise, so an in-memory driver would prove
 * nothing.
 *
 * Same server as the app, but its own database (`<POSTGRES_DB>_test`), created
 * on first run. It has to be a separate database: the suite truncates the
 * stake-pot tables between cases, and doing that to the development database
 * while a dev server is running wipes the deposit cursor mid-scan, which sends
 * the watcher back to the deploy block and re-credits every deposit it finds.
 */
const BASE_DB = process.env.POSTGRES_DB ?? 'gaming_platform';

const CONNECTION = {
  host: process.env.TEST_POSTGRES_HOST ?? process.env.POSTGRES_HOST ?? 'localhost',
  port: parseInt(
    process.env.TEST_POSTGRES_PORT ?? process.env.POSTGRES_PORT ?? '5433',
    10,
  ),
  username: process.env.TEST_POSTGRES_USER ?? process.env.POSTGRES_USER ?? 'admin',
  password:
    process.env.TEST_POSTGRES_PASSWORD ?? process.env.POSTGRES_PASSWORD ?? 'admin',
  ssl:
    (process.env.TEST_POSTGRES_SSL ?? process.env.POSTGRES_SSL) === 'true'
      ? { rejectUnauthorized: false }
      : false,
};

export const TEST_DB = {
  ...CONNECTION,
  database: process.env.TEST_POSTGRES_DB ?? `${BASE_DB}_test`,
};

/** Tables the stake-pot tests own; truncated between cases. */
const POT_TABLES = [
  'stake_ledger_entries',
  'stake_pot_withdrawals',
  'stake_pot_grants',
  'staked_balances',
  'stake_pot_cursor',
];

/** Postgres has no CREATE DATABASE IF NOT EXISTS; 42P04 is "already exists". */
async function ensureDatabase(): Promise<void> {
  const admin = new DataSource({
    type: 'postgres',
    ...CONNECTION,
    database: 'postgres',
  });
  await admin.initialize();
  try {
    await admin.query(`CREATE DATABASE "${TEST_DB.database}"`);
  } catch (error) {
    if ((error as { code?: string }).code !== '42P04') {
      throw error;
    }
  } finally {
    await admin.destroy();
  }
}

export async function createTestDataSource(): Promise<DataSource> {
  await ensureDatabase();
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
