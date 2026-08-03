// Mint a subname for every user who has a username but no ens_name. The
// sibling ens-backfill.mjs repairs names that exist; this creates the missing
// ones. Idempotent, and DRY_RUN=1 prints the plan without touching anything.
//
// Targets the .env Postgres by default; set DATABASE_URL to point elsewhere.
import { readFileSync } from 'node:fs';
import { createOffchainClient, ChainName } from '@thenamespace/offchain-manager';
import { ensFullName, ensLabelCandidate, toEnsLabel } from '@gaming-platform/core';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const DRY_RUN = process.env.DRY_RUN === '1';
const PARENT = process.env.ENS_PARENT_NAME ?? env.ENS_PARENT_NAME ?? 'playkombat.xyz';
const MAX_LABEL_ATTEMPTS = 5;

const client = createOffchainClient({
  mode: 'mainnet',
  defaultApiKey: env.NAMESPACE_API_KEY,
});

const db = process.env.DATABASE_URL
  ? new pg.Client({
      connectionString: process.env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/, ''),
      ssl: { rejectUnauthorized: false },
    })
  : new pg.Client({
      host: env.POSTGRES_HOST,
      port: Number(env.POSTGRES_PORT ?? 5432),
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      database: env.POSTGRES_DB,
    });
await db.connect();

// Only users with a wallet: a name minted with no address resolves to nothing,
// which is the exact mess ens-backfill.mjs exists to clean up.
const { rows } = await db.query(`
  SELECT u.id, u.username, w.address
    FROM users u
    JOIN wallets w ON w.user_id = u.id
   WHERE u.ens_name IS NULL AND u.username IS NOT NULL
   ORDER BY u.created_at
`);
console.log(`${rows.length} user(s) with a wallet and no subname${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

let minted = 0;
for (const { id, username, address } of rows) {
  const base = toEnsLabel(username);
  if (!base) {
    console.log(`skip ${username}: no usable ENS label`);
    continue;
  }

  let done = false;
  for (let attempt = 1; attempt <= MAX_LABEL_ATTEMPTS && !done; attempt++) {
    const label = ensLabelCandidate(base, attempt);
    const fullName = ensFullName(label, PARENT);
    const { isAvailable } = await client.isSubnameAvailable(fullName);
    if (!isAvailable) {
      console.log(`  ${fullName} taken, trying next`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`would mint ${fullName} -> ${address} (${username})`);
      done = true;
      break;
    }

    // Claim the row before the API call, exactly as EnsSubnameService does:
    // the partial unique index is what stops two runs taking the same label,
    // and a name minted against a row we then fail to write is unattributable.
    const claim = await db.query(
      `UPDATE users SET ens_name = $1 WHERE id = $2 AND ens_name IS NULL`,
      [fullName, id],
    );
    if (claim.rowCount !== 1) {
      console.log(`  ${fullName} lost the claim race, trying next`);
      continue;
    }

    try {
      await client.createSubname({
        label,
        parentName: PARENT,
        owner: address,
        addresses: [{ chain: ChainName.Ethereum, value: address }],
        texts: [{ key: 'name', value: username }],
      });
      console.log(`minted ${fullName} -> ${address} (${username})`);
      minted++;
      done = true;
    } catch (error) {
      // Release the claim so a later run can retry the same label.
      await db.query(`UPDATE users SET ens_name = NULL WHERE id = $1`, [id]);
      console.log(`FAILED ${fullName}: ${error instanceof Error ? error.message : error}`);
      done = true;
    }
  }
  if (!done) {
    console.log(`skip ${username}: no free label after ${MAX_LABEL_ATTEMPTS} attempts`);
  }
}

console.log(`\n${DRY_RUN ? 'planned' : 'minted'}: ${DRY_RUN ? rows.length : minted}`);
await db.end();
