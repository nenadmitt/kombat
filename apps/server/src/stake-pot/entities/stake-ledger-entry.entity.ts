import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { StakeAsset, StakeLedgerKind } from '@gaming-platform/core';

import { BaseEntity } from '../../db/entities/base.entity';

/**
 * Append-only journal of every movement in the pot. Rows are NEVER updated or
 * deleted; a correction is a new opposing entry. It doubles as the idempotency
 * record: deposits dedupe on (tx_hash, log_index) so a re-scanned block range
 * credits nothing twice, and match work dedupes on (room_id, kind) so a
 * retried funding or settlement cannot double-charge.
 */
@Entity('stake_ledger_entries')
// Index names are pinned to the migration's so `migration:generate` doesn't
// keep proposing to rename them to its own hashes.
@Index('IDX_stake_ledger_user_created', ['userId', 'createdAt'])
// Serves the "has this room already been held/captured/released?" checks.
@Index('IDX_stake_ledger_room_kind', ['roomId', 'kind'])
// The deposit idempotency key. Partial, so match entries (which all have a
// null tx_hash) don't collide with each other under the unique constraint.
@Index('UQ_stake_ledger_deposit_tx', ['txHash', 'logIndex'], {
  unique: true,
  where: '"tx_hash" IS NOT NULL',
})
export class StakeLedgerEntryEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'asset', type: 'smallint' })
  asset: StakeAsset;

  @Column({ name: 'kind', type: 'smallint' })
  kind: StakeLedgerKind;

  /**
   * Signed base units against `available`. Hold and Release move the same
   * magnitude the other way in `locked`; Capture burns a locked stake and
   * counts against `locked` only.
   */
  @Column({ name: 'amount', type: 'numeric', precision: 78, scale: 0 })
  amount: string;

  /** Set for match-related entries. */
  @Column({ name: 'room_id', type: 'uuid', nullable: true })
  roomId: string | null;

  /** Deposit provenance: the on-chain transaction that funded this credit. */
  @Column({ name: 'tx_hash', type: 'varchar', nullable: true })
  txHash: string | null;

  /** Log index within `tx_hash` - one tx can carry several Staked events. */
  @Column({ name: 'log_index', type: 'integer', nullable: true })
  logIndex: number | null;

  @Column({ name: 'withdrawal_id', type: 'uuid', nullable: true })
  withdrawalId: string | null;

  /** `available` after this entry was applied - makes an audit a single scan. */
  @Column({
    name: 'balance_after',
    type: 'numeric',
    precision: 78,
    scale: 0,
  })
  balanceAfter: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
