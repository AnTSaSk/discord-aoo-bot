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

// Portal size time caps (Ancient Lands Portal), stricter than the default MAX_TOTAL_MINUTES
export const MAX_PORTAL_SMALL_MINUTES = 30;
export const MAX_PORTAL_MEDIUM_MINUTES = 60;
export const MAX_PORTAL_LARGE_MINUTES = 180;

// Minutes part of a composed form such as `1h30`
export const MAX_COMPOSED_MINUTES = 59;

// Command cooldowns (milliseconds)
export const COOLDOWN_DEFAULT = 2_000;
export const COOLDOWN_LIST = 5_000;

// Release announcement pacing: 5 sends/second, a tenth of the 50 req/s token-wide ceiling
// shared with the objective cron
export const ANNOUNCEMENT_BATCH_SIZE = 5;
export const ANNOUNCEMENT_BATCH_DELAY_MS = 1_000;

// Client cache sweep interval (client-runtime.md § Options client, AC-4, AC-5)
export const SWEEP_INTERVAL_SECONDS = 3600;

// Shutdown cleanup deadline (client-runtime.md § Shutdown, AC-10)
export const SHUTDOWN_TIMEOUT_MS = 8000;

// Public site and legal documents, required to be reachable from the app (Discord Developer ToS 5a)
export const WEBSITE_URL = 'https://albion-online-objectives.com';
export const TERMS_URL = `${WEBSITE_URL}/terms`;
export const PRIVACY_URL = `${WEBSITE_URL}/privacy`;
