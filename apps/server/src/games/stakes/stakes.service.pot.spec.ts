import { ConflictException } from '@nestjs/common';
import {
  SettlementStatus,
  GameType,
  STAKE_POT_EVENTS,
  StakeAsset,
  StakeLedgerKind,
} from '@gaming-platform/core';
import { DataSource } from 'typeorm';

import { CacheService } from '../../cache';
import { ConfigurationService } from '../../configuration/configuration.service';
import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { StakeLedgerEntryEntity } from '../../stake-pot/entities/stake-ledger-entry.entity';
import { StakePotWithdrawalEntity } from '../../stake-pot/entities/stake-pot-withdrawal.entity';
import { StakedBalanceEntity } from '../../stake-pot/entities/staked-balance.entity';
import { StakePotChainService } from '../../stake-pot/stake-pot-chain.service';
import { StakePotService } from '../../stake-pot/stake-pot.service';
import {
  createTestDataSource,
  testUserId,
  truncatePotTables,
} from '../../stake-pot/test/db-harness';
import { WebsocketsService } from '../../websockets';
import { StakesService } from './stakes.service';

const ASSET = StakeAsset.Usdc;
const STAKE = 10_000_000n;
const CREATOR = testUserId('creator');
const JOINER = testUserId('joiner');
const ROOM = '33333333-3333-4333-8333-333333333333';

