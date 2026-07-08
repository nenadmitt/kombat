import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGameRoomOpponent1783203643598 implements MigrationInterface {
    name = 'AddGameRoomOpponent1783203643598'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "game_rooms" ADD "opponent_id" uuid`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "opponent_id"`);
    }

}
