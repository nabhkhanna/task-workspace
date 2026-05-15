import type { Task, TaskOutput } from '../../entities';

export interface Job {
  run(task: Task): Promise<TaskOutput>;
}
