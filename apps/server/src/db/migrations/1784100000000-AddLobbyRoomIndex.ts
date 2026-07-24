import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Partial index for the lobby listing. The lobby only ever queries pending,
 * public rooms, so a partial index scoped to `status = Pending (0)` and
 * `is_private = false` stays tiny and directly serves the filterable list:
 * game_type / stake_token equality filters plus created_at ordering.
 */
export class AddLobbyRoomIndex1784100000000 implements MigrationInterface {
  name = 'AddLobbyRoomIndex1784100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_game_rooms_lobby" ON "game_rooms" ("game_type", "stake_token", "created_at") WHERE "status" = 0 AND "is_private" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_game_rooms_lobby"`);
  }
}
