import { Column, CreateDateColumn, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
import { WalletNetwork, WalletOrigin } from '../types/wallet';

@Entity('wallets')
export class WalletEntity extends BaseEntity {
  // Plain column, no FK relation to users — intentionally not referencing
  // each other at the DB level.
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  // An on-chain Staked event names a beneficiary address; this is what maps
  // it back to a user so the stake pot can be credited. For Platform and
  // Imported wallets it is the only thing kept - their keys are not ours.
  @Column({ name: 'address', type: 'varchar', unique: true, nullable: false })
  address: string;

  @Column({ name: 'type', type: 'smallint', default: WalletOrigin.Platform })
  type: WalletOrigin;

  /**
   * Custodial key material for Embedded wallets, `v1:<base64>` AES-256-GCM
   * (see key-cipher.util). Null for every other origin: a Platform wallet's
   * key never left the device and an Imported one was never ours.
   */
  @Column({
    name: 'encrypted_private_key',
    type: 'text',
    nullable: true,
    select: false,
  })
  encryptedPrivateKey?: string | null;

  @Column({ name: 'network', type: 'smallint', nullable: false })
  network: WalletNetwork;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
