import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stake pot ledger: pooled balances, the append-only journal, the withdrawal
 * queue, and the event watcher's block cursor.
 *
 * Two indexes carry correctness, not performance:
 * `UQ_stake_ledger_deposit_tx` is partial so it constrains deposits only (match
 * entries all have a null tx_hash and must not collide), and
 * `UQ_staked_balances_user_asset` is what makes the credit path a safe upsert
 * instead of a read-then-insert race.
 *
 * The timestamps are `timestamptz`, unlike the older tables: a plain
 * `timestamp` reads back into JS skewed by the database/process timezone gap.
 * See bugs-and-inconsistencies/SERVER.BAI.md.
 */
export class CreateStakePot1784300000000 implements MigrationInterface {
  name = 'CreateStakePot1784300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "staked_balances" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "asset" smallint NOT NULL,
        "available" numeric(78,0) NOT NULL DEFAULT 0,
        "locked" numeric(78,0) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_staked_balances" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_staked_balances_user_asset" ON "staked_balances" ("user_id", "asset")`,
    );
    // Backstop, not the guard: holds and debits are supposed to keep balances
    // non-negative. This turns a logic bug into a failed transaction.
    await queryRunner.query(
      `ALTER TABLE "staked_balances" ADD CONSTRAINT "CHK_staked_balances_non_negative" CHECK ("available" >= 0 AND "locked" >= 0)`,
    );

    await queryRunner.query(`
      CREATE TABLE "stake_ledger_entries" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "asset" smallint NOT NULL,
        "kind" smallint NOT NULL,
        "amount" numeric(78,0) NOT NULL,
        "room_id" uuid,
        "tx_hash" character varying,
        "log_index" integer,
        "withdrawal_id" uuid,
        "balance_after" numeric(78,0) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stake_ledger_entries" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_stake_ledger_user_created" ON "stake_ledger_entries" ("user_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stake_ledger_room_kind" ON "stake_ledger_entries" ("room_id", "kind")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stake_ledger_deposit_tx" ON "stake_ledger_entries" ("tx_hash", "log_index") WHERE "tx_hash" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "stake_pot_withdrawals" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "asset" smallint NOT NULL,
        "amount" numeric(78,0) NOT NULL,
        "to_address" character varying NOT NULL,
        "status" smallint NOT NULL,
        "tx_hash" character varying,
        "attempts" smallint NOT NULL DEFAULT 0,
        "error" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stake_pot_withdrawals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_stake_pot_withdrawals_status_updated" ON "stake_pot_withdrawals" ("status", "updated_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stake_pot_withdrawals_user_created" ON "stake_pot_withdrawals" ("user_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "stake_pot_cursor" (
        "id" smallint NOT NULL,
        "last_scanned_block" bigint NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stake_pot_cursor" PRIMARY KEY ("id")
      )
    `);

    // The event watcher resolves a beneficiary address to its owner once per
    // event, case-insensitively (decoded log args are not reliably
    // checksummed). The plain unique index on address can't serve that.
    await queryRunner.query(
      `CREATE INDEX "IDX_wallets_address_lower" ON "wallets" (LOWER("address"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_wallets_address_lower"`);
    await queryRunner.query(`DROP TABLE "stake_pot_cursor"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_stake_pot_withdrawals_user_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_stake_pot_withdrawals_status_updated"`,
    );
    await queryRunner.query(`DROP TABLE "stake_pot_withdrawals"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_stake_ledger_deposit_tx"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_stake_ledger_room_kind"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_stake_ledger_user_created"`,
    );
    await queryRunner.query(`DROP TABLE "stake_ledger_entries"`);
    await queryRunner.query(
      `ALTER TABLE "staked_balances" DROP CONSTRAINT "CHK_staked_balances_non_negative"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_staked_balances_user_asset"`,
    );
    await queryRunner.query(`DROP TABLE "staked_balances"`);
  }
}
