import { MigrationInterface, QueryRunner } from 'typeorm';

// Every timestamp is timestamptz: a naive timestamp compared to Date.now() skews by the UTC offset.
export class InitialSchema1785000000000 implements MigrationInterface {
  name = 'InitialSchema1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "email" character varying NOT NULL,
        "username" character varying,
        "referral_code" character varying(8),
        "referred_by_user_id" uuid,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_username" UNIQUE ("username"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_referral_code" ON "users" ("referral_code") WHERE "referral_code" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "email_login_tokens" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "token" character varying(8) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_login_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_6911817c3d00582efc32a7576b1" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_email_login_tokens_token" ON "email_login_tokens" ("token")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_3ddc983c5f7bcf132fd8732c3f4" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_refresh_tokens_hash" ON "refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_user_live" ON "refresh_tokens" ("user_id") WHERE "revoked_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "address" character varying NOT NULL,
        "type" smallint NOT NULL DEFAULT '0',
        "network" smallint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_wallets_address" UNIQUE ("address"),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id")
      )
    `);
    // Decoded log args aren't reliably checksummed, so the lookup is case-insensitive.
    await queryRunner.query(
      `CREATE INDEX "IDX_wallets_address_lower" ON "wallets" (LOWER("address"))`,
    );

    await queryRunner.query(`
      CREATE TABLE "app_settings" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "key" character varying NOT NULL,
        "value" jsonb NOT NULL,
        CONSTRAINT "UQ_app_settings_key" UNIQUE ("key"),
        CONSTRAINT "PK_app_settings" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "game_rooms" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "game_type" smallint NOT NULL,
        "code" character varying,
        "is_private" boolean NOT NULL DEFAULT false,
        "status" smallint NOT NULL DEFAULT '0',
        "player_count" smallint NOT NULL,
        "opponent_id" uuid,
        "opponent_ids" uuid array NOT NULL DEFAULT '{}',
        "stake_token" smallint,
        "stake_amount" numeric(78,0),
        "winner_user_id" uuid,
        "end_reason" character varying,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_game_rooms" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_game_rooms_status_created" ON "game_rooms" ("status", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_game_rooms_user_status" ON "game_rooms" ("user_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_game_rooms_lobby" ON "game_rooms" ("game_type", "stake_token", "created_at") WHERE "status" = 0 AND "is_private" = false`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_game_rooms_code" ON "game_rooms" ("code") WHERE "code" IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "match_settlements" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "room_id" uuid NOT NULL,
        "status" smallint NOT NULL,
        "payout" numeric(78,0),
        "fee" numeric(78,0),
        "attempts" smallint NOT NULL DEFAULT '0',
        "error" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_match_settlements_room" UNIQUE ("room_id"),
        CONSTRAINT "PK_match_settlements" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_match_settlements_status_updated" ON "match_settlements" ("status", "updated_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "staked_balances" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "asset" smallint NOT NULL,
        "available" numeric(78,0) NOT NULL DEFAULT '0',
        "locked" numeric(78,0) NOT NULL DEFAULT '0',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_staked_balances_non_negative" CHECK ("available" >= 0 AND "locked" >= 0),
        CONSTRAINT "PK_staked_balances" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_staked_balances_user_asset" ON "staked_balances" ("user_id", "asset")`,
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
    // Deposit idempotency: a re-scanned block range credits nothing twice.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stake_ledger_deposit_tx" ON "stake_ledger_entries" ("tx_hash", "log_index") WHERE "tx_hash" IS NOT NULL`,
    );
    // One Hold/Capture/Release per player per room, one Prize, one Fee: stops a double payout.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stake_ledger_room_entry" ON "stake_ledger_entries" ("room_id", "user_id", "kind") WHERE "room_id" IS NOT NULL`,
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
        "attempts" smallint NOT NULL DEFAULT '0',
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
      CREATE TABLE "stake_pot_grants" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "asset" smallint NOT NULL,
        "amount" numeric(78,0) NOT NULL,
        "tx_hash" character varying,
        "error" character varying,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stake_pot_grants" PRIMARY KEY ("id")
      )
    `);
    // Claimed before the tx is sent, so a retried signup can't pay twice.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stake_pot_grants_user" ON "stake_pot_grants" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "stake_pot_cursor" (
        "id" smallint NOT NULL,
        "last_scanned_block" bigint NOT NULL,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stake_pot_cursor" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "stake_pot_cursor"`);
    await queryRunner.query(`DROP TABLE "stake_pot_grants"`);
    await queryRunner.query(`DROP TABLE "stake_pot_withdrawals"`);
    await queryRunner.query(`DROP TABLE "stake_ledger_entries"`);
    await queryRunner.query(`DROP TABLE "staked_balances"`);
    await queryRunner.query(`DROP TABLE "match_settlements"`);
    await queryRunner.query(`DROP TABLE "game_rooms"`);
    await queryRunner.query(`DROP TABLE "app_settings"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "email_login_tokens"`);
    await queryRunner.query(`DROP TABLE "users"`);
  }
}
