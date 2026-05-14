import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migration1778766739472 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "workflows" (
        "workflowId" varchar PRIMARY KEY NOT NULL,
        "clientId" varchar NOT NULL,
        "status" varchar NOT NULL DEFAULT 'initial'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "tasks" (
        "taskId" varchar PRIMARY KEY NOT NULL,
        "clientId" varchar NOT NULL,
        "geoJson" text NOT NULL,
        "status" varchar NOT NULL,
        "progress" text,
        "resultId" varchar,
        "taskType" varchar NOT NULL,
        "stepNumber" integer NOT NULL DEFAULT 1,
        "workflowWorkflowId" varchar,
        CONSTRAINT "FK_tasks_workflow" FOREIGN KEY ("workflowWorkflowId") REFERENCES "workflows" ("workflowId") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "results" (
        "resultId" varchar PRIMARY KEY NOT NULL,
        "taskId" varchar NOT NULL,
        "data" text
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "results"`);
    await queryRunner.query(`DROP TABLE "tasks"`);
    await queryRunner.query(`DROP TABLE "workflows"`);
  }
}
