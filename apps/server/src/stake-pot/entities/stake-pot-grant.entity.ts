import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { StakeAsset } from '@gaming-platform/core';

import { BaseEntity } from '../../db/entities/base.entity';

/**
 * One signup grant per player. The unique `user_id` carries the guarantee: the
 * row is claimed before the transaction is sent, so a retried signup cannot
 * hand out a second grant.
 *
 * A null `tx_hash` means the claim succeeded but the send did not. Not retried:
 * a deposit has no on-chain idempotency key, so re-sending risks paying twice
 * and a missing grant is the cheaper failure.
 */
@Entity('stake_pot_grants')
@Index('UQ_stake_pot_grants_user', ['userId'], { unique: true })
export class StakePotGrantEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'asset', type: 'smallint' })
  asset: StakeAsset;

  @Column({ name: 'amount', type: 'numeric', precision: 78, scale: 0 })
  amount: string;

  /** The `stake` transaction that paid the grant into the player's pot. */
  @Column({ name: 'tx_hash', type: 'varchar', nullable: true })
  txHash: string | null;

  @Column({ name: 'error', type: 'varchar', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
