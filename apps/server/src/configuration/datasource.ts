import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

config();

// TypeORM CLI only; the app gets its DataSource from DbModule.
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
  username: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
  ssl:
    process.env.POSTGRES_SSL === 'true'
      ? { rejectUnauthorized: false }
      : false,
  entities: [
    join(__dirname, '..', 'db', 'entities', '*.entity.{ts,js}'),
    join(__dirname, '..', 'stake-pot', 'entities', '*.entity.{ts,js}'),
  ],
  migrations: [join(__dirname, '..', 'db', 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations_typeorm',
});
