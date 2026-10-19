import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { StakeAsset, StakeWithdrawalStatus } from '@gaming-platform/core';

import { BaseEntity } from '../../db/entities/base.entity';

// The row id doubles as the contract's withdrawalId, which makes the payout exactly-once.
@Entity('stake_pot_withdrawals')
@Index('IDX_stake_pot_withdrawals_status_updated', ['status', 'updatedAt'])
@Index('IDX_stake_pot_withdrawals_user_created', ['userId', 'createdAt'])
export class StakePotWithdrawalEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'asset', type: 'smallint' })
  asset: StakeAsset;

  @Column({ name: 'amount', type: 'numeric', precision: 78, scale: 0 })
  amount: string;

  // Resolved server-side from the user's own wallet, so a stolen token can't redirect a payout.
  @Column({ name: 'to_address', type: 'varchar' })
  toAddress: string;

  @Column({ name: 'status', type: 'smallint' })
  status: StakeWithdrawalStatus;

  @Column({ name: 'tx_hash', type: 'varchar', nullable: true })
  txHash: string | null;

  @Column({ name: 'attempts', type: 'smallint', default: 0 })
  attempts: number;

  @Column({ name: 'error', type: 'varchar', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
