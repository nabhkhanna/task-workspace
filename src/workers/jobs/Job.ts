import { Task } from '../../entities';

export interface Job {
  run(task: Task): Promise<unknown>;
}
