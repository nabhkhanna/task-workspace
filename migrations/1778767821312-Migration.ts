import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778767821312 implements MigrationInterface {
    name = 'Migration1778767821312'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "results" ("resultId" varchar PRIMARY KEY NOT NULL, "taskId" varchar NOT NULL, "data" text NOT NULL)`);
        await queryRunner.query(`CREATE TABLE "workflows" ("workflowId" varchar PRIMARY KEY NOT NULL, "clientId" varchar NOT NULL, "status" varchar NOT NULL DEFAULT ('initial'))`);
        await queryRunner.query(`CREATE TABLE "tasks" ("taskId" varchar PRIMARY KEY NOT NULL, "clientId" varchar NOT NULL, "geoJson" text NOT NULL, "status" varchar NOT NULL, "progress" text, "resultId" varchar, "taskType" varchar NOT NULL, "stepNumber" integer NOT NULL DEFAULT (1), "workflowWorkflowId" varchar)`);
        await queryRunner.query(`CREATE TABLE "temporary_tasks" ("taskId" varchar PRIMARY KEY NOT NULL, "clientId" varchar NOT NULL, "geoJson" text NOT NULL, "status" varchar NOT NULL, "progress" text, "resultId" varchar, "taskType" varchar NOT NULL, "stepNumber" integer NOT NULL DEFAULT (1), "workflowWorkflowId" varchar, CONSTRAINT "FK_7b0ae8bc975cb08bfbd35cc76f7" FOREIGN KEY ("workflowWorkflowId") REFERENCES "workflows" ("workflowId") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_tasks"("taskId", "clientId", "geoJson", "status", "progress", "resultId", "taskType", "stepNumber", "workflowWorkflowId") SELECT "taskId", "clientId", "geoJson", "status", "progress", "resultId", "taskType", "stepNumber", "workflowWorkflowId" FROM "tasks"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`ALTER TABLE "temporary_tasks" RENAME TO "tasks"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tasks" RENAME TO "temporary_tasks"`);
        await queryRunner.query(`CREATE TABLE "tasks" ("taskId" varchar PRIMARY KEY NOT NULL, "clientId" varchar NOT NULL, "geoJson" text NOT NULL, "status" varchar NOT NULL, "progress" text, "resultId" varchar, "taskType" varchar NOT NULL, "stepNumber" integer NOT NULL DEFAULT (1), "workflowWorkflowId" varchar)`);
        await queryRunner.query(`INSERT INTO "tasks"("taskId", "clientId", "geoJson", "status", "progress", "resultId", "taskType", "stepNumber", "workflowWorkflowId") SELECT "taskId", "clientId", "geoJson", "status", "progress", "resultId", "taskType", "stepNumber", "workflowWorkflowId" FROM "temporary_tasks"`);
        await queryRunner.query(`DROP TABLE "temporary_tasks"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`DROP TABLE "workflows"`);
        await queryRunner.query(`DROP TABLE "results"`);
    }

}
