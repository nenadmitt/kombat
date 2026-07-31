import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Drops the custodial private-key column.
 *
 * The server never signed with these: the only write was at wallet creation and
 * `decrypt` had no callers anywhere - deposits, transfers and permits are all
 * signed on the player's device. Storing them therefore bought no capability
 * and made the database a single point of total loss for every player's funds.
 *
 * The wallet row itself stays. `address` is what maps an on-chain Staked event
 * to a user, which is how stake-pot deposits get credited; that mapping is the
 * reason the table exists.
 *
 * Irreversible by design: `down` restores the column shape (nullable, since the
 * secrets are gone for good) so a rollback doesn't break the schema, but no key
 * material comes back. A player who loses their mnemonic can no longer be
 * recovered by the platform - which is the point.
 */
export class DropWalletPrivateKeys1784600000000 implements MigrationInterface {
  name = 'DropWalletPrivateKeys1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "wallets" DROP COLUMN "key"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD COLUMN "key" character varying`,
    );
  }
}
