import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserIsBot1786200000000 implements MigrationInterface {
  name = 'UserIsBot1786200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "is_bot" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "is_bot"`);
  }
}
