import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { SettlementStatus } from '../types/game';

@Entity('match_settlements')
@Index('IDX_match_settlements_status_updated', ['status', 'updatedAt'])
export class MatchSettlementEntity extends BaseEntity {
  @Column({ name: 'room_id', type: 'uuid', unique: true })
  roomId: string;

  @Column({ name: 'status', type: 'smallint' })
  status: SettlementStatus;

  @Column({ name: 'payout', type: 'numeric', precision: 78, scale: 0, nullable: true })
  payout: string | null;

  @Column({ name: 'fee', type: 'numeric', precision: 78, scale: 0, nullable: true })
  fee: string | null;

  // Set instead of payout/fee when the match was staked in more than one asset.
  @Column({ name: 'payout_by_asset', type: 'jsonb', nullable: true })
  payoutByAsset: Record<string, string> | null;

  @Column({ name: 'fee_by_asset', type: 'jsonb', nullable: true })
  feeByAsset: Record<string, string> | null;

  @Column({ name: 'attempts', type: 'smallint', default: 0 })
  attempts: number;

  @Column({ name: 'error', type: 'varchar', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
