# Roadmap

**Current version: 0.3.7** — everything up to it is live, the rest is planned. <!-- x-release-please-version -->

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

## v0.2.1

- :white_check_mark: Release announcements posted to every server on new versions
- :white_check_mark: `/settings` to pick the announcement channel and opt in to `@everyone`
- :white_check_mark: `/about` with the bot version and the legal links

## v0.3.0

Albion Online **Dragonfire** support:

- :white_check_mark: New objective type: Ancient Lands Portal (Small / Medium / Large)
- :white_check_mark: New objective type: Dragon attacks
- :white_check_mark: Typo guard on portal timers (30 / 60 / 180 min by size)

## v0.3.1

- :white_check_mark: Rarity is required again and back in second position — the `type → rarity → map → time` order is restored
- :white_check_mark: Dragon attacks: pick `n/a` for the rarity, now offered in one click
- :white_check_mark: Royal Continent maps added for Dragon attacks (103 new maps); other objectives keep the Black Zone list
- :white_check_mark: A Royal map on a non-Dragon objective is now refused
- :white_check_mark: Portal sizes displayed as colour codes: :green_circle: Small, :blue_circle: Medium, :orange_circle: Large

## v1.0.0

- Internationalization (multi-language support)
- Ping reminders before objective timers expire

## v2.0.0

- Guild preferences dashboard (web-based)
- Premium subscription for advanced features
