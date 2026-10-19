// Run two instances (PORT=3000, PORT=3001) on one Postgres + REDIS_URL first; fails without the Redis adapter.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const { io } = require('socket.io-client');

const PORT_A = process.env.PORT_A ?? '3000';
const PORT_B = process.env.PORT_B ?? '3001';
const TIMEOUT_MS = 5000;

function loadJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }
  const envPath = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  try {
    const line = readFileSync(envPath, 'utf8')
      .split('\n')
      .find(l => l.startsWith('JWT_SECRET='));
    if (line) {
      return line.slice('JWT_SECRET='.length).trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    // Fall through to the error below.
  }
  console.error('JWT_SECRET not found (env or apps/server/.env)');
  process.exit(1);
}

const secret = loadJwtSecret();
const roomId = randomUUID();
const channel = `game:${roomId}`;

function connect(port, sub) {
  return new Promise((resolve, reject) => {
    const socket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      auth: { token: jwt.sign({ sub }, secret, { expiresIn: '5m' }) },
      reconnection: false,
      timeout: TIMEOUT_MS,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', err =>
      reject(new Error(`connect to :${port} failed: ${err.message}`)),
    );
  });
}

async function main() {
  const a = await connect(PORT_A, 'verify-user-a');
  const b = await connect(PORT_B, 'verify-user-b');
  console.log(`connected: A -> :${PORT_A}, B -> :${PORT_B}`);

  const received = new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            `A never received B's message. Cross-instance broadcast is NOT ` +
              `working - are both instances running with the same REDIS_URL?`,
          ),
        ),
      TIMEOUT_MS,
    );
    a.on('game:message', messages => {
      clearTimeout(timer);
      resolve(messages);
    });
  });

  a.emit('channel:join', { channel });
  await new Promise(r => setTimeout(r, 300));
  b.emit('game:message', { roomId, text: 'ping across instances' });

  const messages = await received;
  console.log('A received via Redis pub/sub:', messages);
  console.log('PASS: redis adapter relays broadcasts across instances');
  a.close();
  b.close();
}

main().catch(err => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
