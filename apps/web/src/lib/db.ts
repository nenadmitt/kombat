import { Pool } from "pg";

function connectionConfig() {
  const ssl =
    process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false;
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, ssl };
  }
  return {
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT ?? "5432", 10),
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB,
    ssl,
  };
}

// Cached on globalThis: dev hot-reload would otherwise leak a pool per reload.
const globalForPool = globalThis as typeof globalThis & { kombatPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.kombatPool) {
    globalForPool.kombatPool = new Pool({ ...connectionConfig(), max: 5 });
  }
  return globalForPool.kombatPool;
}

export type TesterSignup = {
  id: string;
  username: string;
  email: string;
  country: string | null;
  createdAt: string;
  invitedAt: string | null;
};

const UNIQUE_VIOLATION = "23505";

export class DuplicateEmailError extends Error {}

export async function insertTesterSignup(input: {
  username: string | null;
  email: string;
  country: string | null;
}): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO "tester_signups" ("username", "email", "country")
       VALUES ($1, $2, $3)`,
      [input.username, input.email, input.country],
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === UNIQUE_VIOLATION
    ) {
      throw new DuplicateEmailError();
    }
    throw error;
  }
}

export async function listTesterSignups(): Promise<TesterSignup[]> {
  const { rows } = await getPool().query(
    `SELECT "id", "username", "email", "country", "created_at", "invited_at"
     FROM "tester_signups"
     ORDER BY "created_at" DESC
     LIMIT 1000`,
  );
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    email: row.email,
    country: row.country,
    createdAt: new Date(row.created_at).toISOString(),
    invitedAt: row.invited_at ? new Date(row.invited_at).toISOString() : null,
  }));
}

export async function deleteTesterSignups(ids: string[]): Promise<number> {
  const { rowCount } = await getPool().query(
    `DELETE FROM "tester_signups" WHERE "id" = ANY($1::uuid[])`,
    [ids],
  );
  return rowCount ?? 0;
}

/** Idempotent: re-marking keeps the original timestamp, un-marking clears it. */
export async function setTesterSignupsInvited(
  ids: string[],
  invited: boolean,
): Promise<number> {
  const { rowCount } = await getPool().query(
    invited
      ? `UPDATE "tester_signups" SET "invited_at" = now()
         WHERE "id" = ANY($1::uuid[]) AND "invited_at" IS NULL`
      : `UPDATE "tester_signups" SET "invited_at" = NULL
         WHERE "id" = ANY($1::uuid[]) AND "invited_at" IS NOT NULL`,
    [ids],
  );
  return rowCount ?? 0;
}
