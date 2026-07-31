import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The settlement idempotency guarantee.
 *
 * Match work already deduped on (room_id, kind), but only by counting rows
 * inside the settling transaction. Two concurrent settlements both read a count
 * of zero, both pass, and both credit a prize - the count cannot serialize them
 * because it takes no lock and the balance locks are acquired afterwards.
 *
 * This index is what makes the double-credit impossible rather than unlikely:
 * one Hold, one Capture and one Release per player per room, one Prize for the
 * winner, one Fee for the platform. The loser of the race hits a unique
 * violation and its whole transaction rolls back.
 *
 * Partial, so deposits and withdrawals (room_id null) are untouched - they keep
 * their own key, UQ_stake_ledger_deposit_tx.
 */
export class SettlementIdempotency1784500000000 implements MigrationInterface {
  name = 'SettlementIdempotency1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_stake_ledger_room_entry" ON "stake_ledger_entries" ("room_id", "user_id", "kind") WHERE "room_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."UQ_stake_ledger_room_entry"`);
  }
}
