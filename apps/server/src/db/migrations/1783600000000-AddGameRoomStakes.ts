import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Staking + persisted results on game rooms. stake_* null on all = free
 * game; winner/end_reason/completed_at were never persisted before (match
 * results lived only in the in-memory/cache match state).
 */
export class AddGameRoomStakes1783600000000 implements MigrationInterface {
  name = 'AddGameRoomStakes1783600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "game_rooms" ADD "stake_token" smallint`);
    await queryRunner.query(`ALTER TABLE "game_rooms" ADD "stake_amount" numeric(78,0)`);
    await queryRunner.query(`ALTER TABLE "game_rooms" ADD "winner_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "game_rooms" ADD "end_reason" character varying`);
    await queryRunner.query(`ALTER TABLE "game_rooms" ADD "completed_at" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "completed_at"`);
    await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "end_reason"`);
    await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "winner_user_id"`);
    await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "stake_amount"`);
    await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "stake_token"`);
  }
}
