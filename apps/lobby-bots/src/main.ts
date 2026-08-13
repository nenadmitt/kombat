import { loadConfig } from './config';
import { createLogger, setLogLevel } from './logger';
import { Orchestrator } from './orchestrator/orchestrator';
import { BotStore } from './state/bot-store';

const log = createLogger('main');

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const store = new BotStore(config.stateFile);
  const records = store.load();
  if (records.length === 0) {
    throw new Error(
      `No bots in ${config.stateFile}. Run: npm run bots:provision -- --count ${config.botCount}`,
    );
  }

  const roster = records.slice(0, config.botCount);
  const unflagged = roster.filter(record => record.markedBotAt === null);
  if (unflagged.length > 0) {
    throw new Error(
      `${unflagged.length} bot(s) are not marked is_bot and would appear in the rankings. Re-run provisioning.`,
    );
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
