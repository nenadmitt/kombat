import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refresh tokens, so the access token can be short-lived without logging
 * players out every other day.
 *
 * Stores only the SHA-256 of each token, and keeps revoked rows rather than
 * deleting them: replaying a revoked token is the signal that it was stolen,
 * and a deleted row can't be told apart from one that never existed.
 *
 * The partial index serves the only hot query - "the live tokens for this
 * user" - which the reuse-detection path runs when it revokes a whole set.
 */
export class CreateRefreshTokens1784700000000 implements MigrationInterface {
  name = 'CreateRefreshTokens1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_refresh_tokens_hash" ON "refresh_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_user_live" ON "refresh_tokens" ("user_id") WHERE "revoked_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_refresh_tokens_user_live"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_refresh_tokens_hash"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
