import { MigrationInterface, QueryRunner } from 'typeorm';

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
