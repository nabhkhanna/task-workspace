import type { Feature, Polygon } from 'geojson';
import { Column, Entity, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '../AbstractBaseEntity';
import { Task } from '../task';

interface WorkflowInit {
  clientId: string;
  geoJson: Feature<Polygon>;
}

@Entity({ name: 'workflows' })
export class Workflow extends AbstractBaseEntity {
  @Column()
  readonly clientId!: string;

  @Column({ type: 'simple-json' })
  readonly geoJson!: Feature<Polygon>;

  @OneToMany(
    () => Task,
    (task) => task.workflow,
  )
  tasks!: Task[];

  constructor(init?: WorkflowInit) {
    super();
    if (!init) {
      return;
    }
    this.clientId = init.clientId;
    this.geoJson = init.geoJson;
  }
}
