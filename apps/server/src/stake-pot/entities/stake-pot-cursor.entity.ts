import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

// Advances only after a range is fully processed: a stale cursor is safe, one ahead drops deposits.
@Entity('stake_pot_cursor')
export class StakePotCursorEntity {
  @PrimaryColumn({ name: 'id', type: 'smallint' })
  id: number;

  @Column({ name: 'last_scanned_block', type: 'bigint' })
  lastScannedBlock: string;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
