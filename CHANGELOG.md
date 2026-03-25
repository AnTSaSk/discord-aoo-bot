# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1](https://github.com/AnTSaSk/discord-aoo/compare/discord-bot-aoo-v0.1.0...discord-bot-aoo-v0.1.1) (2026-03-25)


### Features

* Correctly implement Logtail and extract Logtail endpoint to env file ([b6416c0](https://github.com/AnTSaSk/discord-aoo/commit/b6416c0b11fd7879bf5c76e5ced2a90677a89b0c))
* Create "Ready" listener to synchronize DB and register cron ([47876eb](https://github.com/AnTSaSk/discord-aoo/commit/47876eb9944951aff56df9a2c839769dd092e139))
* Create all necessaries constants ([959ee64](https://github.com/AnTSaSk/discord-aoo/commit/959ee64934554011b4ba793ea1ec93bd23d1d1b8))
* Get user information and display his "displayName" instead of using Mention ([2f8bf2a](https://github.com/AnTSaSk/discord-aoo/commit/2f8bf2a5a98772bece285d8b1b203d58f1ae1510))
* Implement Bot commands ([00a6e2d](https://github.com/AnTSaSk/discord-aoo/commit/00a6e2da93470f5864f3cdf1626c1f2183f65c55))
* Implement Bulk delete for objective ([976346d](https://github.com/AnTSaSk/discord-aoo/commit/976346dbf0f3af0426d89cb94cde7d1f31d8ed57))
* Implement config for Database and Logger ([990ce85](https://github.com/AnTSaSk/discord-aoo/commit/990ce85a876f2a81d6c222dae3575d1169bd3aa3))
* Implement CRON Task ([3cf7ad8](https://github.com/AnTSaSk/discord-aoo/commit/3cf7ad8acd44b17e8d4aa8138730fbe74bb98fb3))
* Implement global tasks ([3a70923](https://github.com/AnTSaSk/discord-aoo/commit/3a70923439e2b3155b199dde3eac46a29309975a))
* Implement main file to initialize and start Bot ([611aa9b](https://github.com/AnTSaSk/discord-aoo/commit/611aa9bc5106e4f604eb55951d0fbe9305c28d23))
* Implement Models and Services ([9adb404](https://github.com/AnTSaSk/discord-aoo/commit/9adb4047dfb9db0aa8fb39a6ecd162c541b68837))
* Implement new Health check + DB now use SSL ([bafdbd3](https://github.com/AnTSaSk/discord-aoo/commit/bafdbd334fb10d5ad38452309915fd7f67ef60cd))
* Implement script to synchronize Databases models ([67ae470](https://github.com/AnTSaSk/discord-aoo/commit/67ae4706955dc54017798fab206f67defe47c27c))
* **models:** add unique constraint for objective deduplication ([e81f5b6](https://github.com/AnTSaSk/discord-aoo/commit/e81f5b6c42e9aa6f7ddd1a881418813b37314849))
* Modify cron schedule to every 30min and implement a "No objective" message ([25af727](https://github.com/AnTSaSk/discord-aoo/commit/25af727f2a190970b7e99ad0096daa1cb7c74f9c))
* Update dependencies and switch to PostgreSQL ([120e636](https://github.com/AnTSaSk/discord-aoo/commit/120e6361fff7f22eb4d9a5bee5fbc983a0595671))


### Bug Fixes

* Add "egress" network for request to Discord ([06f9b74](https://github.com/AnTSaSk/discord-aoo/commit/06f9b74c995fb4694e7cd090b89824d9b1d8b803))
* Add await on "for" loop to avoid weird side-effect during CRON tasks ([ba5382c](https://github.com/AnTSaSk/discord-aoo/commit/ba5382cdd80838bb31350c48ded7d99bb8e6b404))
* Add filename to pm2 command ([f30e880](https://github.com/AnTSaSk/discord-aoo/commit/f30e88080091b12490d2931858cb52ed9806d192))
* Add missing "Map" ([e3a3709](https://github.com/AnTSaSk/discord-aoo/commit/e3a3709f474fb65be2fbca25d11d312e50ffb997))
* Add Premium comment to strip this part ([51129a0](https://github.com/AnTSaSk/discord-aoo/commit/51129a001f7ddae4a91132a7682bb2201bd6c0f2))
* Add scripts folder and package.json to the artifacts ([627afdd](https://github.com/AnTSaSk/discord-aoo/commit/627afdd810cae94307c9e31a376e9844a06bff9b))
* Add verification to avoid objective duplication ([e5f732f](https://github.com/AnTSaSk/discord-aoo/commit/e5f732f1db8bf8d887ed8b6dcaf0b2a9762a5d82))
* Bump dependencies and forget to commit lockfile ([637e15f](https://github.com/AnTSaSk/discord-aoo/commit/637e15f0771a64024808bd5c41281d7220bb9925))
* Change DB Host name ([167719f](https://github.com/AnTSaSk/discord-aoo/commit/167719f0612defbc3c0af47994b4dd4f5d13808f))
* Check if NVM is loaded, then install/use version 24.6.0 then execute project scripts ([0a30f5b](https://github.com/AnTSaSk/discord-aoo/commit/0a30f5b2a5430b8596c10c271038f8765c55fc2a))
* Create Bash scripts to install PNPM and PM2 and execute them in Github Action ([23805ba](https://github.com/AnTSaSk/discord-aoo/commit/23805bad6a4efede687c7fe58d89eaeb2e315bff))
* Create script to install node if not exist and execute this script on every others scripts ([b124ed0](https://github.com/AnTSaSk/discord-aoo/commit/b124ed0eb4c4e8e9d1773a8236ac0048421c4316))
* **deps:** add pnpm overrides for known vulnerabilities ([4fe10d8](https://github.com/AnTSaSk/discord-aoo/commit/4fe10d8890f5d5fd69152808bda51b5298951175))
* **deps:** remove ajv override breaking ESLint ([b7c7628](https://github.com/AnTSaSk/discord-aoo/commit/b7c7628e626e5afc71469f7e7cd7caedc38736c7))
* Display correct text as command description ([af492ff](https://github.com/AnTSaSk/discord-aoo/commit/af492ff7f7a0d193f28ece0f1a447ae21caedc66))
* Display logs in stdout too ([850590b](https://github.com/AnTSaSk/discord-aoo/commit/850590b32f93408fa2b94d4a6d5e4b8ac349f2a3))
* Do not clean database on each release ([318385a](https://github.com/AnTSaSk/discord-aoo/commit/318385aa62420a0f07e758c294dfbaed1b9ec7de))
* Docker Swarm compatible ([81ee74b](https://github.com/AnTSaSk/discord-aoo/commit/81ee74be45223fe0e3e824fae0cfd316aa13ea2c))
* Eslint ([ad8c4db](https://github.com/AnTSaSk/discord-aoo/commit/ad8c4db51f626f02c0dff42001677e8dc6dbc47c))
* Eslint ([6f9e50a](https://github.com/AnTSaSk/discord-aoo/commit/6f9e50abb56ae30ebd98d5953cf2c39157cf5918))
* Get ClientID from correct secret based on current Env (prod/dev) + Add more logs for potential warning/errors from Discord ([d9ad255](https://github.com/AnTSaSk/discord-aoo/commit/d9ad255950d73bce97b7e88e22b64686244740af))
* Hadolint errors fixed ([6d93c1c](https://github.com/AnTSaSk/discord-aoo/commit/6d93c1c36917f0b0f223bf6321b0170a84b95c26))
* IaS modification ([e98cbaa](https://github.com/AnTSaSk/discord-aoo/commit/e98cbaadae72d0bd77b00797c6cbec96e4496e23))
* Load Node for the whole ssh-action ([f84a526](https://github.com/AnTSaSk/discord-aoo/commit/f84a526de85b98a78dfaf0d231ab89b5172f781a))
* Lowercase the image name to avoid Trivy error and match Docker conventions ([7bc55b7](https://github.com/AnTSaSk/discord-aoo/commit/7bc55b7e81586054d819affd68fec2cd873774cb))
* Make bin file executable ([4b0e581](https://github.com/AnTSaSk/discord-aoo/commit/4b0e581af83d97b8001a0067242055d4be49cbf2))
* Missing "await" during Discord message deletion ([7de5a5f](https://github.com/AnTSaSk/discord-aoo/commit/7de5a5f664babb9d2bcdcec4982af27689b37bd4))
* Missing 3 maps + Typos on 7 maps ([61b7b47](https://github.com/AnTSaSk/discord-aoo/commit/61b7b475561ac667e3133f9a68452f833e2164dd))
* Modify CRON interval to be execute only once a day ([02cc7ba](https://github.com/AnTSaSk/discord-aoo/commit/02cc7ba1d257b8058b8a9621d95b393821788e2c))
* Modify DB configuration to avoid error due to terminated connexion ([32f95c6](https://github.com/AnTSaSk/discord-aoo/commit/32f95c628761ad7957a474479ba81d67b53f86db))
* Move return after sending message to user ([d1f53ac](https://github.com/AnTSaSk/discord-aoo/commit/d1f53aca5114f421f5aec2c89dae8328d6175ace))
* Never execute "prepare" on Github Actions ([ef1b64c](https://github.com/AnTSaSk/discord-aoo/commit/ef1b64ce5ec89e1c753a510451dbb036dbda0274))
* Remove "dotenv" ([2c680ba](https://github.com/AnTSaSk/discord-aoo/commit/2c680bad3faeb7015813fb54ac12c2b0cbd2a3ee))
* Remove PNPM cache for Github workflow ([7e81244](https://github.com/AnTSaSk/discord-aoo/commit/7e81244b403cdbd034f8507c62e14f4aadd3d16c))
* Remove script from the list ([4c3326e](https://github.com/AnTSaSk/discord-aoo/commit/4c3326e4481083956052a9074895c62e4126669f))
* Rename ecosystem config file extension from .js to .cjs, adapt everywhere to correct extension and update Github Action to install/enable pmpm and pm2 ([084f82b](https://github.com/AnTSaSk/discord-aoo/commit/084f82be430caacf53ae13f45fcefe3fd070a84a))
* Rename third step of Github Actions ([05ef4aa](https://github.com/AnTSaSk/discord-aoo/commit/05ef4aa3cf8b94e380d7fc26ebef5fa1527a18cd))
* Source NVM to load correctly node ([ef9aa28](https://github.com/AnTSaSk/discord-aoo/commit/ef9aa2812974dcda78d3e0b5181a02e76c2c2465))
* Sync workflow + use initial commit message ([5b566b8](https://github.com/AnTSaSk/discord-aoo/commit/5b566b889b3ee93ea2eccbb58e89d18081e33fd0))
* **tasks:** use batch delete and transaction in cron task ([dd88cb3](https://github.com/AnTSaSk/discord-aoo/commit/dd88cb3aef374157ff5ac4ffdc5330b29b1519e2))
* **tasks:** validate message component count and split if needed ([c8afb3f](https://github.com/AnTSaSk/discord-aoo/commit/c8afb3f824f58484ff8040d91aa15c0818d64109))
* Update condition due to ecosystem file ([e5c46f4](https://github.com/AnTSaSk/discord-aoo/commit/e5c46f43c4c558587bec8060d316ce33997a4f60))
* Update dependencies and clean pnpm-lock to fix security issues ([fd4c00a](https://github.com/AnTSaSk/discord-aoo/commit/fd4c00aa16ac3cff3ea179b769f61ad393d527da))
* Use "clientReady" instead of "ready" + clean old build to avoid errors during development ([fa3f0a8](https://github.com/AnTSaSk/discord-aoo/commit/fa3f0a8d0e5993f8099d0ddea16d1f37378e8906))
* Use full SHA instead of a truncated SHA ([318143f](https://github.com/AnTSaSk/discord-aoo/commit/318143fb1762d7d3018858bed31da51c16223638))
* Wrong operator was used to check permissions ([a2b581e](https://github.com/AnTSaSk/discord-aoo/commit/a2b581eda83f4b54a93e5727551abc4493d18430))

## [Unreleased]

### Added

- Vitest test framework with unit tests for date utilities and secrets management
- Test step in CI pipeline (runs before build)
- Unique database constraint on objectives (`guildId`, `type`, `rarity`, `map`, `time`)
- Transaction wrapping for `/remove` command DB operations
- Message component batching to respect Discord's 40-component limit
- Centralized error reply utility (`replyError`) for consistent user-facing messages

### Changed

- Extracted magic numbers to named constants in `src/constants/config.ts`

### Fixed

- Cron task now uses atomic batch delete with transaction to prevent race conditions
- Expired objective cleanup centralized in cron task (removed from `/add` and `/list` commands)
- Increased bot message fetch limit from 10 to 50 for cleanup reliability
- Added pnpm overrides for transitive dependency vulnerabilities (lodash, undici, minimatch, dottie)

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
- PostgreSQL database with Sequelize 7 and SSL
- Structured logging with Pino and Logtail integration
- Docker Swarm deployment with health checks and liveness probe
- CI/CD pipeline: lint, build, Docker build, deploy, verify, rollback
- Public repository sync workflow with premium code stripping
- Dependabot for GitHub Actions dependencies
- Pre-commit hook to block `.env` files

### Fixed

- Database SSL connectivity and terminated connection handling
- Discord message deletion with proper `await`
- Objective duplication prevention
- Map data corrections (3 missing maps, 7 typo fixes)
- Permission checking operator for `/remove` command
- Command description text accuracy
- `clientReady` event instead of deprecated `ready`
- ESLint compliance across all files

### Changed

- Migrated from SQLite to PostgreSQL
- Switched from PM2/SSH deployment to Docker Swarm
- Moved Logtail secrets from env files to Docker secrets
- Full logging rework for production observability
- Cron schedule changed from daily to every 30 minutes
- Strict ESLint + stylistic rules enforced

[unreleased]: https://github.com/AnTSaSk/discord-aoo-bot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AnTSaSk/discord-aoo-bot/releases/tag/v0.1.0
