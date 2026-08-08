import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "One wallet per account" was a count-then-insert in the service, which two
 * concurrent requests walk straight past. The database is the only place the
 * rule actually holds. Existing duplicates (dev artifacts of that race) are
 * resolved to the oldest row.
 */
export class OneWalletPerUser1786000000000 implements MigrationInterface {
  name = 'OneWalletPerUser1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "wallets" w USING "wallets" keep
      WHERE w."user_id" = keep."user_id"
        AND (w."created_at", w."id") > (keep."created_at", keep."id")
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wallets_user_id" ON "wallets" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_wallets_user_id"`);
  }
}
