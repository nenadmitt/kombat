import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserEnsName1785500000000 implements MigrationInterface {
  name = 'UserEnsName1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "ens_name" character varying
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_users_ens_name" ON "users" ("ens_name")
      WHERE "ens_name" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_users_ens_name"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "ens_name"`);
  }
}
