import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { LobbyStakeFilter } from '@gaming-platform/core';

import {
  CacheKeys,
  CacheService,
  GAME_ROOM_TTL_SECONDS,
} from '../cache';
import { AppSettingEntity } from './entities/app-setting.entity';
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
    @InjectRepository(AppSettingEntity)
    private readonly appSettingRepository: Repository<AppSettingEntity>,
    private readonly cacheService: CacheService,
  ) {}

  // --- app settings ---

  /** A settings row's JSON value, or null when the key was never written. */
  async getAppSetting<T>(key: string): Promise<T | null> {
    const row = await this.appSettingRepository.findOne({ where: { key } });
    return row ? (row.value as T) : null;
  }

  async upsertAppSetting(key: string, value: object): Promise<void> {
    await this.appSettingRepository.upsert({ key, value }, ['key']);
  }

  // --- users ---

  /** Liveness probe for /healthcheck: one round-trip to Postgres. */
  async pingDatabase(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }

  /** Every user, newest first. Admin surface only (no pagination yet). */
  findAllUsers(): Promise<UserEntity[]> {
    return this.userRepository.find({ order: { createdAt: 'DESC' } });
  }

  findUserById(id: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ id });
  }

  findUsersByIds(ids: string[]): Promise<UserEntity[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }
    return this.userRepository.findBy({ id: In(ids) });
  }

  findUserByEmail(email: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ email });
  }

  findUserByUsername(username: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ username });
  }

  findUserByReferralCode(referralCode: string): Promise<UserEntity | null> {
    return this.userRepository.findOneBy({ referralCode });
  }

  countReferralsFor(userId: string): Promise<number> {
    return this.userRepository.countBy({ referredByUserId: userId });
  }

  /**
   * Lifetime record over completed rooms. Counting in SQL keeps this correct
   * for players with thousands of matches, where paging the history feed
   * would only ever see the first page.
   */
  async findMatchTotalsForUser(
    userId: string,
  ): Promise<{ games: number; wins: number; voids: number }> {
    const row = await this.gameRoomRepository
      .createQueryBuilder('room')
      .select('COUNT(*)', 'games')
      .addSelect(
        'COUNT(*) FILTER (WHERE room.winner_user_id = :userId)',
        'wins',
      )
      .addSelect('COUNT(*) FILTER (WHERE room.winner_user_id IS NULL)', 'voids')
      .where('room.status = :status', { status: GameRoomStatus.Completed })
      .andWhere(
        '(room.user_id = :userId OR room.opponent_id = :userId OR :userId = ANY(room.opponent_ids))',
        { userId },
      )
      .getRawOne<{ games: string; wins: string; voids: string }>();
    return {
      games: Number(row?.games ?? 0),
      wins: Number(row?.wins ?? 0),
      voids: Number(row?.voids ?? 0),
    };
  }

  /**
   * Net staked outcome per asset: what a win actually paid out (from the
   * settled escrow) minus every stake this player put up. Void rooms are
   * excluded - the stake is returned, so they net zero.
   */
  async findStakeNetByTokenForUser(
    userId: string,
  ): Promise<{ stakeToken: number; net: string }[]> {
    const rows = await this.gameRoomRepository
      .createQueryBuilder('room')
      .leftJoin('stake_escrows', 'escrow', 'escrow.room_id = room.id')
      .select('room.stake_token', 'stakeToken')
      .addSelect(
        `SUM(
           CASE WHEN room.winner_user_id = :userId
                THEN COALESCE(escrow.payout, room.stake_amount)::numeric - room.stake_amount::numeric
                ELSE -room.stake_amount::numeric
           END
         )`,
        'net',
      )
      .where('room.status = :status', { status: GameRoomStatus.Completed })
      .andWhere('room.stake_token IS NOT NULL')
      .andWhere('room.winner_user_id IS NOT NULL')
      .andWhere(
        '(room.user_id = :userId OR room.opponent_id = :userId OR :userId = ANY(room.opponent_ids))',
        { userId },
      )
      .groupBy('room.stake_token')
      .getRawMany<{ stakeToken: number; net: string }>();
    return rows.map(r => ({
      stakeToken: Number(r.stakeToken),
      // numeric comes back as a string; strip any fractional tail so it
      // stays a valid base-unit integer for BigInt on the client.
      net: String(r.net ?? '0').split('.')[0]!,
    }));
  }

  createUser(email: string): Promise<UserEntity> {
    return this.userRepository.save(
      this.userRepository.create({ email, username: null }),
    );
  }

  saveUser(user: UserEntity): Promise<UserEntity> {
    return this.userRepository.save(user);
  }

  /**
   * Hard-deletes a user row. The only DB foreign key to users is
   * email_login_tokens (ON DELETE CASCADE), so those go automatically;
   * wallets and game_rooms are plain uuid columns with no FK, so callers
   * that want them gone must delete those first (see AdminService). Returns
   * true when a row was actually removed.
   */
  async deleteUser(id: string): Promise<boolean> {
    const result = await this.userRepository.delete({ id });
    return (result.affected ?? 0) > 0;
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

  /** Removes every wallet row for a user (custodial keys included). Returns
   *  how many were deleted. Wallets have no FK to users, so this is manual. */
  async deleteWalletsForUser(userId: string): Promise<number> {
    const result = await this.walletRepository.delete({ userId });
    return result.affected ?? 0;
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
    return this.gameRoomRepository
      .createQueryBuilder('room')
      .where('room.status IN (:...statuses)', {
        statuses: [GameRoomStatus.Pending, GameRoomStatus.InProgress],
      })
      .andWhere(
        '(room.user_id = :userId OR room.opponent_id = :userId OR :userId = ANY(room.opponent_ids))',
        { userId },
      )
      .getOne();
  }

  createGameRoom(data: {
    userId: string;
    gameType: GameType;
    status: GameRoomStatus;
    playerCount: number;
    stakeToken?: StakeAsset | null;
    stakeAmount?: string | null;
    code?: string | null;
    isPrivate?: boolean;
  }): Promise<GameRoomEntity> {
    return this.gameRoomRepository.save(
      this.gameRoomRepository.create({
        stakeToken: null,
        stakeAmount: null,
        code: null,
        isPrivate: false,
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

  /** Any room with this code (used to guarantee code uniqueness at creation). */
  findGameRoomByCode(code: string): Promise<GameRoomEntity | null> {
    return this.gameRoomRepository.findOneBy({ code });
  }

  /** A still-joinable room for this code - the join-by-code lookup. */
  findPendingGameRoomByCode(code: string): Promise<GameRoomEntity | null> {
    return this.gameRoomRepository.findOneBy({
      code,
      status: GameRoomStatus.Pending,
    });
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
    return this.loadAndCacheGameRoom(id);
  }

  /**
   * Read straight from Postgres and refresh the cache entry.
   *
   * Callers that decide whether a match may start must use this rather than
   * the cached read. With the in-memory store (no REDIS_URL) an invalidation
   * only clears the instance that performed the write, so a second instance
   * can keep serving a Pending copy of a room that has already started - for
   * up to GAME_ROOM_TTL_SECONDS. That makes the match look unstartable and
   * strands every player in the room on a loading spinner.
   */
  async findGameRoomByIdFresh(id: string): Promise<GameRoomEntity | null> {
    return this.loadAndCacheGameRoom(id);
  }

  private async loadAndCacheGameRoom(
    id: string,
  ): Promise<GameRoomEntity | null> {
    const room = await this.gameRoomRepository.findOneBy({ id });
    if (room) {
      await this.cacheService.setJson(
        CacheKeys.gameRoom(id),
        room,
        GAME_ROOM_TTL_SECONDS,
      );
    }
    return room;
  }

  /**
   * Seat the opponent in a 2-player room and start it, in one conditional
   * UPDATE. The WHERE guards status + an empty seat so two joiners racing
   * the same Pending room can't both win: the second UPDATE affects 0 rows.
   * Returns whether this call took the seat.
   */
  async joinGameRoom(id: string, opponentId: string): Promise<boolean> {
    const result = await this.gameRoomRepository.update(
      { id, status: GameRoomStatus.Pending, opponentId: IsNull() },
      { opponentId, status: GameRoomStatus.InProgress },
    );
    await this.cacheService.del(CacheKeys.gameRoom(id));
    return (result.affected ?? 0) > 0;
  }

  /**
   * Append a joiner to a multi-player room. The single UPDATE enforces
   * capacity, no-duplicate and not-the-creator atomically, so two racing
   * joins can't oversubscribe the room. Returns whether the join landed.
   */
  async appendGameRoomOpponent(id: string, userId: string): Promise<boolean> {
    const result = await this.gameRoomRepository.query(
      `UPDATE "game_rooms"
         SET "opponent_ids" = array_append("opponent_ids", $2)
       WHERE "id" = $1
         AND "status" = $3
         AND "user_id" != $2
         AND NOT ($2 = ANY("opponent_ids"))
         AND cardinality("opponent_ids") < "player_count" - 1
       RETURNING "id"`,
      [id, userId, GameRoomStatus.Pending],
    );
    await this.cacheService.del(CacheKeys.gameRoom(id));
    return (result as unknown[]).length > 0;
  }

  /** Remove a joiner from a still-Pending multi-player room. */
  async removeGameRoomOpponent(id: string, userId: string): Promise<boolean> {
    const result = await this.gameRoomRepository.query(
      `UPDATE "game_rooms"
         SET "opponent_ids" = array_remove("opponent_ids", $2)
       WHERE "id" = $1 AND "status" = $3 AND $2 = ANY("opponent_ids")
       RETURNING "id"`,
      [id, userId, GameRoomStatus.Pending],
    );
    await this.cacheService.del(CacheKeys.gameRoom(id));
    return (result as unknown[]).length > 0;
  }

  /** Flip a Pending room to InProgress (multi-player start). Returns whether
   *  this call performed the flip (false = already started/gone). */
  async startGameRoom(id: string): Promise<boolean> {
    const result = await this.gameRoomRepository.update(
      { id, status: GameRoomStatus.Pending },
      { status: GameRoomStatus.InProgress },
    );
    await this.cacheService.del(CacheKeys.gameRoom(id));
    return (result.affected ?? 0) > 0;
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
    limit = 10,
    offset = 0,
  ): Promise<GameRoomEntity[]> {
    return this.gameRoomRepository
      .createQueryBuilder('room')
      .where('room.status = :status', { status: GameRoomStatus.Completed })
      .andWhere(
        '(room.user_id = :userId OR room.opponent_id = :userId OR :userId = ANY(room.opponent_ids))',
        { userId },
      )
      .orderBy('room.completed_at', 'DESC')
      .take(limit)
      .skip(offset)
      .getMany();
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

  /**
   * The lobby listing: pending, public rooms, oldest first, with optional
   * game-type / stake / token filters. The fixed `status = Pending AND
   * is_private = false` predicate matches the partial index IDX_game_rooms_lobby.
   */
  findPendingGameRooms(options?: {
    excludeUserId?: string;
    gameTypes?: GameType[];
    stake?: LobbyStakeFilter;
    stakeTokens?: StakeAsset[];
  }): Promise<GameRoomEntity[]> {
    const qb = this.gameRoomRepository
      .createQueryBuilder('room')
      .where('room.status = :status', { status: GameRoomStatus.Pending })
      // Private rooms are invite-only: never surface them in the lobby.
      .andWhere('room.is_private = false');

    if (options?.excludeUserId) {
      qb.andWhere('room.user_id != :excludeUserId', {
        excludeUserId: options.excludeUserId,
      });
    }
    if (options?.gameTypes?.length) {
      qb.andWhere('room.game_type IN (:...gameTypes)', {
        gameTypes: options.gameTypes,
      });
    }
    if (options?.stake === 'free') {
      qb.andWhere('room.stake_token IS NULL');
    } else if (options?.stake === 'staked') {
      qb.andWhere('room.stake_token IS NOT NULL');
    }
    if (options?.stakeTokens?.length) {
      qb.andWhere('room.stake_token IN (:...stakeTokens)', {
        stakeTokens: options.stakeTokens,
      });
    }

    return qb.orderBy('room.created_at', 'ASC').getMany();
  }

  /**
   * Every live room (Pending or InProgress), newest first, private included.
   * Admin surface only - unlike the lobby query this applies no privacy or
   * ownership filter.
   */
  findActiveGameRooms(): Promise<GameRoomEntity[]> {
    return this.gameRoomRepository.find({
      where: {
        status: In([GameRoomStatus.Pending, GameRoomStatus.InProgress]),
      },
      order: { createdAt: 'DESC' },
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
