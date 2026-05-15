import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Entity cleanup migration.
 *
 *  - Drops the `results` table (output now lives on `tasks.output` as a simple-json
 *    discriminated union; Result was a 1:1 child accessed only via Task, i.e. a value object).
 *  - Workflow: renames PK `workflowId` → `id`, adds `createdAt`/`updatedAt` (via AbstractBaseEntity)
 *    and `geoJson` (input data moved here from per-task duplication).
 *  - Task: renames PK `taskId` → `id`, renames `taskType` → `type`, drops `clientId` (workflow
 *    owns it), `geoJson` (moved to workflow), `progress` (unused), `resultId` (gone with Result).
 *    Adds `output` (nullable simple-json), `createdAt`/`updatedAt`. FK column renamed from
 *    `workflowWorkflowId` → `workflowId` now that Workflow's PK is just `id`.
 *
 * Existing rows are not preserved: the new `workflows.geoJson` is NOT NULL with no sensible
 * backfill for legacy test data, and there is no production data to migrate.
 */
export class Migration1778853415257 implements MigrationInterface {
    name = 'Migration1778853415257'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Drop legacy results table — output now lives on Task.output
        await queryRunner.query(`DROP TABLE "results"`);

        // 2. Recreate workflows with new shape (PK rename + base columns + geoJson).
        //    Status is dropped: workflow status is a function of task statuses,
        //    derived on read (see deriveWorkflowStatus) rather than stored as
        //    a denormalized cache that would need an invariant to maintain.
        await queryRunner.query(
            `CREATE TABLE "temporary_workflows" (` +
                `"clientId" varchar NOT NULL, ` +
                `"id" varchar PRIMARY KEY NOT NULL, ` +
                `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
                `"updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
                `"geoJson" text NOT NULL` +
                `)`
        );
        await queryRunner.query(`DROP TABLE "workflows"`);
        await queryRunner.query(`ALTER TABLE "temporary_workflows" RENAME TO "workflows"`);

        // 3. Recreate tasks with new shape (PK rename, taskType→type, drop redundant fields,
        //    add output + base columns, rename FK column and re-bind to workflows.id)
        await queryRunner.query(
            `CREATE TABLE "temporary_tasks" (` +
                `"status" varchar NOT NULL, ` +
                `"stepNumber" integer NOT NULL DEFAULT (1), ` +
                `"id" varchar PRIMARY KEY NOT NULL, ` +
                `"createdAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
                `"updatedAt" datetime NOT NULL DEFAULT (datetime('now')), ` +
                `"type" varchar NOT NULL, ` +
                `"output" text, ` +
                `"workflowId" varchar, ` +
                `CONSTRAINT "FK_59b2c33d2a8cbfe6a2e6bc942ed" FOREIGN KEY ("workflowId") REFERENCES "workflows" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION` +
                `)`
        );
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`ALTER TABLE "temporary_tasks" RENAME TO "tasks"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverse: restore the original Migration1778767821312 shape. Data is not restored.
        await queryRunner.query(`DROP TABLE "tasks"`);
        await queryRunner.query(`DROP TABLE "workflows"`);

        await queryRunner.query(
            `CREATE TABLE "workflows" (` +
                `"workflowId" varchar PRIMARY KEY NOT NULL, ` +
                `"clientId" varchar NOT NULL, ` +
                `"status" varchar NOT NULL DEFAULT ('initial')` +
                `)`
        );

        await queryRunner.query(
            `CREATE TABLE "tasks" (` +
                `"taskId" varchar PRIMARY KEY NOT NULL, ` +
                `"clientId" varchar NOT NULL, ` +
                `"geoJson" text NOT NULL, ` +
                `"status" varchar NOT NULL, ` +
                `"progress" text, ` +
                `"resultId" varchar, ` +
                `"taskType" varchar NOT NULL, ` +
                `"stepNumber" integer NOT NULL DEFAULT (1), ` +
                `"workflowWorkflowId" varchar, ` +
                `CONSTRAINT "FK_7b0ae8bc975cb08bfbd35cc76f7" FOREIGN KEY ("workflowWorkflowId") REFERENCES "workflows" ("workflowId") ON DELETE NO ACTION ON UPDATE NO ACTION` +
                `)`
        );

        await queryRunner.query(
            `CREATE TABLE "results" (` +
                `"resultId" varchar PRIMARY KEY NOT NULL, ` +
                `"taskId" varchar NOT NULL, ` +
                `"data" text NOT NULL` +
                `)`
        );
    }
}
