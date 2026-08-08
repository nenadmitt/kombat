import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Accounts belong to the app that created them. Existing rows are classified
 * by how they got a wallet, which is the only evidence there is: an account
 * that was *given* one (email sign-in, platform-origin wallet) came from
 * mobile; one that *connected* its own (no email, SIWE) came from web.
 */
export class UserPlatform1785800000000 implements MigrationInterface {
  name = 'UserPlatform1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "platform" smallint`,
    );

    // Wallet-only (SIWE) accounts are the web ones: they have no inbox.
    await queryRunner.query(
      `UPDATE "users" SET "platform" = 1 WHERE "email" IS NULL`,
    );
    // Everything else predates the web client, whether or not the mobile
    // wallet was ever created.
    await queryRunner.query(
      `UPDATE "users" SET "platform" = 0 WHERE "platform" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "platform" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "platform" SET DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "platform"`);
  }
}
