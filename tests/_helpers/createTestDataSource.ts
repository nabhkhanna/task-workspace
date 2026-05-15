import { DataSource } from 'typeorm';
import { Task, Workflow } from '../../src/entities';

// synchronize is on here only because vitest cannot load the .ts migration
// files through swc at runtime. Production schema is still validated by the
// CI migration drift check (npm run migration:generate).
export async function createTestDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    entities: [Task, Workflow],
    synchronize: true,
    logging: false,
  });
  await dataSource.initialize();
  return dataSource;
}
