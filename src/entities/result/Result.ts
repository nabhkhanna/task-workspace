import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'results' })
export class Result {
  @PrimaryGeneratedColumn('uuid')
  resultId!: string;

  @Column()
  taskId!: string;

  @Column('text')
  data!: string | null;
}
