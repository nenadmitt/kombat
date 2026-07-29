import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * How far the DepositWatcher has scanned for `Staked` events. Single row, so a
 * plain integer PK rather than the shared uuid BaseEntity.
 *
 * A stale cursor is safe (credits are idempotent); one ahead of reality would
 * silently drop deposits, so it only advances after a range is fully processed.
 */
@Entity('stake_pot_cursor')
export class StakePotCursorEntity {
  @PrimaryColumn({ name: 'id', type: 'smallint' })
  id: number;

  /** Last block whose logs have been credited. bigint → string in TypeORM. */
  @Column({ name: 'last_scanned_block', type: 'bigint' })
  lastScannedBlock: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
