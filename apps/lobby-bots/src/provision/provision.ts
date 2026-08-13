import { ApiError } from '@gaming-platform/core';

import { loginTestOtp, markAsBot } from '../auth/login';
import { loadConfig, type Config } from '../config';
import { createLogger, setLogLevel } from '../logger';
import { BotStore, type BotRecord } from '../state/bot-store';
import { NAME_POOL, availableNames } from './name-pool';

const log = createLogger('provision');

function emailFor(username: string): string {
  return `bot-${username.toLowerCase()}@bots.local`;
}

async function provisionOne(
  config: Config,
  username: string,
): Promise<BotRecord> {
  const email = emailFor(username);
  const session = await loginTestOtp(config, email);

  let finalName = username;
  try {
    await session.api.updateUsername(username);
  } catch (error) {
    // Taken by a real player: fall through to the next free pool name rather
    // than leaving the account nameless.
    if (error instanceof ApiError && error.status === 409) {
      const alternative = NAME_POOL.find(name => name !== username);
      if (!alternative) throw error;
      finalName = alternative;
      await session.api.updateUsername(alternative);
    } else {
      throw error;
    }
  }

  await markAsBot(config, session.userId);

  return {
    botId: session.userId,
    username: finalName,
    email,
    privateKey: null,
    userId: session.userId,
    provisionedAt: new Date().toISOString(),
    markedBotAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const countArg = process.argv.indexOf('--count');
  const count =
    countArg === -1 ? config.botCount : Number(process.argv[countArg + 1]);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error('--count must be a positive integer');
  }

  if (config.authMode !== 'test-otp') {
    throw new Error(
      'Only test-otp provisioning is implemented; siwe needs a signing key per account.',
    );
  }

  const store = new BotStore(config.stateFile);
  const existing = store.load();
  log.info(`${existing.length} bot(s) already provisioned, target ${count}`);

  // Re-attempt accounts whose is_bot call failed on an earlier run: an
  // unflagged bot is exactly what the flag exists to prevent.
  for (const record of existing.filter(item => item.markedBotAt === null)) {
    await markAsBot(config, record.userId);
    store.upsert({ ...record, markedBotAt: new Date().toISOString() });
    log.info(`${record.username}: marked as bot (retry)`);
  }

  const missing = count - existing.length;
  if (missing <= 0) {
    log.info('Nothing to do.');
    return;
  }

  for (const username of availableNames(
    name => store.hasUsername(name),
    missing,
  )) {
    const record = await provisionOne(config, username);
    store.upsert(record);
    log.info(`${record.username}: provisioned (${record.userId})`);
    // Sequential with jitter: a burst of identical signups is a pattern.
    await new Promise(resolve => setTimeout(resolve, 250 + Math.random() * 250));
  }

  log.info(`Done. ${store.all().length} bot(s) in ${config.stateFile}`);
}

main().catch(error => {
  log.error('Provisioning failed', error);
  process.exit(1);
});
