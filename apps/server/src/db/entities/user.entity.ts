import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('users')
// Partial: a code is only assigned once a user picks a username.
@Index('UQ_users_referral_code', ['referralCode'], {
  unique: true,
  where: '"referral_code" IS NOT NULL',
})
@Index('UQ_users_ens_name', ['ensName'], {
  unique: true,
  where: '"ens_name" IS NOT NULL',
})
export class UserEntity extends BaseEntity {
  /** Null for wallet-only (SIWE) accounts, which never see an email OTP. */
  @Column({ name: 'email', type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ name: 'username', type: 'varchar', unique: true, nullable: true })
  username: string | null;

  /** This user's own shareable code. Assigned when they pick a username. */
  @Column({ name: 'referral_code', type: 'varchar', length: 8, nullable: true })
  referralCode: string | null;

  /** Minted once from the first username; never renamed after that. */
  @Column({ name: 'ens_name', type: 'varchar', nullable: true })
  ensName: string | null;

  /** Who referred them, recorded once at sign-up and never reassigned. */
  @Column({ name: 'referred_by_user_id', type: 'uuid', nullable: true })
  referredByUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
