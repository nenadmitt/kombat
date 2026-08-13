import { MigrationInterface, QueryRunner } from 'typeorm';

export class GameRoomEliminated1786300000000 implements MigrationInterface {
  name = 'GameRoomEliminated1786300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "game_rooms" ADD COLUMN "eliminated_user_ids" uuid[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "game_rooms" DROP COLUMN "eliminated_user_ids"`,
    );
  }
}
