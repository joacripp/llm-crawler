type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  service: string;
  [key: string]: unknown;
}

function log(level: LogLevel, service: string, message: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    service,
    timestamp: new Date().toISOString(),
    ...data,
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export function createLogger(service: string) {
  return {
    info: (message: string, data?: Record<string, unknown>) => log('info', service, message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', service, message, data),
    error: (message: string, data?: Record<string, unknown>) => log('error', service, message, data),
  };
}
