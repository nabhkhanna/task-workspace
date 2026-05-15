import type { Feature, Polygon } from 'geojson';
import { Column, Entity, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '../AbstractBaseEntity';
import { Task } from '../task';

@Entity({ name: 'workflows' })
export class Workflow extends AbstractBaseEntity {
  @Column()
  clientId!: string;

  @Column({ type: 'simple-json' })
  geoJson!: Feature<Polygon>;

  @OneToMany(
    () => Task,
    (task) => task.workflow,
  )
  tasks!: Task[];
}
