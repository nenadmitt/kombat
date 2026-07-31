import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from 'dotenv';
import pg from 'pg';

config({ path: '.env.local' });
config();

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

/** Identity of "the migration lock" across every instance and release. */
const LOCK_KEY = 4314907002n;

function connectionConfig() {
  const ssl = process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false;
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl };
  }
  return {
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT ?? '5432', 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    ssl,
  };
}

async function main() {
  const client = new pg.Client(connectionConfig());
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "migrations_web" (
        "name" character varying(255) NOT NULL,
        "applied_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_migrations_web" PRIMARY KEY ("name")
      )
    `);

    // Two instances booting together otherwise both see the same pending list
    // and the second dies on "relation already exists".
    await client.query(`SET lock_timeout = '5min'`);
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY.toString()]);

    try {
      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
      const { rows } = await client.query('SELECT name FROM "migrations_web"');
      const applied = new Set(rows.map((r) => r.name));

      const pending = files.filter((f) => !applied.has(f));
      if (pending.length === 0) {
        console.log('No pending migrations.');
        return;
      }

      for (const file of pending) {
        const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO "migrations_web" ("name") VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`Applied migration: ${file}`);
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
      console.log(`Applied ${pending.length} migration(s).`);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY.toString()]);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
