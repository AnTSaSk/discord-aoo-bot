import { type Logger, pino } from 'pino';
import { getSecret } from '../utils/secrets.js';

let logger: Logger | undefined;

export const getLogger = (): Logger => {
  if (logger === undefined) {
    const isProduction = process.env.NODE_ENV === 'production';
    const useLogtail = process.env.APP_DEV_MODE === 'false';

    // Determine log level from environment (default: info in prod, debug in dev)
    const logLevel = process.env.APP_LOG_LEVEL ?? (isProduction ? 'info' : 'debug');

    if (useLogtail) {
      // Production with Logtail: send to both Logtail AND stdout
      logger = pino({
        level: logLevel,
        transport: {
          targets: [
            {
              target: '@logtail/pino',
              options: {
                sourceToken: String(getSecret('APP_LOGTAIL_TOKEN')),
                options: {
                  endpoint: String(getSecret('APP_LOGTAIL_ENDPOINT')),
                },
              },
              level: logLevel,
            },
            {
              target: 'pino/file',
              options: { destination: 1 }, // 1 = stdout
              level: logLevel,
            },
          ],
        },
      });
    } else if (isProduction) {
      // Production without Logtail: plain JSON to stdout
      logger = pino({ level: logLevel });
    } else {
      // Development: use pino-pretty for readable logs
      logger = pino({
        level: logLevel,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'dd-mm-yyyy hh:MM:ss TT',
            levelFirst: true,
            minimumLevel: 'trace',
          },
        },
      });
    }
  }

  return logger;
};
