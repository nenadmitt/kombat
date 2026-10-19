import { MigrationInterface, QueryRunner } from 'typeorm';

export class CrossStableStakes1786100000000 implements MigrationInterface {
  name = 'CrossStableStakes1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "game_rooms" ADD COLUMN "stake_token_choices" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_settlements" ADD COLUMN "payout_by_asset" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_settlements" ADD COLUMN "fee_by_asset" jsonb`,
    );
    // A cross-stable room pays one prize per asset, so ledger uniqueness is per asset too.
    await queryRunner.query(`DROP INDEX "UQ_stake_ledger_room_entry"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stake_ledger_room_entry" ON "stake_ledger_entries" ("room_id", "user_id", "kind", "asset") WHERE "room_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_stake_ledger_room_entry"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stake_ledger_room_entry" ON "stake_ledger_entries" ("room_id", "user_id", "kind") WHERE "room_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_settlements" DROP COLUMN "fee_by_asset"`,
    );
    await queryRunner.query(
      `ALTER TABLE "match_settlements" DROP COLUMN "payout_by_asset"`,
    );
    await queryRunner.query(
      `ALTER TABLE "game_rooms" DROP COLUMN "stake_token_choices"`,
    );
  }
}
