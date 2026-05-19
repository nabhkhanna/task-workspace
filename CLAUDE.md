# CLAUDE.md

Context for AI assistants working on this repo.

## Project

osapiens backend take-home challenge. TypeScript backend service that runs YAML-defined workflows of tasks (data analysis, polygon area calculation, report generation) against GeoJSON inputs. The 6 challenge tasks are listed in `README.md`; submission deadline 2026-05-19.

**Stack:** Node + Express 4 + TypeORM 0.3 + SQLite + `@turf/turf` + `js-yaml`. Strict TypeScript. Vitest for tests.

## Engineering standards

Read `.claude/skills/principal-developer/SKILL.md` and the topic-specific files in that folder. The non-negotiables apply to every change:

- No `any` in TypeScript — use `unknown` + narrowing, generics, or discriminated unions
- Errors as data (`Result<T, E>`), no throwing for expected failures
- Immutability by default (`const`, `readonly`)
- Named constants — no magic numbers/strings
- Explicit over implicit
- YAGNI — no speculative features

For non-trivial cross-cutting decisions, apply the devil's-advocate analysis from `.claude/skills/principal-developer/devils-advocate-analysis.md` before proposing.

## Repo conventions

- **Commits:** Conventional Commits (`feat:`, `chore:`, `fix:`, etc.). User authors all commits — never run `git commit`. Stage changes and tell the user the command.
- **Branches:** one branch per logical change, opened as a PR against `main`. CI must pass before merge.
- **Lint/format:** Biome (`npm run lint`, `npm run format:fix`). Pre-commit hook runs `lint-staged` automatically.
- **DB schema:** TypeORM migrations only. Never set `synchronize: true` or `dropSchema: true`. Migration files live at `migrations/Migration{timestamp}.ts`. Generate with `npm run migration:generate`.
- **Env:** parsed once in `src/config/index.ts` via zod. `process.env` is forbidden elsewhere (enforced by Biome).
- **Tests:** Vitest. `tests/unit/`, `tests/integration/`. Run with `npm test`.

## CI

`.github/workflows/ci.yml` runs lint, typecheck, migration drift check, and tests on every PR. The migration drift check fails if entity changes lack a corresponding migration.

## Out of scope (deliberately not done)

- Postgres / multi-driver DB — SQLite only
- Auth — `bcrypt` and `jsonwebtoken` are in deps but unused
- Outbox pattern / multi-worker leases — proposed in `ARCHITECTURE_v2.md` as written architecture only, not implemented

## Working agreements with the user

- The user reviews work incrementally — don't batch large changes. Each meaningful step is its own commit.
- When proposing implementation paths, surface the tradeoff in 2–3 sentences before writing code; don't just implement.
- Prioritize judgment and clarity over feature volume.
