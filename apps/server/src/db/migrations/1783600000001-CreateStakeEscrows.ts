import { MigrationInterface, QueryRunner } from 'typeorm';

/** On-chain escrow lifecycle per staked room: audit trail + sweeper queue. */
export class CreateStakeEscrows1783600000001 implements MigrationInterface {
  name = 'CreateStakeEscrows1783600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "stake_escrows" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "room_id" uuid NOT NULL,
        "match_id" character varying NOT NULL,
        "status" smallint NOT NULL,
        "fund_tx_hashes" jsonb NOT NULL DEFAULT '[]',
        "settle_tx" character varying,
        "void_tx" character varying,
        "payout" numeric(78,0),
        "fee" numeric(78,0),
        "attempts" smallint NOT NULL DEFAULT '0',
        "error" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_stake_escrows_room_id" UNIQUE ("room_id"),
        CONSTRAINT "PK_stake_escrows_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_stake_escrows_status_updated_at" ON "stake_escrows" ("status", "updated_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_stake_escrows_status_updated_at"`);
    await queryRunner.query(`DROP TABLE "stake_escrows"`);
  }
}
