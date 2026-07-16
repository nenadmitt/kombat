import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Private rooms + shareable join codes: `is_private` hides a room from the
 * lobby, `code` is a unique short invite code used by join-by-code.
 */
export class AddGameRoomPrivacyAndCode1783700000000
  implements MigrationInterface
{
  name = 'AddGameRoomPrivacyAndCode1783700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "game_rooms" ADD "code" character varying`);
    await queryRunner.query(
      `ALTER TABLE "game_rooms" ADD "is_private" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_game_rooms_code" ON "game_rooms" ("code") WHERE "code" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_game_rooms_code"`);
    await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "is_private"`);
    await queryRunner.query(`ALTER TABLE "game_rooms" DROP COLUMN "code"`);
  }
}
