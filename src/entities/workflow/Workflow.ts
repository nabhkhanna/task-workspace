import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Task } from '../task';
import type { WorkflowStatus } from './WorkflowStatus';

@Entity({ name: 'workflows' })
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  workflowId!: string;

  @Column()
  clientId!: string;

  @Column({ default: 'initial' })
  status!: WorkflowStatus;

  @OneToMany(
    () => Task,
    (task) => task.workflow,
  )
  tasks!: Task[];
}
