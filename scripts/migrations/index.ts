import * as fs from 'node:fs';
import prompts from 'prompts';

const NON_MIGRATION_FILES = ['index.ts', 'helpers.ts', 'types.ts'];

async function getMigrationFileNames(): Promise<string[]> {
  return (await fs.promises.readdir('./scripts/migrations')).filter(
    (fileName) => !NON_MIGRATION_FILES.includes(fileName),
  );
}

/**
 * Interactive: prompts the operator to select one migration file and runs it.
 * Each migration file must export a default async function with no arguments
 * that does its work against the already-initialised AppDataSource.
 */
export async function runMigration(): Promise<void> {
  const migrationFileNames = await getMigrationFileNames();

  const result = await prompts({
    type: 'select',
    name: 'fileName',
    choices: migrationFileNames.map((name) => ({ title: name, value: name })),
    message: 'Select migration file to run:',
  });
  const selectedFileName: string | undefined = result.fileName;
  if (!selectedFileName) {
    return;
  }

  await (await import(`./${selectedFileName}`)).default();
}

/**
 * Non-interactive: runs every migration file in directory order.
 * Use only for automated environments where prompting is impractical.
 */
export async function runAllMigrations(): Promise<void> {
  const migrationFileNames = await getMigrationFileNames();
  for (const fileName of migrationFileNames) {
    await (await import(`./${fileName}`)).default();
  }
}
