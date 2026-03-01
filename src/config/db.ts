import { Sequelize } from '@sequelize/core';
import { PostgresDialect } from '@sequelize/postgres';
import { getRequiredSecret } from '@/utils/secrets.js';
import { getLogger } from '@/config/logger.js';

// Load dotenv only in development
if (process.env.NODE_ENV !== 'production') {
  await import('dotenv/config');
}

const logger = getLogger();

const dbName = getRequiredSecret('APP_DB_NAME', 'Database name');
const dbUser = getRequiredSecret('APP_DB_USER', 'Database user');
const dbPassword = getRequiredSecret('APP_DB_PASSWORD', 'Database password');
const dbHost = process.env.APP_DB_HOST ?? 'localhost';
const dbPort = parseInt(process.env.APP_DB_PORT ?? '5432', 10);

const db = new Sequelize({
  dialect: PostgresDialect,
  database: dbName,
  user: dbUser,
  password: dbPassword,
  host: dbHost,
  port: dbPort,
  // SEC-004: SSL enabled in production (self-signed cert on internal Docker network)
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  clientMinMessages: 'notice',
  keepAlive: true,
  keepAliveInitialDelayMillis: 20000,
  connectionTimeoutMillis: 5000,
  pool: {
    max: 3,
    min: 1,
    acquire: 30000,
    idle: 10000,
    evict: 1000,
  },
  logging: (sql: string, timing?: number) => {
    // Log slow queries only (>1000ms)
    if (timing !== undefined && timing > 1000) {
      logger.warn({ sql, timing }, 'Slow database query detected');
    } else {
      logger.debug({ sql, timing }, 'Query executed');
    }
  },
  benchmark: true, // Enables timing parameter
});

logger.info({
  host: dbHost,
  port: dbPort,
  database: dbName,
  poolMax: 3,
  poolMin: 1,
  poolEvict: 1000,
  keepAlive: true,
  connectionTimeoutMillis: 5000,
}, 'Database configuration initialized');

export default db;
