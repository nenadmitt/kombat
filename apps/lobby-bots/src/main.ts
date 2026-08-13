import { BOT_ACCOUNTS } from '@gaming-platform/core';

import { loadConfig } from './config';
import { createLogger, setLogLevel } from './logger';
import { Orchestrator } from './orchestrator/orchestrator';

const log = createLogger('main');

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const roster = BOT_ACCOUNTS.slice(0, config.botCount);
  if (roster.length === 0) {
    throw new Error('BOTS_COUNT resolved to no accounts');
  }

  const orchestrator = new Orchestrator(roster, config);
  await orchestrator.start();

  let stopping = false;
  const shutdown = (signal: string): void => {
    if (stopping) {
      log.info('second signal, exiting now');
      process.exit(1);
    }
    stopping = true;
    log.info(`${signal}: shutting down`);
    void orchestrator.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(error => {
  log.error('Runner failed to start', error);
  process.exit(1);
});
