import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateGameRooms1783115015392 implements MigrationInterface {
  name = "CreateGameRooms1783115015392";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "game_rooms" ("id" uuid NOT NULL DEFAULT uuidv7(), "user_id" uuid NOT NULL, "game_type" smallint NOT NULL, "status" smallint NOT NULL DEFAULT '0', "player_count" smallint NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_026d3197a67b9676bc09a996d98" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "game_rooms"`);
  }
}
