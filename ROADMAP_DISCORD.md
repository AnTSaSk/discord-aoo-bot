# Roadmap

**Current version: 0.2.0** — everything up to it is live, the rest is planned. <!-- x-release-please-version -->

## v0.1.0

- :white_check_mark: Core slash commands (`/add`, `/list`, `/remove`)
- :white_check_mark: 270+ Albion Online maps with autocomplete
- :white_check_mark: Objective types (Nodes, Cores, Vortexes) and rarity system
- :white_check_mark: Automatic cleanup — CRON every 30 minutes
- :white_check_mark: Maintenance window detection
- :white_check_mark: Duplicate objective prevention
- :white_check_mark: Bulk delete for objectives
- :white_check_mark: Display names instead of mentions
- :white_check_mark: "No objective" message to engage users
- :white_check_mark: PostgreSQL migration
- :white_check_mark: Public bot deployment

## v0.1.1

- :white_check_mark: Command descriptions visibility
- :white_check_mark: Production observability (structured logging)
- :white_check_mark: Deployment workflow
- :white_check_mark: Documentation website with commands reference
- :white_check_mark: Discord server opened to the community

## v0.2.0

- :white_check_mark: Message pagination for large objective lists
- :white_check_mark: Consistent error messages
- :white_check_mark: Automated test suite
- :white_check_mark: Flexible time input (e.g., `1h30`, `90`, `1h`)
- :white_check_mark: Edit command (`/edit`) to modify objectives without remove/add
- :white_check_mark: More reliable objective targeting when timers expire
- :white_check_mark: Additional Discord event listeners
- :white_check_mark: Fix: show your server nickname instead of your account name

## v0.2.2

- Release announcements posted to every server on new versions

## v0.3.0

Albion Online **Dragonfire** support:

- New objective type: Ancient Lands Portal (Small / Medium / Large)
- New objective type: Dragon attacks
- Typo guard on portal timers (30 / 60 / 180 min by size)

## v1.0.0

- Internationalization (multi-language support)
- Ping reminders before objective timers expire

## v2.0.0

- Guild preferences dashboard (web-based)
- Premium subscription for advanced features
