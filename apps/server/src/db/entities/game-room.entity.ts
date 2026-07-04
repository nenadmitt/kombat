import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import { GameRoomStatus, GameType } from '../types/game';

@Entity('game_rooms')
// Serves the lobby listing: filter by status, already in createdAt order.
@Index(['status', 'createdAt'])
// Serves the 1-open-room-per-user checks (create/close) keyed on userId + status.
@Index(['userId', 'status'])
export class GameRoomEntity extends BaseEntity {
  // Plain column, no FK relation to users — same choice as WalletEntity.
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'game_type', type: 'smallint' })
  gameType: GameType;

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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