describe('StakesService (pot mode)', () => {
  let dataSource: DataSource;
  let stakePotService: StakePotService;
  let service: StakesService;
  let settlementRows: Map<string, { status: SettlementStatus; payout?: string | null }>;
  let completed: { roomId: string; winnerUserId: string | null; endReason: string }[];
  let events: { userId: string; event: string }[];

  const room = (): GameRoomEntity =>
    ({
      id: ROOM,
      userId: CREATOR,
      opponentId: JOINER,
      opponentIds: [],
      gameType: GameType.NavalBattle,
      stakeToken: ASSET,
      stakeAmount: STAKE.toString(),
      winnerUserId: null,
    }) as unknown as GameRoomEntity;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
  });

  afterAll(async () => {
    await truncatePotTables(dataSource);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await truncatePotTables(dataSource);
    settlementRows = new Map();
    completed = [];
    events = [];

    const websockets = {
      sendToUser: (userId: string, event: string) => {
        events.push({ userId, event });
      },
    } as unknown as WebsocketsService;
    const config = { STAKE_FEE_BPS: 500 } as ConfigurationService;

    stakePotService = new StakePotService(
      dataSource,
      dataSource.getRepository(StakedBalanceEntity),
      dataSource.getRepository(StakeLedgerEntryEntity),
      dataSource.getRepository(StakePotWithdrawalEntity),
      config,
      websockets,
    );

    const dbService = {
      createMatchSettlement: async ({ roomId }: { roomId: string }) => {
        settlementRows.set(roomId, { status: SettlementStatus.Funding });
      },
      updateMatchSettlement: async (
        roomId: string,
        patch: { status?: SettlementStatus; payout?: string | null },
      ) => {
        const current = settlementRows.get(roomId) ?? { status: SettlementStatus.Funding };
        settlementRows.set(roomId, { ...current, ...patch });
      },
      findMatchSettlementByRoomId: async (roomId: string) => {
        const row = settlementRows.get(roomId);
        return row ? { roomId, ...row } : null;
      },
      // Models the conditional UPDATE: the single-settler guarantee is what these tests protect.
      claimMatchSettlement: async (roomId: string, next: SettlementStatus) => {
        const current = settlementRows.get(roomId);
        if (
          !current ||
          (current.status !== SettlementStatus.Funding &&
            current.status !== SettlementStatus.Funded)
        ) {
          return false;
        }
        settlementRows.set(roomId, { ...current, status: next });
        return true;
      },
      releaseMatchSettlementClaim: async (
        roomId: string,
        previous: SettlementStatus,
      ) => {
        const current = settlementRows.get(roomId);
        if (
          !current ||
          (current.status !== SettlementStatus.SettlePending &&
            current.status !== SettlementStatus.VoidPending)
        ) {
          return;
        }
        settlementRows.set(roomId, { ...current, status: previous });
      },
      completeGameRoom: async (
        roomId: string,
        d: { winnerUserId: string | null; endReason: string },
      ) => {
        completed.push({ roomId, ...d });
      },
      findGameRoomById: async () => room(),
    } as unknown as DbService;

    service = new StakesService(
      dbService,
      { get: async () => null } as unknown as CacheService,
      config,
      websockets,
      stakePotService,
      { enabled: true } as unknown as StakePotChainService,
    );
  });

  const fund = (userId: string, amount: bigint) =>
    stakePotService.credit(userId, ASSET, amount, {
      txHash: `0x${userId.slice(-8)}`,
      logIndex: 0,
    });

  it('has already taken the hold by the time beginFunding resolves', async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE);

    await service.beginFunding(room());

    expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(0n);
    expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(0n);
    expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Funded);
    expect(
      await dataSource
        .getRepository(StakeLedgerEntryEntity)
        .countBy({ roomId: ROOM, kind: StakeLedgerKind.Hold }),
    ).toBe(2);
  });

  it('throws when a participant cannot cover the stake, charging nobody', async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE - 1n);

    await expect(service.beginFunding(room())).rejects.toBeInstanceOf(
      ConflictException,
    );

    expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(STAKE);
    expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(STAKE - 1n);
    expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Voided);
    expect(completed).toEqual([
      { roomId: ROOM, winnerUserId: null, endReason: 'stake-failed' },
    ]);
  });

  it('settles to the winner in the same call that completes the match', async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE);
    await service.beginFunding(room());

    await service.completeMatch(ROOM, CREATOR, 'win');

    const pot = STAKE * 2n;
    const fee = (pot * 500n) / 10_000n;
    expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(pot - fee);
    expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(0n);
    expect(settlementRows.get(ROOM)).toMatchObject({
      status: SettlementStatus.Settled,
      payout: (pot - fee).toString(),
    });
  });

  it('pays exactly one pot when settlement is driven concurrently', async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE);
    await service.beginFunding(room());

    await Promise.all(
      Array.from({ length: 8 }, () =>
        service.completeMatch(ROOM, CREATOR, 'forfeit'),
      ),
    );

    const pot = STAKE * 2n;
    const fee = (pot * 500n) / 10_000n;
    expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(
      pot - fee,
    );
    expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(0n);
    expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Settled);
  });

  it('never both settles and releases the same room', async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE);
    await service.beginFunding(room());

    await Promise.all([
      service.completeMatch(ROOM, CREATOR, 'forfeit'),
      service.completeMatch(ROOM, null, 'void'),
    ]);

    const pot = STAKE * 2n;
    const fee = (pot * 500n) / 10_000n;
    const creator = await stakePotService.availableBalance(CREATOR, ASSET);
    const joiner = await stakePotService.availableBalance(JOINER, ASSET);
    const settled = settlementRows.get(ROOM)?.status === SettlementStatus.Settled;

    if (settled) {
      expect(creator).toBe(pot - fee);
      expect(joiner).toBe(0n);
    } else {
      expect(creator).toBe(STAKE);
      expect(joiner).toBe(STAKE);
    }
    expect(creator + joiner).toBeLessThanOrEqual(pot);
  });

  it('releases every hold when a match ends with no winner', async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE);
    await service.beginFunding(room());

    await service.completeMatch(ROOM, null, 'void');

    expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(STAKE);
    expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(STAKE);
    expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Voided);
  });

  it('reads eligibility from the pot, not the wallet', async () => {
    await fund(JOINER, STAKE);

    await expect(
      service.assertSufficientBalance(JOINER, ASSET, STAKE.toString()),
    ).resolves.toBeUndefined();
    await expect(
      service.assertSufficientBalance(JOINER, ASSET, (STAKE + 1n).toString()),
    ).rejects.toThrow(/stake pot/i);
  });

  it('pushes a pot balance update to both players on settlement', async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE);
    await service.beginFunding(room());
    events = [];

    await service.completeMatch(ROOM, CREATOR, 'win');

    const balancePushes = events
      .filter(e => e.event === STAKE_POT_EVENTS.balance)
      .map(e => e.userId);
    expect(balancePushes).toEqual(expect.arrayContaining([CREATOR, JOINER]));
  });
});
