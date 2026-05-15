import { Column, Entity, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '../AbstractBaseEntity';
import { Workflow } from '../workflow';
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
  @Column()
  readonly type!: TaskType;

  @Column()
  status!: TaskStatus;

  @Column({ default: 1 })
  readonly stepNumber!: number;

  @Column({ type: 'simple-json', nullable: true })
  output!: TaskOutput | null;

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
  }
}
