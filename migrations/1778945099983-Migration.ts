import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778945099983 implements MigrationInterface {
    name = 'Migration1778945099983'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "task_dependencies" ("taskId" varchar NOT NULL, "dependsOnTaskId" varchar NOT NULL, PRIMARY KEY ("taskId", "dependsOnTaskId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_70371fdc2193845ef4feb9fb87" ON "task_dependencies" ("taskId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e94ede407a522714514c8471a8" ON "task_dependencies" ("dependsOnTaskId") `);
        await queryRunner.query(`CREATE TABLE "temporary_tasks" ("status" varchar NOT NULL, "id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL, "output" text, "workflowId" varchar, "attemptCount" integer NOT NULL DEFAULT (0), "nextAttemptAt" datetime, "errorHistory" text NOT NULL DEFAULT ('[]'), CONSTRAINT "FK_59b2c33d2a8cbfe6a2e6bc942ed" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_tasks"("status", "id", "createdAt", "updatedAt", "type", "output", "workflowId", "attemptCount", "nextAttemptAt", "errorHistory") SELECT "status", "id", "createdAt", "updatedAt", "type", "output", "workflowId", "attemptCount", "nextAttemptAt", "errorHistory" FROM "tasks"`);
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`ALTER TABLE "temporary_tasks" RENAME TO "tasks"`);
        await queryRunner.query(`DROP INDEX "IDX_70371fdc2193845ef4feb9fb87"`);
        await queryRunner.query(`DROP INDEX "IDX_e94ede407a522714514c8471a8"`);
        await queryRunner.query(`CREATE TABLE "temporary_task_dependencies" ("taskId" varchar NOT NULL, "dependsOnTaskId" varchar NOT NULL, CONSTRAINT "FK_70371fdc2193845ef4feb9fb879" FOREIGN KEY ("taskId") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE, CONSTRAINT "FK_e94ede407a522714514c8471a81" FOREIGN KEY ("dependsOnTaskId") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("taskId", "dependsOnTaskId"))`);
        await queryRunner.query(`INSERT INTO "temporary_task_dependencies"("taskId", "dependsOnTaskId") SELECT "taskId", "dependsOnTaskId" FROM "task_dependencies"`);
        await queryRunner.query(`DROP TABLE "task_dependencies"`);
        await queryRunner.query(`ALTER TABLE "temporary_task_dependencies" RENAME TO "task_dependencies"`);
        await queryRunner.query(`CREATE INDEX "IDX_70371fdc2193845ef4feb9fb87" ON "task_dependencies" ("taskId") `);
        await queryRunner.query(`CREATE INDEX "IDX_e94ede407a522714514c8471a8" ON "task_dependencies" ("dependsOnTaskId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_e94ede407a522714514c8471a8"`);
        await queryRunner.query(`DROP INDEX "IDX_70371fdc2193845ef4feb9fb87"`);
        await queryRunner.query(`ALTER TABLE "task_dependencies" RENAME TO "temporary_task_dependencies"`);
        await queryRunner.query(`CREATE TABLE "task_dependencies" ("taskId" varchar NOT NULL, "dependsOnTaskId" varchar NOT NULL, PRIMARY KEY ("taskId", "dependsOnTaskId"))`);
        await queryRunner.query(`INSERT INTO "task_dependencies"("taskId", "dependsOnTaskId") SELECT "taskId", "dependsOnTaskId" FROM "temporary_task_dependencies"`);
        await queryRunner.query(`DROP TABLE "temporary_task_dependencies"`);
        await queryRunner.query(`CREATE INDEX "IDX_e94ede407a522714514c8471a8" ON "task_dependencies" ("dependsOnTaskId") `);
        await queryRunner.query(`CREATE INDEX "IDX_70371fdc2193845ef4feb9fb87" ON "task_dependencies" ("taskId") `);
        await queryRunner.query(`ALTER TABLE "tasks" RENAME TO "temporary_tasks"`);
        await queryRunner.query(`CREATE TABLE "tasks" ("status" varchar NOT NULL, "stepNumber" integer NOT NULL DEFAULT (1), "id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "type" varchar NOT NULL, "output" text, "workflowId" varchar, "attemptCount" integer NOT NULL DEFAULT (0), "nextAttemptAt" datetime, "errorHistory" text NOT NULL DEFAULT ('[]'), CONSTRAINT "FK_59b2c33d2a8cbfe6a2e6bc942ed" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "tasks"("status", "id", "createdAt", "updatedAt", "type", "output", "workflowId", "attemptCount", "nextAttemptAt", "errorHistory") SELECT "status", "id", "createdAt", "updatedAt", "type", "output", "workflowId", "attemptCount", "nextAttemptAt", "errorHistory" FROM "temporary_tasks"`);
        await queryRunner.query(`DROP TABLE "temporary_tasks"`);
        await queryRunner.query(`DROP INDEX "IDX_e94ede407a522714514c8471a8"`);
        await queryRunner.query(`DROP INDEX "IDX_70371fdc2193845ef4feb9fb87"`);
        await queryRunner.query(`DROP TABLE "task_dependencies"`);
    }

}
