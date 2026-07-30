import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { StakeAsset, StakeWithdrawalStatus } from '@gaming-platform/core';

import { BaseEntity } from '../../db/entities/base.entity';

/**
 * A requested payout, and the queue the WithdrawalSweeper drains (Pending and
 * Sent rows are "to do").
 *
 * The row's `id` doubles as the contract's `withdrawalId`, which is what makes
 * the payout exactly-once: the sweeper asks the contract "did this id already
 * pay?" instead of guessing whether its own tx landed. `available` is debited
 * when the row is created; a terminal failure credits it back.
 */
@Entity('stake_pot_withdrawals')
// Serves the sweeper's "pending work" scan.
@Index('IDX_stake_pot_withdrawals_status_updated', ['status', 'updatedAt'])
@Index('IDX_stake_pot_withdrawals_user_created', ['userId', 'createdAt'])
export class StakePotWithdrawalEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'asset', type: 'smallint' })
  asset: StakeAsset;

  @Column({ name: 'amount', type: 'numeric', precision: 78, scale: 0 })
  amount: string;

  /** Always resolved server-side from the user's own wallet, never taken from
   *  the request, so a stolen token cannot redirect a payout. */
  @Column({ name: 'to_address', type: 'varchar' })
  toAddress: string;

  @Column({ name: 'status', type: 'smallint' })
  status: StakeWithdrawalStatus;

  @Column({ name: 'tx_hash', type: 'varchar', nullable: true })
  txHash: string | null;

  @Column({ name: 'attempts', type: 'smallint', default: 0 })
  attempts: number;

  /** Last error, kept for debugging; cleared on success. */
  @Column({ name: 'error', type: 'varchar', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
