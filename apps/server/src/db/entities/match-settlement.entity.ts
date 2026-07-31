import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { SettlementStatus } from '../types/game';

/**
 * Per-room settlement state for a staked match. Free rooms have no row.
 *
 * `status` is the CAS target that makes a room settle exactly once, so this
 * row is what decides who settles, not just a record of it.
 */
@Entity('match_settlements')
// Serves the sweeper's "pending work" scans.
@Index('IDX_match_settlements_status_updated', ['status', 'updatedAt'])
export class MatchSettlementEntity extends BaseEntity {
  // Plain column, no FK — same choice as GameRoomEntity.userId.
  @Column({ name: 'room_id', type: 'uuid', unique: true })
  roomId: string;

  @Column({ name: 'status', type: 'smallint' })
  status: SettlementStatus;

  /** Winner payout in base units (pot − fee), recorded at settlement. */
  @Column({ name: 'payout', type: 'numeric', precision: 78, scale: 0, nullable: true })
  payout: string | null;

  /** Fee slice in base units, recorded at settlement. */
  @Column({ name: 'fee', type: 'numeric', precision: 78, scale: 0, nullable: true })
  fee: string | null;

  @Column({ name: 'attempts', type: 'smallint', default: 0 })
  attempts: number;

  /** Last error message, kept for debugging; cleared on success. */
  @Column({ name: 'error', type: 'varchar', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
