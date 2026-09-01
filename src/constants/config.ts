// Cron schedule: every 30 minutes
export const CRON_SCHEDULE = '*/30 * * * *';

// Discord message fetch limit for bot cleanup
export const MESSAGE_FETCH_LIMIT = 50;

// Discord max top-level components per message (actual limit: 40, safety margin: 38)
export const MAX_COMPONENTS_PER_MESSAGE = 38;

// Duplicate detection time window (minutes before and after)
export const DUPLICATE_TIME_WINDOW_MINUTES = 4;

// Objective delay bounds (minutes, inclusive)
export const MIN_TOTAL_MINUTES = 1;
export const MAX_TOTAL_MINUTES = 1440;

// Minutes part of a composed form such as `1h30`
export const MAX_COMPOSED_MINUTES = 59;

// Command cooldowns (milliseconds)
export const COOLDOWN_DEFAULT = 2_000;
export const COOLDOWN_LIST = 5_000;
