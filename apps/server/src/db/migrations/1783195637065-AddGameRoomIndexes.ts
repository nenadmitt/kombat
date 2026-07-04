import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGameRoomIndexes1783195637065 implements MigrationInterface {
    name = 'AddGameRoomIndexes1783195637065'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX "IDX_b56b91fcc167557765e3053806" ON "game_rooms" ("user_id", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_217ab9ed2a20b0f5067eb2e8bc" ON "game_rooms" ("status", "created_at") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_217ab9ed2a20b0f5067eb2e8bc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b56b91fcc167557765e3053806"`);
    }

}
