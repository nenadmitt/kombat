import { UserPlatform } from '@gaming-platform/core';
import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('users')
@Index('UQ_users_referral_code', ['referralCode'], {
  unique: true,
  where: '"referral_code" IS NOT NULL',
})
@Index('UQ_users_ens_name', ['ensName'], {
  unique: true,
  where: '"ens_name" IS NOT NULL',
})
export class UserEntity extends BaseEntity {
  @Column({ name: 'email', type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ name: 'username', type: 'varchar', unique: true, nullable: true })
  username: string | null;

  @Column({ name: 'referral_code', type: 'varchar', length: 8, nullable: true })
  referralCode: string | null;

  // Minted once from the first username; never renamed.
  @Column({ name: 'ens_name', type: 'varchar', nullable: true })
  ensName: string | null;

  // An account may only sign in from the app it was created in.
  @Column({ name: 'platform', type: 'smallint', default: UserPlatform.Mobile })
  platform: UserPlatform;

  @Column({ name: 'is_bot', type: 'boolean', default: false })
  isBot: boolean;

  @Column({ name: 'referred_by_user_id', type: 'uuid', nullable: true })
  referredByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
