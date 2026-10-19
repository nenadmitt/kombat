import { MigrationInterface, QueryRunner } from 'typeorm';

export class GameRoomParticipantIndexes1785600000000
  implements MigrationInterface
{
  name = 'GameRoomParticipantIndexes1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_game_rooms_opponent_status"
        ON "game_rooms" ("opponent_id", "status")
        WHERE "opponent_id" IS NOT NULL
    `);
    // GIN serves `opponent_ids @> ARRAY[id]`; `= ANY(...)` can't use an index at all.
    await queryRunner.query(`
      CREATE INDEX "IDX_game_rooms_opponent_ids"
        ON "game_rooms" USING GIN ("opponent_ids")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_game_rooms_opponent_ids"`);
    await queryRunner.query(`DROP INDEX "IDX_game_rooms_opponent_status"`);
  }
}
