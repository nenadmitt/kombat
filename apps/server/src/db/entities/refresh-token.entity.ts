import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { UserEntity } from './user.entity';

/**
 * A long-lived, single-use refresh token. Exchanged for a fresh access/refresh
 * pair via POST /authentication/refresh; the old row is revoked in the same
 * transaction, so every refresh rotates.
 *
 * Only the SHA-256 of the token is stored. The plaintext exists exactly once,
 * in the response that minted it - a database leak therefore hands over no
 * usable session, the same reasoning that applies to a password.
 *
 * Rotation makes theft detectable: a revoked token being presented again means
 * two parties hold it (the legitimate client and a thief), so the whole user's
 * token set is revoked and both are forced to log in again. That is why rows
 * are revoked rather than deleted - a deleted row is indistinguishable from a
 * token that never existed.
 */
@Entity('refresh_tokens')
@Index('IDX_refresh_tokens_user_live', ['userId'], {
  where: '"revoked_at" IS NULL',
})
export class RefreshTokenEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: UserEntity;

  /** SHA-256 hex of the token handed to the client. Never the token itself. */
  @Index('UQ_refresh_tokens_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** Set when rotated, logged out, or revoked by a reuse detection. */
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
