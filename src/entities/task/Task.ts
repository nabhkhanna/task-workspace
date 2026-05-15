import { Column, Entity, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '../AbstractBaseEntity';
import { Workflow } from '../workflow';
import type { ErrorHistoryEntry } from './ErrorHistoryEntry';
import type { TaskOutput } from './TaskOutput';
import type { TaskStatus } from './TaskStatus';
import type { TaskType } from './TaskType';

interface TaskInit {
  type: TaskType;
  stepNumber: number;
  workflow: Workflow;
}

@Entity({ name: 'tasks' })
export class Task extends AbstractBaseEntity {
  @Column({ type: 'varchar' })
  readonly type!: TaskType;

  @Column({ type: 'varchar' })
  status!: TaskStatus;

  @Column({ type: 'integer', default: 1 })
  readonly stepNumber!: number;

  @Column({ type: 'simple-json', nullable: true })
  output!: TaskOutput | null;

  @Column({ type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ type: 'datetime', nullable: true })
  nextAttemptAt!: Date | null;

  @Column({ type: 'simple-json', default: '[]' })
  errorHistory!: ErrorHistoryEntry[];

  @ManyToOne(
    () => Workflow,
    (workflow) => workflow.tasks,
  )
  readonly workflow!: Workflow;

  constructor(init?: TaskInit) {
    super();
    if (!init) {
      return;
    }
    this.type = init.type;
    this.stepNumber = init.stepNumber;
    this.workflow = init.workflow;
    this.status = 'queued';
    this.output = null;
    this.attemptCount = 0;
    this.nextAttemptAt = null;
    this.errorHistory = [];
  }
}
