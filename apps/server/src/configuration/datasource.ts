import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config(); // Load .env file

/**
 * Used only by the TypeORM CLI (migration:generate / migration:run / migration:revert),
 * pointed at TS source directly via `typeorm-ts-node-commonjs` so migrations can be
 * generated without a build step. The app itself gets its DataSource from DbModule.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  // Mirrors DbModule: sslmode=require semantics for managed Postgres.
  ssl:
    process.env.POSTGRES_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  // Entities live under db/entities, except modules that own their own tables
  // so they can be extracted into a standalone service later (stake-pot).
  entities: [
    join(__dirname, '..', 'db', 'entities', '*.entity.{ts,js}'),
    join(__dirname, '..', 'stake-pot', 'entities', '*.entity.{ts,js}'),
  ],
  migrations: [join(__dirname, '..', 'db', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations_typeorm',
});
