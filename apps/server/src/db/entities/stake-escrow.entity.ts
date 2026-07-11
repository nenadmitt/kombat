import { Column, CreateDateColumn, Entity, Index, UpdateDateColumn } from 'typeorm';
import { BaseEntity } from './base.entity';
import { EscrowStatus } from '../types/game';

/**
 * On-chain escrow lifecycle for a staked room: the audit trail (tx hashes,
 * payouts, errors) and the work queue the stake sweepers drain (Funding /
 * SettlePending / VoidPending rows are "to do"). Free rooms have no row.
 */
@Entity('stake_escrows')
// Serves the sweepers' "pending work" scans.
@Index(['status', 'updatedAt'])
export class StakeEscrowEntity extends BaseEntity {
  // Plain column, no FK — same choice as GameRoomEntity.userId.
  @Column({ name: 'room_id', type: 'uuid', unique: true })
  roomId: string;

  /** bytes32 match id on the escrow contract: keccak256(utf8(roomId)). */
  @Column({ name: 'match_id', type: 'varchar' })
  matchId: string;

  @Column({ name: 'status', type: 'smallint' })
  status: EscrowStatus;

  /** Funding tx hashes (1 for permit path, 3 for the native-ETH path). */
  @Column({ name: 'fund_tx_hashes', type: 'jsonb', default: () => `'[]'` })
  fundTxHashes: string[];

  @Column({ name: 'settle_tx', type: 'varchar', nullable: true })
  settleTx: string | null;

  @Column({ name: 'void_tx', type: 'varchar', nullable: true })
  voidTx: string | null;

  /** Winner payout in base units (pot − fee), recorded at settlement. */
  @Column({ name: 'payout', type: 'numeric', precision: 78, scale: 0, nullable: true })
  payout: string | null;

  /** Fee slice in base units, recorded at settlement. */
  @Column({ name: 'fee', type: 'numeric', precision: 78, scale: 0, nullable: true })
  fee: string | null;

  /** Attempts made on the current pending action (funding / settle / void). */
  @Column({ name: 'attempts', type: 'smallint', default: 0 })
  attempts: number;

  /** Last error message, kept for debugging; cleared on success. */
  @Column({ name: 'error', type: 'varchar', nullable: true })
  error: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
