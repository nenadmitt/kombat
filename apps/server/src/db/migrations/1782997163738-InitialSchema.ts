import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1782997163738 implements MigrationInterface {
  name = 'InitialSchema1782997163738';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "address" character varying NOT NULL,
        "key" character varying NOT NULL,
        "type" smallint NOT NULL DEFAULT '0',
        "network" smallint NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_f907d5fd09a9d374f1da4e13bd3" UNIQUE ("address"),
        CONSTRAINT "UQ_3b31b2a8fa7349a151032224f6d" UNIQUE ("key"),
        CONSTRAINT "PK_8402e5df5a30a229380e83e4f7e" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "email" character varying NOT NULL,
        "username" character varying,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
        CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE ("username"),
        CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "email_login_tokens" (
        "id" uuid NOT NULL DEFAULT uuidv7(),
        "user_id" uuid NOT NULL,
        "token" character varying(8) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_240dc01d638d8805de002f8ed58" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_be923a2d962510f8060a16ab10" ON "email_login_tokens" ("token")
    `);

    await queryRunner.query(`
      ALTER TABLE "email_login_tokens"
      ADD CONSTRAINT "FK_6911817c3d00582efc32a7576b1"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email_login_tokens"
      DROP CONSTRAINT "FK_6911817c3d00582efc32a7576b1"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."IDX_be923a2d962510f8060a16ab10"
    `);

    await queryRunner.query(`DROP TABLE "email_login_tokens"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "wallets"`);
  }
}
