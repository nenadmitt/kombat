import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPlatform1785800000000 implements MigrationInterface {
  name = 'UserPlatform1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "platform" smallint`,
    );

    await queryRunner.query(
      `UPDATE "users" SET "platform" = 1 WHERE "email" IS NULL`,
    );
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
