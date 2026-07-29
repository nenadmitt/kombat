import { Column, CreateDateColumn, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('users')
export class UserEntity extends BaseEntity {
  @Column({ name: 'email', type: 'varchar', unique: true, nullable: false })
  email: string;

  @Column({ name: 'username', type: 'varchar', unique: true, nullable: true })
  username: string | null;

  /** This user's own shareable code. Assigned when they pick a username. */
  @Column({ name: 'referral_code', type: 'varchar', length: 8, nullable: true })
  referralCode: string | null;

  /** Who referred them, recorded once at sign-up and never reassigned. */
  @Column({ name: 'referred_by_user_id', type: 'uuid', nullable: true })
  referredByUserId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
