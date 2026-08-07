import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * SIWE accounts are identified by their wallet, not an inbox. The unique
 * constraint stays: Postgres treats NULLs as distinct, so any number of
 * wallet-only users can coexist.
 */
export class WalletOnlyUsers1785700000000 implements MigrationInterface {
  name = 'WalletOnlyUsers1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "users" WHERE "email" IS NULL`);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`,
    );
  }
}
