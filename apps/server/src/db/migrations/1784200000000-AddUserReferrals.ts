import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Referrals. Each user gets their own shareable `referral_code` and may
 * record who referred them.
 *
 * The code is stored rather than derived from the username: usernames can in
 * principle change, and a code that shifted underneath people who had already
 * shared it would break attribution.
 *
 * Existing users are backfilled with codes here. The backfill retries on the
 * unique index rather than trusting a single pass, because random 8-character
 * codes will occasionally collide.
 */
export class AddUserReferrals1784200000000 implements MigrationInterface {
  name = 'AddUserReferrals1784200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "referral_code" varchar(8)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "referred_by_user_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_referred_by" FOREIGN KEY ("referred_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );

    // Backfill: same alphabet as core's generateReferralCode (no I/O/0/1).
    // Loop until every row has one; the unique index below is added after,
    // so collisions are resolved by re-rolling the duplicates.
    await queryRunner.query(`
      DO $$
      DECLARE
        remaining int;
        guard int := 0;
      BEGIN
        LOOP
          UPDATE "users" SET "referral_code" = (
            SELECT string_agg(
              substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                     (floor(random() * 32) + 1)::int, 1), '')
            FROM generate_series(1, 8)
          )
          WHERE "referral_code" IS NULL;

          -- Clear any duplicates so the next pass re-rolls them.
          UPDATE "users" SET "referral_code" = NULL
          WHERE "id" IN (
            SELECT "id" FROM (
              SELECT "id", row_number() OVER (
                PARTITION BY "referral_code" ORDER BY "created_at"
              ) AS rn
              FROM "users" WHERE "referral_code" IS NOT NULL
            ) dupes WHERE rn > 1
          );

          SELECT count(*) INTO remaining FROM "users" WHERE "referral_code" IS NULL;
          guard := guard + 1;
          EXIT WHEN remaining = 0 OR guard > 20;
        END LOOP;
      END $$;
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_referral_code" ON "users" ("referral_code") WHERE "referral_code" IS NOT NULL`,
    );
    // Serves the "how many people did I refer" count on the profile.
    await queryRunner.query(
      `CREATE INDEX "IDX_users_referred_by" ON "users" ("referred_by_user_id") WHERE "referred_by_user_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_users_referred_by"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_users_referral_code"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_referred_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "referred_by_user_id"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referral_code"`);
  }
}
