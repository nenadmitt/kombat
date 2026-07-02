import { Column, CreateDateColumn, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
import { WalletNetwork, WalletOrigin } from '../types/wallet';

@Entity('wallets')
export class WalletEntity extends BaseEntity {
  // Plain column, no FK relation to users — intentionally not referencing
  // each other at the DB level.
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'address', type: 'varchar', unique: true, nullable: false })
  address: string;

  @Column({ name: 'key', type: 'varchar', unique: true, nullable: false })
  key: string;

  @Column({ name: 'type', type: 'smallint', default: WalletOrigin.Platform })
  type: WalletOrigin;

  @Column({ name: 'network', type: 'smallint', nullable: false })
  network: WalletNetwork;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
