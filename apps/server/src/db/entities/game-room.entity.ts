import { Column, CreateDateColumn, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';
import { GameRoomStatus, GameType } from '../types/game';

@Entity('game_rooms')
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
