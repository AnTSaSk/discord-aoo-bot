import type { Logger } from 'pino';

import { SHUTDOWN_TIMEOUT_MS } from '@/constants/config.js';

export interface ShutdownDeps {
  logger: Logger;
  stopHeartbeat?: () => void;
  stopCron: () => Promise<void>;
  destroyClient: () => Promise<void>;
  closeDb: () => Promise<void>;
  exit: (code: number) => void;
}

export const performShutdown = async (deps: ShutdownDeps, signal: string): Promise<void> => {
  const timer = setTimeout(() => {
    deps.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  timer.unref();

  try {
    (deps.stopHeartbeat ?? ((): void => undefined))();
    await deps.stopCron();
    await deps.destroyClient();
    await deps.closeDb();
    deps.exit(0);
  } catch (error) {
    deps.logger.error({ error }, `Error during shutdown (${signal})`);
    deps.exit(1);
  }
};
