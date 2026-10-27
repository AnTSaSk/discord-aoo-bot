import { LogLevel, type ILogger } from '@sapphire/framework';
import type { Logger } from 'pino';

type PinoMethod = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const PINO_METHOD_BY_LEVEL: Record<LogLevel, PinoMethod> = {
  [LogLevel.Trace]: 'trace',
  [LogLevel.Debug]: 'debug',
  [LogLevel.Info]: 'info',
  [LogLevel.Warn]: 'warn',
  [LogLevel.Error]: 'error',
  [LogLevel.Fatal]: 'fatal',
  [LogLevel.None]: 'info',
};

export class FrameworkLogger implements ILogger {
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  public has(level: LogLevel): boolean {
    return this.logger.isLevelEnabled(PINO_METHOD_BY_LEVEL[level]);
  }

  public trace(...values: readonly unknown[]): void {
    this.write(LogLevel.Trace, ...values);
  }

  public debug(...values: readonly unknown[]): void {
    this.write(LogLevel.Debug, ...values);
  }

  public info(...values: readonly unknown[]): void {
    this.write(LogLevel.Info, ...values);
  }

  public warn(...values: readonly unknown[]): void {
    this.write(LogLevel.Warn, ...values);
  }

  public error(...values: readonly unknown[]): void {
    this.write(LogLevel.Error, ...values);
  }

  public fatal(...values: readonly unknown[]): void {
    this.write(LogLevel.Fatal, ...values);
  }

  public write(level: LogLevel, ...values: readonly unknown[]): void {
    const method = PINO_METHOD_BY_LEVEL[level];
    const text = values.filter((value) => typeof value === 'string').join(' ');
    const errorIndex = values.findIndex((value) => typeof value !== 'string');

    if (errorIndex === -1) {
      this.logger[method](text);

      return;
    }

    this.logger[method]({ error: values[errorIndex] }, text);
  }
}
