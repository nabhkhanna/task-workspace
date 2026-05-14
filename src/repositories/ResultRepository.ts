import type { DataSource, Repository } from 'typeorm';
import { Result } from '../entities';

export class ResultRepository {
  private readonly repo: Repository<Result>;

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Result);
  }

  save(result: Result): Promise<Result> {
    return this.repo.save(result);
  }
}
