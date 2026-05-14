import { DataSource } from 'typeorm';
import { config } from './config';
import { Result } from './models/Result';
import { Task } from './models/Task';
import { Workflow } from './models/Workflow';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: config.DB_PATH,
  dropSchema: false,
  entities: [Task, Result, Workflow],
  migrations: ['migrations/*.ts'],
  synchronize: false,
  logging: false,
});
