import { MigrationInterface, QueryRunner } from 'typeorm';

/** Multi-player (Ludo) rooms hold their joiners in an array; NavalBattle
 *  keeps using the single opponent_id column. */
export class AddGameRoomOpponentIds1783800000000 implements MigrationInterface {
  name = 'AddGameRoomOpponentIds1783800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "game_rooms" ADD "opponent_ids" uuid array NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "opponent_ids"`);
  }
}
