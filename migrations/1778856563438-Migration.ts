import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778856563438 implements MigrationInterface {
    name = 'Migration1778856563438'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_tasks" ("status" varchar NOT NULL, "stepNumber" integer NOT NULL DEFAULT (1), "id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL, "output" text, "workflowId" varchar, "attemptCount" integer NOT NULL DEFAULT (0), "nextAttemptAt" datetime, "errorHistory" text NOT NULL DEFAULT ('[]'), CONSTRAINT "FK_59b2c33d2a8cbfe6a2e6bc942ed" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_tasks"("status", "stepNumber", "id", "createdAt", "updatedAt", "type", "output", "workflowId") SELECT "status", "stepNumber", "id", "createdAt", "updatedAt", "type", "output", "workflowId" FROM "tasks"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`ALTER TABLE "temporary_tasks" RENAME TO "tasks"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "tasks" RENAME TO "temporary_tasks"`);
        await queryRunner.query(`CREATE TABLE "tasks" ("status" varchar NOT NULL, "stepNumber" integer NOT NULL DEFAULT (1), "id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL, "output" text, "workflowId" varchar, CONSTRAINT "FK_59b2c33d2a8cbfe6a2e6bc942ed" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "tasks"("status", "stepNumber", "id", "createdAt", "updatedAt", "type", "output", "workflowId") SELECT "status", "stepNumber", "id", "createdAt", "updatedAt", "type", "output", "workflowId" FROM "temporary_tasks"`);
        await queryRunner.query(`DROP TABLE "temporary_tasks"`);
    }

}
