import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { WorkflowStatus } from '../workflows/WorkflowFactory';
import { Task } from './Task';

@Entity({ name: 'workflows' })
export class Workflow {
  @PrimaryGeneratedColumn('uuid')
  workflowId!: string;

  @Column()
  clientId!: string;

  @Column({ default: WorkflowStatus.Initial })
  status!: WorkflowStatus;

  @OneToMany(
    () => Task,
    (task) => task.workflow,
  )
  tasks!: Task[];
}
