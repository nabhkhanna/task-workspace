import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Workflow } from '../workflow';
import type { TaskStatus } from './TaskStatus';

@Entity({ name: 'tasks' })
export class Task {
  @PrimaryGeneratedColumn('uuid')
  taskId!: string;

  @Column()
  clientId!: string;

  @Column('text')
  geoJson!: string;

  @Column()
  status!: TaskStatus;

  @Column({ nullable: true, type: 'text' })
  progress?: string | null;

  @Column({ nullable: true })
  resultId?: string;

  @Column()
  taskType!: string;

  @Column({ default: 1 })
  stepNumber!: number;

  @ManyToOne(
    () => Workflow,
    (workflow) => workflow.tasks,
  )
  workflow!: Workflow;
}
