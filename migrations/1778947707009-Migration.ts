import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1778947707009 implements MigrationInterface {
    name = 'Migration1778947707009'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_workflows" ("clientId" varchar NOT NULL, "id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "geoJson" text NOT NULL, "finalResult" text)`);
        await queryRunner.query(`INSERT INTO "temporary_workflows"("clientId", "id", "createdAt", "updatedAt", "geoJson") SELECT "clientId", "id", "createdAt", "updatedAt", "geoJson" FROM "workflows"`);
        await queryRunner.query(`DROP TABLE "workflows"`);
        await queryRunner.query(`ALTER TABLE "temporary_workflows" RENAME TO "workflows"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workflows" RENAME TO "temporary_workflows"`);
        await queryRunner.query(`CREATE TABLE "workflows" ("clientId" varchar NOT NULL, "id" varchar PRIMARY KEY NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), "geoJson" text NOT NULL)`);
        await queryRunner.query(`INSERT INTO "workflows"("clientId", "id", "createdAt", "updatedAt", "geoJson") SELECT "clientId", "id", "createdAt", "updatedAt", "geoJson" FROM "temporary_workflows"`);
        await queryRunner.query(`DROP TABLE "temporary_workflows"`);
    }

}
