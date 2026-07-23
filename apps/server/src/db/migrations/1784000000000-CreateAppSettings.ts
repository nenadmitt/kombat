import { MigrationInterface, QueryRunner } from 'typeorm';

/** Key/value platform settings; first consumer is the maintenance flag. */
export class CreateAppSettings1784000000000 implements MigrationInterface {
  name = 'CreateAppSettings1784000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "app_settings" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "key" character varying NOT NULL,
        "value" jsonb NOT NULL,
        CONSTRAINT "UQ_app_settings_key" UNIQUE ("key"),
        CONSTRAINT "PK_app_settings_id" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_settings"`);
  }
}
