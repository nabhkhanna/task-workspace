import { CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export abstract class AbstractBaseEntity {
  @PrimaryGeneratedColumn('uuid')
  readonly id!: string;

  @CreateDateColumn()
  readonly createdAt!: Date;

  @UpdateDateColumn()
  readonly updatedAt!: Date;
}
