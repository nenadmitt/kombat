import { ConflictException } from '@nestjs/common';
import {
  EscrowStatus,
  GameType,
  STAKE_POT_EVENTS,
  StakeAsset,
  StakeLedgerKind,
} from '@gaming-platform/core';
import { DataSource } from 'typeorm';

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

/**
 * Pot-mode funding is synchronous, so `beginFunding` resolves before the join
 * request that triggered it has answered. The joiner therefore cannot rely on
 * `stake:funded` - it fires before they could subscribe. These tests pin the two
 * properties the client depends on instead: on success the hold is already in
 * place when the call returns, and on failure the call throws.
 */
describe('StakesService (pot mode)', () => {
  let dataSource: DataSource;
  let stakePotService: StakePotService;
  let service: StakesService;
  let escrowRows: Map<string, { status: EscrowStatus; payout?: string | null }>;
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
    escrowRows = new Map();
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
      createStakeEscrow: async ({ roomId }: { roomId: string }) => {
        escrowRows.set(roomId, { status: EscrowStatus.Funding });
      },
      updateStakeEscrow: async (
        roomId: string,
        patch: { status?: EscrowStatus; payout?: string | null },
      ) => {
        const current = escrowRows.get(roomId) ?? { status: EscrowStatus.Funding };
        escrowRows.set(roomId, { ...current, ...patch });
      },
      findStakeEscrowByRoomId: async (roomId: string) => {
        const row = escrowRows.get(roomId);
        return row ? { roomId, ...row } : null;
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

    // Nothing is left in flight: the joiner's HTTP response can be trusted.
    expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(0n);
    expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(0n);
    expect(escrowRows.get(ROOM)?.status).toBe(EscrowStatus.Funded);
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
    expect(escrowRows.get(ROOM)?.status).toBe(EscrowStatus.Voided);
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
    expect(escrowRows.get(ROOM)).toMatchObject({
      status: EscrowStatus.Settled,
      payout: (pot - fee).toString(),
    });
  });

  it('releases every hold when a match ends with no winner', async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE);
    await service.beginFunding(room());

    await service.completeMatch(ROOM, null, 'void');

    expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(STAKE);
    expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(STAKE);
    expect(escrowRows.get(ROOM)?.status).toBe(EscrowStatus.Voided);
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
