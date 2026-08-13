import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import {
  LobbyStakeFilter,
  RANKING_COIN_POINTS,
  RANKING_POINTS_FREE_GAME,
  RANKING_POINTS_STAKED_GAME,
  RankingEntry,
  STAKE_ASSET_DECIMALS,
  STAKEABLE_ASSETS,
  UserPlatform,
  convertStakeAmount,
} from '@gaming-platform/core';

import {
  CacheKeys,
  CacheService,
  GAME_ROOM_TTL_SECONDS,
} from '../cache';
import { stakeAssetFor } from '../games/stakes/stake-legs.util';
import { AppSettingEntity } from './entities/app-setting.entity';
import { EmailLoginTokenEntity } from './entities/email-login-token.entity';
import { GameRoomEntity } from './entities/game-room.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { MatchSettlementEntity } from './entities/match-settlement.entity';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { SettlementStatus, GameRoomStatus, GameType, StakeAsset } from './types/game';
import { WalletNetwork, WalletOrigin } from './types/wallet';

/**
 * "Rooms this user took part in", in the seat columns' own order. The array
 * seat uses `@>` rather than `= ANY(...)`: only containment can use the GIN
 * index on opponent_ids, and without it every stats query seq-scans the table.
 */
const PLAYED_IN_ROOM =
  '(room.user_id = :userId OR room.opponent_id = :userId OR room.opponent_ids @> ARRAY[:userId]::uuid[])';

/** Where a user signed up. Added by the web-accounts work; read-only here. */
const USER_PLATFORM_COLUMN = 'platform';

/** Newest cross-stable rooms corrected per seat, matching the history page cap. */
const MIXED_STAKE_ROOM_LIMIT = 50;

/** Base-unit net winnings -> ranking points, per stake asset. */
const RANKING_COIN_POINTS_CASE = STAKEABLE_ASSETS.map(
  asset =>
    `WHEN ${asset} THEN ${RANKING_COIN_POINTS[asset] ?? 0}` +
    ` / 10::numeric ^ ${STAKE_ASSET_DECIMALS[asset]}`,
).join(' ');

export interface RoomTotals {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  staked: number;
  free: number;
}

