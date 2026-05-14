import { DataSource } from 'typeorm';
import { config } from './config';
import { Result, Task, Workflow } from './entities';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: config.DB_PATH,
  dropSchema: false,
  entities: [Task, Result, Workflow],
  migrations: ['migrations/*.ts'],
  synchronize: false,
  logging: false,
});
