import { Column, CreateDateColumn, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
import { WalletNetwork, WalletOrigin } from '../types/wallet';

@Entity('wallets')
export class WalletEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'address', type: 'varchar', unique: true, nullable: false })
  address: string;

  @Column({ name: 'type', type: 'smallint', default: WalletOrigin.Platform })
  type: WalletOrigin;

  // `v1:<base64>` AES-256-GCM (see key-cipher.util). Null unless origin is Embedded.
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