export interface UserRoomTotals extends RoomTotals {
  wins: number;
  /** Completed with no winner: forfeits before a result, voided matches. */
  voids: number;
  created: number;
}

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
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshTokenRepository: Repository<RefreshTokenEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    @InjectRepository(GameRoomEntity)
    private readonly gameRoomRepository: Repository<GameRoomEntity>,
    @InjectRepository(MatchSettlementEntity)
    private readonly matchSettlementRepository: Repository<MatchSettlementEntity>,
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

  /** Case-insensitive: ENS names are minted lowercase but typed freely. */
  findUserByEnsName(ensName: string): Promise<UserEntity | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.ens_name) = LOWER(:ensName)', { ensName })
      .getOne();
  }

  /**
   * Take an ENS name for a user who has none. The partial unique index decides
   * the winner of a race; the loser sees false and tries the next label.
   */
  async claimEnsName(userId: string, ensName: string): Promise<boolean> {
    try {
      const result = await this.userRepository.update(
        { id: userId, ensName: IsNull() },
        { ensName },
      );
      return result.affected === 1;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        return false;
      }
      throw error;
    }
  }

  async clearEnsName(userId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { ensName: null });
  }

  async setUserIsBot(userId: string, isBot: boolean): Promise<void> {
    await this.userRepository.update({ id: userId }, { isBot });
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
      .andWhere(PLAYED_IN_ROOM, { userId })
      .getRawOne<{ games: string; wins: string; voids: string }>();
    return {
      games: Number(row?.games ?? 0),
      wins: Number(row?.wins ?? 0),
      voids: Number(row?.voids ?? 0),
    };
  }

  /** Completed matches per game type, most-played first. */
  async findGameTypeCountsForUser(
    userId: string,
  ): Promise<{ gameType: number; matches: number }[]> {
    const rows = await this.gameRoomRepository
      .createQueryBuilder('room')
      .select('room.game_type', 'gameType')
      .addSelect('COUNT(*)', 'matches')
      .where('room.status = :status', { status: GameRoomStatus.Completed })
      .andWhere(PLAYED_IN_ROOM, { userId })
      .groupBy('room.game_type')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('room.game_type', 'ASC')
      .getRawMany<{ gameType: number; matches: string }>();
    return rows.map(row => ({
      gameType: Number(row.gameType),
      matches: Number(row.matches),
    }));
  }

  /**
   * Longest unbroken run of wins, in completion order. Gaps-and-islands: every
   * row in one run shares (overall row number - row number within its
   * won/not-won partition), so grouping on that difference sizes each run.
   * Voids break a streak - they are not wins.
   */
  async findBestWinStreakForUser(userId: string): Promise<number> {
    const row = await this.gameRoomRepository.manager.query<
      { streak: string | null }[]
    >(
      `SELECT MAX(len) AS streak
         FROM (
           SELECT COUNT(*) AS len
             FROM (
               SELECT
                 winner_user_id = $1 AS is_win,
                 ROW_NUMBER() OVER (ORDER BY completed_at, id)
                   - ROW_NUMBER() OVER (
                       PARTITION BY winner_user_id = $1
                       ORDER BY completed_at, id
                     ) AS run
                 FROM game_rooms
                WHERE status = $2
                  AND (user_id = $1 OR opponent_id = $1 OR opponent_ids @> ARRAY[$1]::uuid[])
             ) marked
            WHERE marked.is_win
            GROUP BY marked.run
         ) runs`,
      [userId, GameRoomStatus.Completed],
    );
    return Number(row[0]?.streak ?? 0);
  }

  /**
   * Net staked outcome per asset: what a win actually paid out (from the
   * settled settlement) minus every stake this player put up. Void rooms are
   * excluded - the stake is returned, so they net zero.
   */
  async findStakeNetByTokenForUser(
    userId: string,
  ): Promise<{ stakeToken: number; net: string }[]> {
    const rows = await this.gameRoomRepository
      .createQueryBuilder('room')
      .leftJoin('match_settlements', 'settlement', 'settlement.room_id = room.id')
      .select('room.stake_token', 'stakeToken')
      .addSelect(
        `SUM(
           CASE WHEN room.winner_user_id = :userId
                THEN COALESCE(settlement.payout, room.stake_amount)::numeric - room.stake_amount::numeric
                ELSE -room.stake_amount::numeric
           END
         )`,
        'net',
      )
      .where('room.status = :status', { status: GameRoomStatus.Completed })
      .andWhere('room.stake_token IS NOT NULL')
      .andWhere('room.winner_user_id IS NOT NULL')
      .andWhere('room.stake_token_choices IS NULL')
      .andWhere(PLAYED_IN_ROOM, { userId })
      .groupBy('room.stake_token')
      .getRawMany<{ stakeToken: number; net: string }>();

    const net = new Map<number, bigint>();
    for (const row of rows) {
      // numeric comes back as a string; strip any fractional tail so it
      // stays a valid base-unit integer for BigInt on the client.
      net.set(
        Number(row.stakeToken),
        BigInt(String(row.net ?? '0').split('.')[0]!),
      );
    }
    for (const [asset, amount] of await this.mixedStakeNetForUser(userId)) {
      net.set(asset, (net.get(asset) ?? 0n) + amount);
    }
    return [...net].map(([stakeToken, amount]) => ({
      stakeToken,
      net: amount.toString(),
    }));
  }

  /**
   * The same net, for rooms where players staked different stablecoins. Each
   * seat nets in its own token, so there is no single-column SQL for it - and
   * these rooms are rare enough that reading them one by one is cheaper than
   * dragging the query above off its indexes.
   */
  private async mixedStakeNetForUser(
    userId: string,
  ): Promise<Map<number, bigint>> {
    const rooms = await this.gameRoomRepository
      .createQueryBuilder('room')
      .where('room.status = :status', { status: GameRoomStatus.Completed })
      .andWhere('room.stake_token IS NOT NULL')
      .andWhere('room.winner_user_id IS NOT NULL')
      .andWhere('room.stake_token_choices IS NOT NULL')
      .andWhere(PLAYED_IN_ROOM, { userId })
      .orderBy('room.completed_at', 'DESC')
      .take(MIXED_STAKE_ROOM_LIMIT)
      .getMany();
    if (rooms.length === 0) {
      return new Map();
    }
    const settlements = await this.matchSettlementRepository.find({
      where: { roomId: In(rooms.map(room => room.id)) },
    });
    const byRoom = new Map(settlements.map(row => [row.roomId, row] as const));

    const net = new Map<number, bigint>();
    const add = (asset: number, amount: bigint) =>
      net.set(asset, (net.get(asset) ?? 0n) + amount);
    for (const room of rooms) {
      const own = stakeAssetFor(room, userId);
      const stake = BigInt(
        convertStakeAmount(room.stakeAmount!, room.stakeToken!, own),
      );
      if (room.winnerUserId !== userId) {
        add(own, -stake);
        continue;
      }
      const prize = byRoom.get(room.id)?.payoutByAsset;
      if (!prize) {
        continue; // Not settled yet - nets zero, as the indexed query assumes.
      }
      for (const [asset, amount] of Object.entries(prize)) {
        add(Number(asset), BigInt(amount));
      }
      add(own, -stake);
    }
    return net;
  }

  /**
   * Leaderboard points over decided matches (voids and never-started rooms
   * award nothing): participation per room plus the winner's net payout
   * converted to points per asset. Unnesting the seat columns cannot use the
   * seat indexes, so this is a deliberate full scan.
   *
   * Every stablecoin scores the same per human unit, so a mixed room's stake
   * term can stay in the room's token even when that seat staked another one.
   */
  async findRankings(options: {
    gameType?: GameType;
    limit: number;
    offset: number;
  }): Promise<Omit<RankingEntry, 'rank'>[]> {
    const params: unknown[] = [
      GameRoomStatus.Completed,
      RANKING_POINTS_FREE_GAME,
      RANKING_POINTS_STAKED_GAME,
    ];
    let gameTypeClause = '';
    if (options.gameType !== undefined) {
      params.push(options.gameType);
      gameTypeClause = `AND room.game_type = $${params.length}`;
    }
    params.push(options.limit);
    const limitParam = `$${params.length}`;
    params.push(options.offset);
    const offsetParam = `$${params.length}`;

    const rows = await this.gameRoomRepository.manager.query<
      {
        userId: string;
        username: string | null;
        ensName: string | null;
        games: string;
        wins: string;
        stakedGames: string;
        playPoints: string;
        coinPoints: string;
        totalPoints: string;
      }[]
    >(
      `SELECT ranked.*,
              ranked."playPoints" + ranked."coinPoints" AS "totalPoints"
         FROM (
           SELECT participant::text AS "userId",
                  u.username AS "username",
                  u.ens_name AS "ensName",
                  COUNT(*) AS games,
                  COUNT(*) FILTER (WHERE room.winner_user_id = participant)
                    AS wins,
                  COUNT(*) FILTER (WHERE room.stake_token IS NOT NULL)
                    AS "stakedGames",
                  SUM(CASE WHEN room.stake_token IS NULL
                           THEN $2::numeric ELSE $3::numeric END)
                    AS "playPoints",
                  COALESCE(SUM(
                    CASE WHEN room.winner_user_id = participant
                          AND (settlement.payout IS NOT NULL
                               OR settlement.payout_by_asset IS NOT NULL)
                         THEN COALESCE(
                                settlement.payout::numeric
                                  * CASE room.stake_token
                                      ${RANKING_COIN_POINTS_CASE}
                                      ELSE 0
                                    END,
                                (SELECT COALESCE(SUM(
                                          (leg.value #>> '{}')::numeric
                                          * CASE leg.key::int
                                              ${RANKING_COIN_POINTS_CASE}
                                              ELSE 0
                                            END
                                        ), 0)
                                   FROM jsonb_each(settlement.payout_by_asset) leg)
                              )
                              - room.stake_amount::numeric
                                * CASE room.stake_token
                                    ${RANKING_COIN_POINTS_CASE}
                                    ELSE 0
                                  END
                         ELSE 0
                    END
                  ), 0) AS "coinPoints"
             FROM game_rooms room
             LEFT JOIN match_settlements settlement
               ON settlement.room_id = room.id
            CROSS JOIN LATERAL unnest(
                    array_remove(
                      ARRAY[room.user_id, room.opponent_id] || room.opponent_ids,
                      NULL
                    )
                  ) AS participant
             LEFT JOIN users u ON u.id = participant
            WHERE room.status = $1
              AND room.winner_user_id IS NOT NULL
              AND COALESCE(u.is_bot, false) = false
              ${gameTypeClause}
            GROUP BY participant, u.username, u.ens_name
         ) ranked
        ORDER BY "totalPoints" DESC, ranked.games DESC, ranked."userId"
        LIMIT ${limitParam} OFFSET ${offsetParam}`,
      params,
    );
    return rows.map(row => ({
      userId: row.userId,
      username: row.username,
      ensName: row.ensName,
      games: Number(row.games),
      wins: Number(row.wins),
      stakedGames: Number(row.stakedGames),
      playPoints: Math.round(Number(row.playPoints)),
      coinPoints: Math.round(Number(row.coinPoints)),
      totalPoints: Math.round(Number(row.totalPoints)),
    }));
  }

  // --- admin stats ---

  countUsers(): Promise<number> {
    return this.userRepository.count();
  }

  /** Every room, split by lifecycle and by whether a stake was posted. */
  async findRoomTotals(): Promise<RoomTotals> {
    const row = await this.gameRoomRepository
      .createQueryBuilder('room')
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE room.status = :pending)`, 'pending')
      .addSelect(
        `COUNT(*) FILTER (WHERE room.status = :inProgress)`,
        'inProgress',
      )
      .addSelect(`COUNT(*) FILTER (WHERE room.status = :completed)`, 'completed')
      .addSelect(`COUNT(*) FILTER (WHERE room.stake_token IS NOT NULL)`, 'staked')
      .addSelect(`COUNT(*) FILTER (WHERE room.stake_token IS NULL)`, 'free')
      .setParameters({
        pending: GameRoomStatus.Pending,
        inProgress: GameRoomStatus.InProgress,
        completed: GameRoomStatus.Completed,
      })
      .getRawOne<Record<keyof RoomTotals, string>>();
    return {
      total: Number(row?.total ?? 0),
      pending: Number(row?.pending ?? 0),
      inProgress: Number(row?.inProgress ?? 0),
      completed: Number(row?.completed ?? 0),
      staked: Number(row?.staked ?? 0),
      free: Number(row?.free ?? 0),
    };
  }

  /** Rooms per game type, most-played first. */
  async findRoomCountsByType(): Promise<
    { gameType: number; total: number; staked: number }[]
  > {
    const rows = await this.gameRoomRepository
      .createQueryBuilder('room')
      .select('room.game_type', 'gameType')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE room.stake_token IS NOT NULL)`, 'staked')
      .groupBy('room.game_type')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('room.game_type', 'ASC')
      .getRawMany<{ gameType: number; total: string; staked: string }>();
    return rows.map(row => ({
      gameType: Number(row.gameType),
      total: Number(row.total),
      staked: Number(row.staked),
    }));
  }

  /**
   * Rooms played, per participant, in one pass — a per-user query would be one
   * round trip per row of the admin table. Unnesting the three seat columns
   * cannot use the seat indexes, so this is a deliberate full scan.
   */
  async findRoomCountsByParticipant(): Promise<
    Map<string, { games: number; staked: number }>
  > {
    const rows = await this.gameRoomRepository.manager.query<
      { userId: string; games: string; staked: string }[]
    >(
      `SELECT participant::text AS "userId",
              COUNT(DISTINCT room.id) AS games,
              COUNT(DISTINCT room.id) FILTER (WHERE room.stake_token IS NOT NULL)
                AS staked
         FROM game_rooms room,
              LATERAL unnest(
                array_remove(
                  ARRAY[room.user_id, room.opponent_id] || room.opponent_ids,
                  NULL
                )
              ) AS participant
        GROUP BY participant`,
    );
    return new Map(
      rows.map(row => [
        row.userId,
        { games: Number(row.games), staked: Number(row.staked) },
      ]),
    );
  }

  /** One player's whole record, live rooms included. */
  async findRoomTotalsForUser(userId: string): Promise<UserRoomTotals> {
    const row = await this.gameRoomRepository
      .createQueryBuilder('room')
      .select('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE room.status = :pending)`, 'pending')
      .addSelect(
        `COUNT(*) FILTER (WHERE room.status = :inProgress)`,
        'inProgress',
      )
      .addSelect(`COUNT(*) FILTER (WHERE room.status = :completed)`, 'completed')
      .addSelect(`COUNT(*) FILTER (WHERE room.stake_token IS NOT NULL)`, 'staked')
      .addSelect(`COUNT(*) FILTER (WHERE room.stake_token IS NULL)`, 'free')
      .addSelect(
        `COUNT(*) FILTER (WHERE room.winner_user_id = :userId)`,
        'wins',
      )
      .addSelect(
        `COUNT(*) FILTER (WHERE room.status = :completed
                            AND room.winner_user_id IS NULL)`,
        'voids',
      )
      .addSelect(`COUNT(*) FILTER (WHERE room.user_id = :userId)`, 'created')
      .where(PLAYED_IN_ROOM, { userId })
      .setParameters({
        pending: GameRoomStatus.Pending,
        inProgress: GameRoomStatus.InProgress,
        completed: GameRoomStatus.Completed,
      })
      .getRawOne<Record<keyof UserRoomTotals, string>>();
    return {
      total: Number(row?.total ?? 0),
      pending: Number(row?.pending ?? 0),
      inProgress: Number(row?.inProgress ?? 0),
      completed: Number(row?.completed ?? 0),
      staked: Number(row?.staked ?? 0),
      free: Number(row?.free ?? 0),
      wins: Number(row?.wins ?? 0),
      voids: Number(row?.voids ?? 0),
      created: Number(row?.created ?? 0),
    };
  }

  /** One player's rooms per game type, most-played first. */
  async findRoomCountsByTypeForUser(
    userId: string,
  ): Promise<{ gameType: number; total: number; staked: number }[]> {
    const rows = await this.gameRoomRepository
      .createQueryBuilder('room')
      .select('room.game_type', 'gameType')
      .addSelect('COUNT(*)', 'total')
      .addSelect(`COUNT(*) FILTER (WHERE room.stake_token IS NOT NULL)`, 'staked')
      .where(PLAYED_IN_ROOM, { userId })
      .groupBy('room.game_type')
      .orderBy('COUNT(*)', 'DESC')
      .addOrderBy('room.game_type', 'ASC')
      .getRawMany<{ gameType: number; total: string; staked: string }>();
    return rows.map(row => ({
      gameType: Number(row.gameType),
      total: Number(row.total),
      staked: Number(row.staked),
    }));
  }

  /**
   * Signup platform per user, or null when the column has not been migrated in
   * yet. Owned by the web-accounts work; everything here only reads it, so the
   * admin surface has to work on a database that predates it.
   */
  async findUserPlatforms(): Promise<Map<string, number> | null> {
    if (!(await this.hasUserPlatformColumn())) {
      return null;
    }
    const rows = await this.userRepository.manager.query<
      { id: string; platform: number | null }[]
    >(`SELECT id::text AS id, "${USER_PLATFORM_COLUMN}" AS platform FROM users`);
    return new Map(
      rows
        .filter(row => row.platform !== null)
        .map(row => [row.id, Number(row.platform)]),
    );
  }

  /** Not memoized: the column appears mid-life, when its migration runs. */
  private async hasUserPlatformColumn(): Promise<boolean> {
    const rows = await this.dataSource.query<{ present: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'users'
            AND column_name = $1
       ) AS present`,
      [USER_PLATFORM_COLUMN],
    );
    return rows[0]?.present === true;
  }

  createUser(email: string, platform: UserPlatform): Promise<UserEntity> {
    return this.userRepository.save(
      this.userRepository.create({ email, username: null, platform }),
    );
  }

  /**
   * A wallet-only account: no email, and the address the user signed in with
   * registered as an imported wallet. That wallet row is what lets pot
   * deposits, withdrawals and recipient lookup find the user, so the two
   * writes have to land together.
   */
  async createWalletUser(
    address: string,
    platform: UserPlatform,
  ): Promise<UserEntity> {
    return this.dataSource.transaction(async manager => {
      const user = await manager.save(
        manager.create(UserEntity, { email: null, username: null, platform }),
      );
      await manager.save(
        manager.create(WalletEntity, {
          userId: user.id,
          address,
          type: WalletOrigin.Imported,
          network: WalletNetwork.Ethereum,
        }),
      );
      return user;
    });
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

  // --- refresh tokens -------------------------------------------------------

  createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshTokenEntity> {
    return this.refreshTokenRepository.save(
      this.refreshTokenRepository.create(data),
    );
  }

  /** Looked up by hash - the plaintext token is never stored. */
  findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenEntity | null> {
    return this.refreshTokenRepository.findOneBy({ tokenHash });
  }

  /**
   * Revoke one token, but only if it is still live. The affected-row count is
   * what makes rotation safe under concurrency: two requests racing with the
   * same token both find it live, and only the one that flips `revoked_at`
   * gets to mint the replacement pair.
   */
  async revokeRefreshToken(id: string): Promise<boolean> {
    const result = await this.refreshTokenRepository.update(
      { id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return result.affected === 1;
  }

  /** Reuse detection and logout-everywhere: drop every live token for a user. */
  async revokeRefreshTokensForUser(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  // --- wallets ---

  /** The caller's custodial wallet, key material included (normally hidden). */
  findEmbeddedWalletForUser(userId: string): Promise<WalletEntity | null> {
    return this.walletRepository
      .createQueryBuilder('w')
      .addSelect('w.encryptedPrivateKey')
      .where('w.user_id = :userId', { userId })
      .andWhere('w.type = :type', { type: WalletOrigin.Embedded })
      .getOne();
  }

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
    type: WalletOrigin;
    network: WalletNetwork;
    encryptedPrivateKey?: string;
  }): Promise<WalletEntity> {
    return this.walletRepository.save(this.walletRepository.create(data));
  }

  findWalletsForUser(
    userId: string,
  ): Promise<Pick<WalletEntity, 'address' | 'network' | 'type'>[]> {
    return this.walletRepository.find({
      where: { userId },
      select: ['address', 'network', 'type'],
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

  /**
   * Reverse lookup for the stake pot's event watcher: an on-chain `Staked`
   * event names an address, and the credit has to land on the owning user.
   *
   * Case-insensitive on purpose — wallets are stored checksummed but decoded
   * log arguments are not reliably in that form, and crediting the wrong (or
   * no) user over a capitalisation difference would lose a deposit. Served by
   * the IDX_wallets_address_lower functional index.
   */
  async findWalletByAddress(
    address: string,
  ): Promise<Pick<WalletEntity, 'userId' | 'address'> | null> {
    return this.walletRepository
      .createQueryBuilder('wallet')
      .select(['wallet.userId', 'wallet.address'])
      .where('LOWER(wallet.address) = LOWER(:address)', { address })
      .getOne();
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
      .andWhere(PLAYED_IN_ROOM, { userId })
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
  async joinGameRoom(
    id: string,
    opponentId: string,
    stakeToken: StakeAsset | null = null,
  ): Promise<boolean> {
    let seated: boolean;
    if (stakeToken === null) {
      const result = await this.gameRoomRepository.update(
        { id, status: GameRoomStatus.Pending, opponentId: IsNull() },
        { opponentId, status: GameRoomStatus.InProgress },
      );
      seated = (result.affected ?? 0) > 0;
    } else {
      // query() hands back [rows, affectedCount] for DML, never a bare array.
      const [rows] = (await this.gameRoomRepository.query(
        `UPDATE "game_rooms"
            SET "opponent_id" = $2,
                "status" = $4,
                "stake_token_choices" =
                  COALESCE("stake_token_choices", '{}'::jsonb)
                  || jsonb_build_object($2::uuid::text, $5::int)
          WHERE "id" = $1
            AND "status" = $3
            AND "opponent_id" IS NULL
          RETURNING "id"`,
        [
          id,
          opponentId,
          GameRoomStatus.Pending,
          GameRoomStatus.InProgress,
          stakeToken,
        ],
      )) as [unknown[], number];
      seated = rows.length > 0;
    }
    await this.cacheService.del(CacheKeys.gameRoom(id));
    return seated;
  }

  /**
   * Append a joiner to a multi-player room. The single UPDATE enforces
   * capacity, no-duplicate and not-the-creator atomically, so two racing
   * joins can't oversubscribe the room. Returns whether the join landed.
   */
  async appendGameRoomOpponent(
    id: string,
    userId: string,
    stakeToken: StakeAsset | null = null,
  ): Promise<boolean> {
    const result = await this.gameRoomRepository.query(
      `UPDATE "game_rooms"
         SET "opponent_ids" = array_append("opponent_ids", $2),
             "stake_token_choices" = CASE
               WHEN $4::int IS NULL THEN "stake_token_choices"
               ELSE COALESCE("stake_token_choices", '{}'::jsonb)
                    || jsonb_build_object($2::text, $4::int)
             END
       WHERE "id" = $1
         AND "status" = $3
         AND "user_id" != $2
         AND NOT ($2 = ANY("opponent_ids"))
         AND cardinality("opponent_ids") < "player_count" - 1
       RETURNING "id"`,
      [id, userId, GameRoomStatus.Pending, stakeToken],
    );
    await this.cacheService.del(CacheKeys.gameRoom(id));
    return (result as unknown[]).length > 0;
  }

  /** Remove a joiner from a still-Pending multi-player room. */
  async removeGameRoomOpponent(id: string, userId: string): Promise<boolean> {
    const result = await this.gameRoomRepository.query(
      `UPDATE "game_rooms"
         SET "opponent_ids" = array_remove("opponent_ids", $2),
             "stake_token_choices" = NULLIF("stake_token_choices" - $2::text, '{}'::jsonb)
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

  /** Flip a room to Completed and persist its result (History reads these).
   *  One-shot: a room already Completed keeps its winner - a late forfeit
   *  must not rewrite a settled result. */
  async completeGameRoom(
    id: string,
    result?: { winnerUserId: string | null; endReason: string | null },
  ): Promise<void> {
    await this.gameRoomRepository.update(
      { id, status: Not(GameRoomStatus.Completed) },
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
      .andWhere(PLAYED_IN_ROOM, { userId })
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

  /** Pending rooms (private included) at least this old — the stale-lobby sweep. */
  findPendingGameRoomsCreatedBefore(cutoff: Date): Promise<GameRoomEntity[]> {
    return this.gameRoomRepository
      .createQueryBuilder('room')
      .where('room.status = :status', { status: GameRoomStatus.Pending })
      .andWhere('room.created_at <= :cutoff', { cutoff })
      .orderBy('room.created_at', 'ASC')
      .getMany();
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

  // --- match settlements ---

  createMatchSettlement(data: {
    roomId: string;
    status: SettlementStatus;
  }): Promise<MatchSettlementEntity> {
    return this.matchSettlementRepository.save(
      this.matchSettlementRepository.create(data),
    );
  }

  findMatchSettlementByRoomId(roomId: string): Promise<MatchSettlementEntity | null> {
    return this.matchSettlementRepository.findOneBy({ roomId });
  }

  async updateMatchSettlement(
    roomId: string,
    patch: Partial<
      Pick<
        MatchSettlementEntity,
        | 'status'
        | 'payout'
        | 'fee'
        | 'payoutByAsset'
        | 'feeByAsset'
        | 'attempts'
        | 'error'
      >
    >,
  ): Promise<void> {
    await this.matchSettlementRepository.update({ roomId }, patch);
  }

  /**
   * Claim a live settlement for exactly one terminal transition.
   *
   * The conditional UPDATE is the serialization point for settlement: a room
   * can leave Funding/Funded once, so concurrent completions (a forfeit racing
   * a timeout, a replayed socket event) can neither settle twice nor settle and
   * void the same room. Returns true only for the caller that won it.
   */
  async claimMatchSettlement(
    roomId: string,
    next: SettlementStatus.SettlePending | SettlementStatus.VoidPending,
  ): Promise<boolean> {
    const result = await this.matchSettlementRepository.update(
      {
        roomId,
        status: In([SettlementStatus.Funding, SettlementStatus.Funded]),
      },
      { status: next },
    );
    return result.affected === 1;
  }

  /**
   * Hand a claim back after the settlement work failed, so a retry can pick it
   * up instead of the stake staying locked forever.
   *
   * Guarded on the pending statuses: if another worker already carried this
   * room to Settled/Voided, this must not drag it back to Funded.
   */
  async releaseMatchSettlementClaim(
    roomId: string,
    previous: SettlementStatus,
    error: string,
  ): Promise<void> {
    await this.matchSettlementRepository.update(
      {
        roomId,
        status: In([SettlementStatus.SettlePending, SettlementStatus.VoidPending]),
      },
      { status: previous, error },
    );
  }

  /** Sweeper scan: settlements still needing work, oldest-touched first. */
  findMatchSettlementsByStatus(
    statuses: SettlementStatus[],
    limit = 20,
  ): Promise<MatchSettlementEntity[]> {
    return this.matchSettlementRepository.find({
      where: { status: In(statuses) },
      order: { updatedAt: 'ASC' },
      take: limit,
    });
  }

  /** Funded settlements untouched for at least `minAgeMinutes`. The cutoff is
   *  evaluated in SQL so it cannot skew with the process clock. */
  findStaleFundedSettlements(
    minAgeMinutes: number,
    limit = 50,
  ): Promise<MatchSettlementEntity[]> {
    return this.matchSettlementRepository
      .createQueryBuilder('s')
      .where('s.status = :status', { status: SettlementStatus.Funded })
      .andWhere('s.updated_at < NOW() - make_interval(mins => :minAge)', {
        minAge: minAgeMinutes,
      })
      .orderBy('s.updated_at', 'ASC')
      .take(limit)
      .getMany();
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
