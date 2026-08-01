// Point every existing subname at its owner's wallet. Idempotent: names that
// already resolve are left alone.
import { readFileSync } from 'node:fs';
import { createOffchainClient } from '@thenamespace/offchain-manager';
import pg from 'pg';

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const client = createOffchainClient({ mode: 'mainnet', defaultApiKey: env.NAMESPACE_API_KEY });
const db = new pg.Client({
  host: env.POSTGRES_HOST,
  port: Number(env.POSTGRES_PORT ?? 5432),
  user: env.POSTGRES_USER,
  password: env.POSTGRES_PASSWORD,
  database: env.POSTGRES_DB,
});
await db.connect();

const { rows } = await db.query(`
  SELECT u.ens_name, w.address
  FROM users u
  JOIN wallets w ON w.user_id = u.id
  WHERE u.ens_name IS NOT NULL
`);
console.log(`${rows.length} name(s) with a wallet`);

for (const { ens_name: name, address } of rows) {
  const current = await client.getSingleSubname(name);
  const existing = current?.addresses?.['60'];
  if (existing && existing.toLowerCase() === address.toLowerCase()) {
    console.log(`skip ${name} (already resolves to ${existing})`);
    continue;
  }
  await client.setDefaultEvmAddress(name, address);
  const after = await client.getSingleSubname(name);
  console.log(`set  ${name} -> ${JSON.stringify(after?.addresses)}`);
}

await db.end();
