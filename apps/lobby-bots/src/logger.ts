type Level = 'debug' | 'info';

let threshold: Level = 'info';

export function setLogLevel(level: Level): void {
  threshold = level;
}

function stamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export type Logger = {
  info(message: string): void;
  debug(message: string): void;
  error(message: string, error?: unknown): void;
  child(scope: string): Logger;
};

export function createLogger(scope = ''): Logger {
  const prefix = scope ? `[${scope}] ` : '';
  return {
    info: message => console.log(`${stamp()} ${prefix}${message}`),
    debug: message => {
      if (threshold === 'debug') console.log(`${stamp()} ${prefix}${message}`);
    },
    error: (message, error) => {
      const detail =
        error instanceof Error
          ? `: ${error.message}`
          : error
            ? `: ${String(error)}`
            : '';
      console.error(`${stamp()} ${prefix}${message}${detail}`);
    },
    child: child => createLogger(scope ? `${scope}/${child}` : child),
  };
}
