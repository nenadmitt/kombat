import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { StakeAsset, StakeLedgerKind } from '@gaming-platform/core';

import { BaseEntity } from '../../db/entities/base.entity';

// Append-only: rows are never updated or deleted; a correction is a new opposing entry.
@Entity('stake_ledger_entries')
// Names pinned to the migration's so migration:generate doesn't propose renames.
@Index('IDX_stake_ledger_user_created', ['userId', 'createdAt'])
@Index('IDX_stake_ledger_room_kind', ['roomId', 'kind'])
// Partial, so match entries (null tx_hash) don't collide under the unique constraint.
@Index('UQ_stake_ledger_deposit_tx', ['txHash', 'logIndex'], {
  unique: true,
  where: '"tx_hash" IS NOT NULL',
})
// Per asset: a cross-stable room pays a prize in each token it was staked in.
@Index('UQ_stake_ledger_room_entry', ['roomId', 'userId', 'kind', 'asset'], {
  unique: true,
  where: '"room_id" IS NOT NULL',
})
export class StakeLedgerEntryEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'asset', type: 'smallint' })
  asset: StakeAsset;

  @Column({ name: 'kind', type: 'smallint' })
  kind: StakeLedgerKind;

  // Signed against `available`; Hold/Release move the same magnitude in `locked`, Capture counts against `locked` only.
  @Column({ name: 'amount', type: 'numeric', precision: 78, scale: 0 })
  amount: string;

  @Column({ name: 'room_id', type: 'uuid', nullable: true })
  roomId: string | null;

  @Column({ name: 'tx_hash', type: 'varchar', nullable: true })
  txHash: string | null;

  // One tx can carry several Staked events.
  @Column({ name: 'log_index', type: 'integer', nullable: true })
  logIndex: number | null;

  @Column({ name: 'withdrawal_id', type: 'uuid', nullable: true })
  withdrawalId: string | null;

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
