import 'reflect-metadata';
import { AppDataSource } from '../src/data-source';
import { logger } from '../src/logger';
import { runMigration } from './migrations';

/**
 * Entry point for one-shot data migrations. Initializes the DataSource,
 * prompts the operator to pick a migration file from `scripts/migrations/`,
 * runs it, and cleans up. Run with: `npm run script:migrate-db`.
 *
 * Distinct from `npm run migration:run` (TypeORM schema migrations) by design:
 * schema migrations are idempotent and run on every deploy; data migrations
 * are explicit operational actions that should be reviewed and triggered
 * deliberately.
 */
async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await runMigration();
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  logger.error({ err }, 'script.migrate-db.failed');
  process.exit(1);
});
