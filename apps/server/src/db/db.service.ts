import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import {
  CacheKeys,
  CacheService,
  GAME_ROOM_TTL_SECONDS,
} from '../cache';
import { EmailLoginTokenEntity } from './entities/email-login-token.entity';
import { GameRoomEntity } from './entities/game-room.entity';
import { StakeEscrowEntity } from './entities/stake-escrow.entity';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { EscrowStatus, GameRoomStatus, GameType, StakeAsset } from './types/game';
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
    @InjectRepository(StakeEscrowEntity)
    private readonly stakeEscrowRepository: Repository<StakeEscrowEntity>,
    private readonly cacheService: CacheService,
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

  /**
   * Full entity including the encrypted key — used ONLY by the chain module
   * to sign stakes as the player. Kept as a separate accessor so the common
   * listing path can never leak key material.
   */
  findWalletWithKeyForUser(userId: string): Promise<WalletEntity | null> {
    return this.walletRepository.findOneBy({ userId });
  }

  // --- game rooms ---

  /** A room in Pending or InProgress status — i.e. still "active" for the 1-room-per-user rule. */
  findOpenGameRoomForUser(userId: string): Promise<GameRoomEntity | null> {
    return this.gameRoomRepository.findOneBy({
      userId,
      status: In([GameRoomStatus.Pending, GameRoomStatus.InProgress]),
    });
  }

  /**
   * An active room the user takes part in as *either* creator or opponent — so
   * the client can resume a match the user joined, not only one they created.
   */
  findActiveGameRoomForParticipant(
    userId: string,
  ): Promise<GameRoomEntity | null> {
    const status = In([GameRoomStatus.Pending, GameRoomStatus.InProgress]);
    return this.gameRoomRepository.findOneBy([
      { userId, status },
      { opponentId: userId, status },
    ]);
  }

  createGameRoom(data: {
    userId: string;
    gameType: GameType;
    status: GameRoomStatus;
    playerCount: number;
    stakeToken?: StakeAsset | null;
    stakeAmount?: string | null;
  }): Promise<GameRoomEntity> {
    return this.gameRoomRepository.save(
      this.gameRoomRepository.create({
        stakeToken: null,
        stakeAmount: null,
        ...data,
      }),
    );
  }

  findGameRoomForUser(
    id: string,
    userId: string,
  ): Promise<GameRoomEntity | null> {
    return this.gameRoomRepository.findOneBy({ id, userId });
  }

  /**
   * Generic lookup, regardless of owner — joining checks a room someone else
   * created. Cached (short TTL): the battleship gateway calls this on every
   * enter/ready/fire/forfeit, so without the cache each move costs a SELECT.
   * Write paths below invalidate; the TTL bounds staleness if one is missed.
   */
  async findGameRoomById(id: string): Promise<GameRoomEntity | null> {
    const key = CacheKeys.gameRoom(id);
    const cached = await this.cacheService.getJson<GameRoomEntity>(key);
    if (cached) {
      return this.reviveGameRoom(cached);
    }
    const room = await this.gameRoomRepository.findOneBy({ id });
    if (room) {
      await this.cacheService.setJson(key, room, GAME_ROOM_TTL_SECONDS);
    }
    return room;
  }

  async joinGameRoom(id: string, opponentId: string): Promise<void> {
    await this.gameRoomRepository.update(
      { id },
      { opponentId, status: GameRoomStatus.InProgress },
    );
    await this.cacheService.del(CacheKeys.gameRoom(id));
  }

  /** Flip a room to Completed and persist its result (History reads these). */
  async completeGameRoom(
    id: string,
    result?: { winnerUserId: string | null; endReason: string | null },
  ): Promise<void> {
    await this.gameRoomRepository.update(
      { id },
      {
        status: GameRoomStatus.Completed,
        completedAt: new Date(),
        ...(result
          ? { winnerUserId: result.winnerUserId, endReason: result.endReason }
          : {}),
      },
    );
    await this.cacheService.del(CacheKeys.gameRoom(id));
  }

  /** Completed rooms the user played in, newest first — the History feed. */
  findCompletedGameRoomsForUser(
    userId: string,
    limit = 50,
  ): Promise<GameRoomEntity[]> {
    return this.gameRoomRepository.find({
      where: [
        { userId, status: GameRoomStatus.Completed },
        { opponentId: userId, status: GameRoomStatus.Completed },
      ],
      order: { completedAt: 'DESC' },
      take: limit,
    });
  }

  async deleteGameRoom(id: string): Promise<void> {
    await this.gameRoomRepository.delete({ id });
    await this.cacheService.del(CacheKeys.gameRoom(id));
  }

  /** JSON round-trip turns entities into plain objects with string dates — rebuild both. */
  private reviveGameRoom(json: GameRoomEntity): GameRoomEntity {
    const room = this.gameRoomRepository.create(json);
    room.createdAt = new Date(json.createdAt);
    return room;
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

  // --- stake escrows ---

  createStakeEscrow(data: {
    roomId: string;
    matchId: string;
    status: EscrowStatus;
  }): Promise<StakeEscrowEntity> {
    return this.stakeEscrowRepository.save(
      this.stakeEscrowRepository.create(data),
    );
  }

  findStakeEscrowByRoomId(roomId: string): Promise<StakeEscrowEntity | null> {
    return this.stakeEscrowRepository.findOneBy({ roomId });
  }

  async updateStakeEscrow(
    roomId: string,
    patch: Partial<
      Pick<
        StakeEscrowEntity,
        | 'status'
        | 'fundTxHashes'
        | 'settleTx'
        | 'voidTx'
        | 'payout'
        | 'fee'
        | 'attempts'
        | 'error'
      >
    >,
  ): Promise<void> {
    await this.stakeEscrowRepository.update({ roomId }, patch);
  }

  /** Sweeper scan: escrows awaiting on-chain work, oldest-touched first. */
  findStakeEscrowsByStatus(
    statuses: EscrowStatus[],
    limit = 20,
  ): Promise<StakeEscrowEntity[]> {
    return this.stakeEscrowRepository.find({
      where: { status: In(statuses) },
      order: { updatedAt: 'ASC' },
      take: limit,
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
