import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { GameRoomStatus, GameType, StakeAsset } from '../types/game';

@Entity('game_rooms')
@Index('IDX_game_rooms_status_created', ['status', 'createdAt'])
@Index('IDX_game_rooms_lobby', ['gameType', 'stakeToken', 'createdAt'], {
  where: '"status" = 0 AND "is_private" = false',
})
@Index('IDX_game_rooms_user_status', ['userId', 'status'])
// The GIN index on opponent_ids has no decorator form; it lives in GameRoomParticipantIndexes.
@Index('IDX_game_rooms_opponent_status', ['opponentId', 'status'], {
  where: '"opponent_id" IS NOT NULL',
})
@Index('UQ_game_rooms_code', ['code'], {
  unique: true,
  where: '"code" IS NOT NULL',
})
export class GameRoomEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'game_type', type: 'smallint' })
  gameType: GameType;

  // Nullable only for legacy rooms; new rooms always get one.
  @Column({ name: 'code', type: 'varchar', nullable: true })
  code: string | null;

  @Column({ name: 'is_private', type: 'boolean', default: false })
  isPrivate: boolean;

  @Column({
    name: 'status',
    type: 'smallint',
    default: GameRoomStatus.Pending,
  })
  status: GameRoomStatus;

  @Column({ name: 'player_count', type: 'smallint' })
  playerCount: number;

  @Column({ name: 'opponent_id', type: 'uuid', nullable: true })
  opponentId: string | null;

  // Multi-seat (Ludo) joiners, creator excluded. NavalBattle uses opponentId.
  @Column({ name: 'opponent_ids', type: 'uuid', array: true, default: () => "'{}'" })
  opponentIds: string[];

  @Column({ name: 'eliminated_user_ids', type: 'uuid', array: true, default: () => "'{}'" })
  eliminatedUserIds: string[];

  @Column({ name: 'stake_token', type: 'smallint', nullable: true })
  stakeToken: StakeAsset | null;

  // numeric(78,0) covers uint256; TypeORM returns it as a string, which is how it crosses the API.
  @Column({ name: 'stake_amount', type: 'numeric', precision: 78, scale: 0, nullable: true })
  stakeAmount: string | null;

  // Null (the common case) means everyone staked stakeToken.
  @Column({ name: 'stake_token_choices', type: 'jsonb', nullable: true })
  stakeTokenChoices: Record<string, StakeAsset> | null;

  @Column({ name: 'winner_user_id', type: 'uuid', nullable: true })
  winnerUserId: string | null;

  @Column({ name: 'end_reason', type: 'varchar', nullable: true })
  endReason: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
