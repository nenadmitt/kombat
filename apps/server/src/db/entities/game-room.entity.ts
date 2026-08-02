import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { GameRoomStatus, GameType, StakeAsset } from '../types/game';

@Entity('game_rooms')
// Serves the lobby listing: filter by status, already in createdAt order.
@Index('IDX_game_rooms_status_created', ['status', 'createdAt'])
// Partial index for the filterable lobby: only pending, public rooms, keyed on
// game_type + stake_token with created_at ordering. Mirrors AddLobbyRoomIndex.
@Index('IDX_game_rooms_lobby', ['gameType', 'stakeToken', 'createdAt'], {
  where: '"status" = 0 AND "is_private" = false',
})
// Serves the 1-open-room-per-user checks (create/close) keyed on userId + status.
@Index('IDX_game_rooms_user_status', ['userId', 'status'])
// The second seat, so "rooms I played in" can bitmap-OR all three seat columns
// instead of seq-scanning. The third seat's GIN index on opponent_ids has no
// decorator form - it lives in GameRoomParticipantIndexes only.
@Index('IDX_game_rooms_opponent_status', ['opponentId', 'status'], {
  where: '"opponent_id" IS NOT NULL',
})
// Serves join-by-code lookups; unique so a code resolves to one room.
@Index('UQ_game_rooms_code', ['code'], {
  unique: true,
  where: '"code" IS NOT NULL',
})
export class GameRoomEntity extends BaseEntity {
  // Plain column, no FK relation to users — same choice as WalletEntity.
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'game_type', type: 'smallint' })
  gameType: GameType;

  /** Short shareable invite code (uppercase, unambiguous alphabet). Nullable
   *  only so legacy rooms without one don't break; new rooms always get one. */
  @Column({ name: 'code', type: 'varchar', nullable: true })
  code: string | null;

  /** Private rooms are hidden from the lobby listing and joinable only by code. */
  @Column({ name: 'is_private', type: 'boolean', default: false })
  isPrivate: boolean;

  @Column({
    name: 'status',
    type: 'smallint',
    default: GameRoomStatus.Pending,
  })
  status: GameRoomStatus;

  // Derived from gameType at creation time (e.g. NavalBattle -> 2), stored
  // so listing rooms doesn't need to look up game-type metadata separately.
  @Column({ name: 'player_count', type: 'smallint' })
  playerCount: number;

  // Set once a second player joins — same "no FK" choice as userId above.
  // Naval Battle is exactly 2 players, so one nullable column is enough for now.
  @Column({ name: 'opponent_id', type: 'uuid', nullable: true })
  opponentId: string | null;

  /** Joiners of a multi-player room (Ludo), in join order, creator excluded.
   *  NavalBattle keeps using the single opponentId column above. */
  @Column({ name: 'opponent_ids', type: 'uuid', array: true, default: () => "'{}'" })
  opponentIds: string[];

  // ---- staking (null on all three = free game) ---------------------------

  /** Stake asset, or null for a free game. */
  @Column({ name: 'stake_token', type: 'smallint', nullable: true })
  stakeToken: StakeAsset | null;

  /** Per-player stake in base units. numeric(78,0) covers uint256; TypeORM
   *  returns numeric as string, which is exactly how it crosses the API. */
  @Column({ name: 'stake_amount', type: 'numeric', precision: 78, scale: 0, nullable: true })
  stakeAmount: string | null;

  // ---- result (set when the room completes) ------------------------------

  /** Winner, or null while running / when the match was voided. */
  @Column({ name: 'winner_user_id', type: 'uuid', nullable: true })
  winnerUserId: string | null;

  /** BattleshipEndReason string ('complete' | 'forfeit' | 'timeout' | 'setup-timeout'). */
  @Column({ name: 'end_reason', type: 'varchar', nullable: true })
  endReason: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
