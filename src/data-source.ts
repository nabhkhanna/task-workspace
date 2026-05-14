import { DataSource } from 'typeorm';
import { config } from './config';
import { Result } from './models/Result';
import { Task } from './models/Task';
import { Workflow } from './models/Workflow';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: config.DB_PATH,
  dropSchema: true,
  entities: [Task, Result, Workflow],
  synchronize: true,
  logging: false,
});
