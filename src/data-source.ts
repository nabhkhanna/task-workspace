import { DataSource } from 'typeorm';
import { config } from './config';
import { Result, Task, Workflow } from './entities';

const DB_PING_TIMEOUT_MS = 1_000;

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: config.DB_PATH,
  dropSchema: false,
  entities: [Task, Result, Workflow],
  migrations: ['migrations/*.ts'],
  synchronize: false,
  logging: false,
});

export async function pingDatabase(dataSource: DataSource = AppDataSource): Promise<void> {
  await Promise.race([
    dataSource.query('SELECT 1'),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Database ping timed out')), DB_PING_TIMEOUT_MS),
    ),
  ]);
}
