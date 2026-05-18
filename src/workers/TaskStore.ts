import type { Task } from '../entities';

/**
 * The persistence surface the worker actually needs. Lives next to the
 * consumer so the worker stays decoupled from the concrete TypeORM
 * repository — any object satisfying this shape can drive it (structural
 * typing), which keeps the worker independently testable and easy to
 * extract later.
 */
export interface TaskStore {
  findNextRunnable(): Promise<Task | null>;
  save(task: Task): Promise<Task>;
  requeueInterrupted(): Promise<number>;
}
