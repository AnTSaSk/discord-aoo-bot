# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-09-01

### Added

- `/edit` command to modify an objective without removing and re-adding it
- Flexible time input — `1h30`, `90` and `1h` are all accepted
- Message pagination for large objective lists
- Automated test suite
- Additional Discord event listeners
- Unique database constraint on objectives (`guildId`, `type`, `rarity`, `map`, `time`)

### Changed

- Objective indexes now resolve against active objectives only
- Centralized error messages for consistent user-facing replies
- Extracted magic numbers to named constants

### Fixed

- Your server nickname is shown instead of your account name
- Cron task uses atomic batch delete to prevent race conditions
- Expired objective cleanup centralized in cron task

## [0.1.1] - 2026-03-25

### Added

- Bot commands (`/add`, `/list`, `/remove`)
- All game constants (maps, types, rarities)
- Display user's `displayName` instead of mention
- Bulk delete for objectives
- Cron task for automatic cleanup
- "No objective" message to engage users
- Unique constraint for objective deduplication
- PostgreSQL migration

### Fixed

- Async issues in CRON tasks and Discord message deletion
- Missing maps and map typos
- Objective duplication prevention
- Permission checking for `/remove` command
- Command description text
- Message component count validation and splitting

## [0.1.0] - 2025-10-10

### Added

- Slash commands: `/add`, `/list`, `/remove` for managing Albion Online objectives
- Support for 270+ Albion Online maps with autocomplete
- Objective types: Fiber, Hide, Ore, Wood nodes, Cores, Vortexes
- Rarity system: 4.4–8.4 (nodes), Green/Blue/Purple/Gold (cores/vortexes)
- Automatic objective cleanup via cron job (every 30 minutes)
- Multi-server data isolation (per-guild queries)
- Duplicate objective prevention
- Maintenance window detection (daily 10:00 UTC reset)
- Bulk delete for objectives
- Display user's `displayName` instead of mention
- "No objective" message when list is empty
- PostgreSQL database with Sequelize 7

### Fixed

- Discord message deletion with proper `await`
- Objective duplication prevention
- Map data corrections (3 missing maps, 7 typo fixes)
- Permission checking operator for `/remove` command
- Command description text accuracy

### Changed

- Migrated from SQLite to PostgreSQL
- Cron schedule changed from daily to every 30 minutes

[0.2.0]: https://github.com/AnTSaSk/discord-aoo-bot/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/AnTSaSk/discord-aoo-bot/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/AnTSaSk/discord-aoo-bot/releases/tag/v0.1.0
