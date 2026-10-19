import { BOT_ACCOUNTS } from '@gaming-platform/core';

import { loadConfig } from './config';
import { createLogger, setLogLevel } from './logger';
import { Orchestrator } from './orchestrator/orchestrator';

const log = createLogger('main');

async function preflight(config: ReturnType<typeof loadConfig>): Promise<void> {
  log.info(`server url: ${config.serverUrl}`);
  log.info(`bots: ${config.botCount} of ${BOT_ACCOUNTS.length} on the roster`);

  if (!config.secret) {
    throw new Error(
      'BOTS_SECRET is not set in this process environment. It must equal the server BOT_SECRET. ' +
        `Env vars visible here: ${Object.keys(process.env).filter(k => k.startsWith('BOTS_')).join(', ') || '(none starting with BOTS_)'}`,
    );
  }
  log.info(`secret: set (${config.secret.length} chars)`);

  const url = `${config.serverUrl}/status`;
  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    throw new Error(
      `Server unreachable: ${url} - ${error instanceof Error ? error.message : String(error)}. ` +
        'Check BOTS_SERVER_URL, and that the runner can reach the API on the network it is deployed to.',
    );
  }
  if (!response.ok) {
    throw new Error(`Server answered ${response.status} at ${url}; expected 200.`);
  }
  log.info(`server reachable (${Date.now() - started}ms)`);
}

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  await preflight(config);

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
