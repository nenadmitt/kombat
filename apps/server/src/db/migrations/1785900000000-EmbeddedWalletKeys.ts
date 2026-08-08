import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Custodial key storage for web accounts. The CHECK is the point: key
 * material exists for embedded wallets (type 2) and for nothing else, so the
 * two custody models cannot blur into each other by accident.
 */
export class EmbeddedWalletKeys1785900000000 implements MigrationInterface {
  name = 'EmbeddedWalletKeys1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD COLUMN "encrypted_private_key" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "CHK_wallets_embedded_key"
       CHECK (("type" = 2) = ("encrypted_private_key" IS NOT NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "CHK_wallets_embedded_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP COLUMN "encrypted_private_key"`,
    );
  }
}
