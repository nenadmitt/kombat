import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import { EmailLoginTokenEntity } from './entities/email-login-token.entity';
import { GameRoomEntity } from './entities/game-room.entity';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { GameRoomStatus, GameType } from './types/game';
import { WalletNetwork, WalletOrigin } from './types/wallet';

/**
 * Sole point of contact with TypeORM repositories/DataSource. Other modules
 * call through here instead of injecting `Repository<T>` directly, so the
 * schema and ORM stay implementation details of the db module.
 */
@Injectable()
export class DbService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(EmailLoginTokenEntity)
    private readonly emailLoginTokenRepository: Repository<EmailLoginTokenEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    @InjectRepository(GameRoomEntity)
    private readonly gameRoomRepository: Repository<GameRoomEntity>,
  ) {}

  // --- users ---

  findUserById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ id });
  }

  findUserByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ email });
  }

  findUserByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ username });
  }

  createUser(email: string): Promise<UserEntity> {
    return this.userRepository.save(
      this.userRepository.create({ email, username: null }),
    );
  }

  saveUser(user: UserEntity): Promise<UserEntity> {
    return this.userRepository.save(user);
  }

  // --- email login tokens ---

  async deleteLoginTokensForUser(userId: string): Promise<void> {
    await this.emailLoginTokenRepository.delete({ userId });
  }

  createLoginToken(data: {
    userId: string;
    token: string;
    expiresAt: Date;
  }): Promise<EmailLoginTokenEntity> {
    return this.emailLoginTokenRepository.save(
      this.emailLoginTokenRepository.create(data),
    );
  }

  findLoginToken(
    userId: string,
    token: string,
  ): Promise<EmailLoginTokenEntity | null> {
    return this.emailLoginTokenRepository.findOneBy({ userId, token });
  }

  async deleteLoginToken(id: string): Promise<void> {
    await this.emailLoginTokenRepository.delete({ id });
  }

  // --- wallets ---

  countWalletsForUser(userId: string): Promise<number> {
    return this.walletRepository.countBy({ userId });
  }

  createWallet(data: {
    userId: string;
    address: string;
    key: string;
    type: WalletOrigin;
    network: WalletNetwork;
  }): Promise<WalletEntity> {
    return this.walletRepository.save(this.walletRepository.create(data));
  }

  findWalletsForUser(
    userId: string,
  ): Promise<Pick<WalletEntity, 'address' | 'network'>[]> {
    return this.walletRepository.find({
      where: { userId },
      select: ['address', 'network'],
    });
  }

  // --- game rooms ---

  /** A room in Pending or InProgress status — i.e. still "active" for the 1-room-per-user rule. */
  findOpenGameRoomForUser(userId: string): Promise<GameRoomEntity | null> {
    return this.gameRoomRepository.findOneBy({
      userId,
      status: In([GameRoomStatus.Pending, GameRoomStatus.InProgress]),
    });
  }

  createGameRoom(data: {
    userId: string;
    gameType: GameType;
    status: GameRoomStatus;
    playerCount: number;
  }): Promise<GameRoomEntity> {
    return this.gameRoomRepository.save(this.gameRoomRepository.create(data));
  }

  findGameRoomForUser(
    id: string,
    userId: string,
  ): Promise<GameRoomEntity | null> {
    return this.gameRoomRepository.findOneBy({ id, userId });
  }

  /** Generic lookup, regardless of owner — joining checks a room someone else created. */
  findGameRoomById(id: string): Promise<GameRoomEntity | null> {
    return this.gameRoomRepository.findOneBy({ id });
  }

  async joinGameRoom(id: string, opponentId: string): Promise<void> {
    await this.gameRoomRepository.update(
      { id },
      { opponentId, status: GameRoomStatus.InProgress },
    );
  }

  /** Flip a room to Completed once its match has a winner. */
  async completeGameRoom(id: string): Promise<void> {
    await this.gameRoomRepository.update(
      { id },
      { status: GameRoomStatus.Completed },
    );
  }

  async deleteGameRoom(id: string): Promise<void> {
    await this.gameRoomRepository.delete({ id });
  }

  findPendingGameRooms(excludeUserId?: string): Promise<GameRoomEntity[]> {
    return this.gameRoomRepository.find({
      where: {
        status: GameRoomStatus.Pending,
        ...(excludeUserId ? { userId: Not(excludeUserId) } : {}),
      },
      order: { createdAt: 'ASC' },
    });
  }

  // --- admin / test ---

  /** Wipes every entity-backed table (schema untouched). Used by TestService. */
  async truncateAllTables(): Promise<string[]> {
    const tableNames = this.dataSource.entityMetadatas.map(
      (meta) => meta.tableName,
    );
    const quoted = tableNames.map((name) => `"${name}"`).join(', ');
    await this.dataSource.query(
      `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
    );
    return tableNames;
  }
}
