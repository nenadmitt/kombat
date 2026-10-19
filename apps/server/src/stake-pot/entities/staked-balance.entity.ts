import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { StakeAsset } from '@gaming-platform/core';

import { BaseEntity } from '../../db/entities/base.entity';

@Entity('staked_balances')
@Index('UQ_staked_balances_user_asset', ['userId', 'asset'], { unique: true })
// Backstop, not the guard: turns a logic bug into a failed transaction rather than phantom money.
@Check('CHK_staked_balances_non_negative', '"available" >= 0 AND "locked" >= 0')
export class StakedBalanceEntity extends BaseEntity {
  // Also holds the synthetic platform fee account, which is not a real user.
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'asset', type: 'smallint' })
  asset: StakeAsset;

  @Column({ name: 'available', type: 'numeric', precision: 78, scale: 0, default: 0 })
  available: string;

  @Column({ name: 'locked', type: 'numeric', precision: 78, scale: 0, default: 0 })
  locked: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
