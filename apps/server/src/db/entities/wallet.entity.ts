import { Column, CreateDateColumn, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
import { WalletNetwork, WalletOrigin } from '../types/wallet';

@Entity('wallets')
export class WalletEntity extends BaseEntity {
  // Plain column, no FK relation to users — intentionally not referencing
  // each other at the DB level.
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // The only thing the platform keeps. An on-chain Staked event names a
  // beneficiary address; this is what maps it back to a user so the stake pot
  // can be credited. The private key is deliberately NOT stored - it never
  // left the player's device after wallet creation, and the server has no
  // path that signs with it.
  @Column({ name: 'address', type: 'varchar', unique: true, nullable: false })
  address: string;

  @Column({ name: 'type', type: 'smallint', default: WalletOrigin.Platform })
  type: WalletOrigin;

  @Column({ name: 'network', type: 'smallint', nullable: false })
  network: WalletNetwork;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
