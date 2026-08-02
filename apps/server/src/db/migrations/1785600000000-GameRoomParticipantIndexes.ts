import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Every "rooms I played in" query ORs three seat columns. Only `user_id` was
 * indexed, so the other two branches forced a sequential scan of game_rooms -
 * four of them per profile open. With all three indexed the planner can
 * bitmap-OR them instead.
 */
export class GameRoomParticipantIndexes1785600000000
  implements MigrationInterface
{
  name = 'GameRoomParticipantIndexes1785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Mirrors IDX_game_rooms_user_status for the second seat.
    await queryRunner.query(`
      CREATE INDEX "IDX_game_rooms_opponent_status"
        ON "game_rooms" ("opponent_id", "status")
        WHERE "opponent_id" IS NOT NULL
    `);
    // GIN serves the containment form (opponent_ids @> ARRAY[id]); the
    // equivalent = ANY(...) cannot use an index at all.
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
