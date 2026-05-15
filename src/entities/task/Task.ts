import { Column, Entity, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '../AbstractBaseEntity';
import { Workflow } from '../workflow';
import type { TaskOutput } from './TaskOutput';
import type { TaskStatus } from './TaskStatus';
import type { TaskType } from './TaskType';

@Entity({ name: 'tasks' })
export class Task extends AbstractBaseEntity {
  @Column()
  type!: TaskType;

  @Column()
  status!: TaskStatus;

  @Column({ default: 1 })
  stepNumber!: number;

  @Column({ type: 'simple-json', nullable: true })
  output!: TaskOutput | null;

  @ManyToOne(
    () => Workflow,
    (workflow) => workflow.tasks,
  )
  workflow!: Workflow;
}
