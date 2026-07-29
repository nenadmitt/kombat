import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Signup grants (the KOMBAT faucet). The unique index on user_id is what makes
 * the grant once-per-player: the row is claimed with ON CONFLICT DO NOTHING
 * before any transaction is sent.
 */
export class CreateStakePotGrants1784400000000 implements MigrationInterface {
  name = 'CreateStakePotGrants1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stake_pot_grants_user" ON "stake_pot_grants" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_stake_pot_grants_user"`);
    await queryRunner.query(`DROP TABLE "stake_pot_grants"`);
  }
}
