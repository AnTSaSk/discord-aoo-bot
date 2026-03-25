// Cron schedule: every 30 minutes
export const CRON_SCHEDULE = '*/30 * * * *';

// Discord message fetch limit for bot cleanup
export const MESSAGE_FETCH_LIMIT = 50;

// Discord max top-level components per message (actual limit: 40, safety margin: 38)
export const MAX_COMPONENTS_PER_MESSAGE = 38;

// Duplicate detection time window (minutes before and after)
export const DUPLICATE_TIME_WINDOW_MINUTES = 4;

// Command cooldowns (milliseconds)
export const COOLDOWN_DEFAULT = 2_000;
export const COOLDOWN_LIST = 5_000;
