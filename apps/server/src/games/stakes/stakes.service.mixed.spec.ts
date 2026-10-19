import {
  SettlementStatus,
  GameType,
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
import {
  PLATFORM_ACCOUNT_ID,
  StakePotService,
} from '../../stake-pot/stake-pot.service';
import {
  createTestDataSource,
  testUserId,
  truncatePotTables,
} from '../../stake-pot/test/db-harness';
import { WebsocketsService } from '../../websockets';
import { StakesService } from './stakes.service';

const USDC_10 = 10_000_000n;
const DAI_10 = 10n ** 19n;
const CREATOR = testUserId('creator');
const JOINER = testUserId('joiner');
const THIRD = testUserId('third');
const FOURTH = testUserId('fourth');
const ROOM = '55555555-5555-4555-8555-555555555555';

type SettlementRow = {
  status: SettlementStatus;
  payout?: string | null;
  fee?: string | null;
  payoutByAsset?: Record<string, string> | null;
  feeByAsset?: Record<string, string> | null;
};

describe('StakesService (cross-stable rooms)', () => {
  let dataSource: DataSource;
  let stakePotService: StakePotService;
  let service: StakesService;
  let settlementRows: Map<string, SettlementRow>;
  let roomEntity: GameRoomEntity;

  const makeRoom = (over: Partial<GameRoomEntity> = {}): GameRoomEntity =>
    ({
      id: ROOM,
      userId: CREATOR,
      opponentId: JOINER,
      opponentIds: [],
      gameType: GameType.NavalBattle,
      stakeToken: StakeAsset.Usdc,
      stakeAmount: USDC_10.toString(),
      stakeTokenChoices: { [JOINER]: StakeAsset.Dai },
      winnerUserId: null,
      ...over,
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
    roomEntity = makeRoom();

    const websockets = {
      sendToUser: () => undefined,
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
      updateMatchSettlement: async (roomId: string, patch: SettlementRow) => {
        const current = settlementRows.get(roomId) ?? {
          status: SettlementStatus.Funding,
        };
        settlementRows.set(roomId, { ...current, ...patch });
      },
      findMatchSettlementByRoomId: async (roomId: string) =>
        settlementRows.get(roomId)
          ? { roomId, ...settlementRows.get(roomId)! }
          : null,
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
        if (current) {
          settlementRows.set(roomId, { ...current, status: previous });
        }
      },
      completeGameRoom: async () => undefined,
      findGameRoomById: async () => roomEntity,
      findGameRoomByIdFresh: async () => roomEntity,
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

  const fund = (userId: string, asset: StakeAsset, amount: bigint) =>
    stakePotService.credit(userId, asset, amount, {
      txHash: `0x${userId.slice(-8)}${asset}`,
      logIndex: 0,
    });

  const fundBoth = async () => {
    await fund(CREATOR, StakeAsset.Usdc, USDC_10);
    await fund(JOINER, StakeAsset.Dai, DAI_10);
  };

  const entries = (kind: StakeLedgerKind) =>
    dataSource
      .getRepository(StakeLedgerEntryEntity)
      .find({ where: { roomId: ROOM, kind }, order: { id: 'ASC' } });

  it('holds each leg in the token that leg chose', async () => {
    await fundBoth();

    await service.beginFunding(roomEntity);

    expect(
      await stakePotService.availableBalance(CREATOR, StakeAsset.Usdc),
    ).toBe(0n);
    expect(await stakePotService.availableBalance(JOINER, StakeAsset.Dai)).toBe(
      0n,
    );
    const holds = await entries(StakeLedgerKind.Hold);
    expect(
      holds.map(hold => ({ asset: hold.asset, amount: hold.amount })),
    ).toEqual(
      expect.arrayContaining([
        { asset: StakeAsset.Usdc, amount: (-USDC_10).toString() },
        { asset: StakeAsset.Dai, amount: (-DAI_10).toString() },
      ]),
    );
    expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Funded);
  });

  it('pays the winner every leg in its own token, minus that leg fee', async () => {
    await fundBoth();
    await service.beginFunding(roomEntity);

    await service.completeMatch(ROOM, CREATOR, 'win');

    const usdcFee = USDC_10 / 20n;
    const daiFee = DAI_10 / 20n;
    expect(
      await stakePotService.availableBalance(CREATOR, StakeAsset.Usdc),
    ).toBe(USDC_10 - usdcFee);
    expect(await stakePotService.availableBalance(CREATOR, StakeAsset.Dai)).toBe(
      DAI_10 - daiFee,
    );
    expect(await stakePotService.availableBalance(JOINER, StakeAsset.Dai)).toBe(
      0n,
    );
    expect(
      await stakePotService.availableBalance(PLATFORM_ACCOUNT_ID, StakeAsset.Usdc),
    ).toBe(usdcFee);
    expect(
      await stakePotService.availableBalance(PLATFORM_ACCOUNT_ID, StakeAsset.Dai),
    ).toBe(daiFee);

    // No scalar can carry both sets of decimals, so they are explicitly cleared.
    expect(settlementRows.get(ROOM)).toEqual({
      status: SettlementStatus.Settled,
      error: null,
      payout: null,
      fee: null,
      payoutByAsset: {
        [StakeAsset.Usdc]: (USDC_10 - usdcFee).toString(),
        [StakeAsset.Dai]: (DAI_10 - daiFee).toString(),
      },
      feeByAsset: {
        [StakeAsset.Usdc]: usdcFee.toString(),
        [StakeAsset.Dai]: daiFee.toString(),
      },
    });
  });

  it('writes one capture per leg and one prize per asset', async () => {
    await fundBoth();
    await service.beginFunding(roomEntity);
    await service.completeMatch(ROOM, JOINER, 'win');

    const captures = await entries(StakeLedgerKind.Capture);
    expect(captures).toHaveLength(2);
    const prizes = await entries(StakeLedgerKind.Prize);
    expect(prizes).toHaveLength(2);
    expect(prizes.every(prize => prize.userId === JOINER)).toBe(true);
    expect(prizes.map(prize => prize.asset).sort()).toEqual([
      StakeAsset.Usdc,
      StakeAsset.Dai,
    ]);
    expect(await entries(StakeLedgerKind.Fee)).toHaveLength(2);
  });

  it('refunds each leg in its own token when the match voids', async () => {
    await fundBoth();
    await service.beginFunding(roomEntity);

    await service.completeMatch(ROOM, null, 'abandoned');

    expect(
      await stakePotService.availableBalance(CREATOR, StakeAsset.Usdc),
    ).toBe(USDC_10);
    expect(await stakePotService.availableBalance(JOINER, StakeAsset.Dai)).toBe(
      DAI_10,
    );
    expect(await stakePotService.availableBalance(JOINER, StakeAsset.Usdc)).toBe(
      0n,
    );
    expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Voided);
  });

  it('pays exactly one pot per asset when settlement is replayed', async () => {
    await fundBoth();
    await service.beginFunding(roomEntity);

    await service.completeMatch(ROOM, CREATOR, 'win');
    await service.completeMatch(ROOM, CREATOR, 'win');
    await service.recoverSettlement(ROOM);

    expect(
      await stakePotService.availableBalance(CREATOR, StakeAsset.Usdc),
    ).toBe(USDC_10 - USDC_10 / 20n);
    expect(await stakePotService.availableBalance(CREATOR, StakeAsset.Dai)).toBe(
      DAI_10 - DAI_10 / 20n,
    );
    expect(await entries(StakeLedgerKind.Prize)).toHaveLength(2);
  });

  it('recovers funding without double-holding a mixed room', async () => {
    await fundBoth();
    settlementRows.set(ROOM, { status: SettlementStatus.Funding });

    await service.recoverFunding(ROOM);
    await service.recoverFunding(ROOM);

    expect(await entries(StakeLedgerKind.Hold)).toHaveLength(2);
    expect(
      await stakePotService.availableBalance(CREATOR, StakeAsset.Usdc),
    ).toBe(0n);
  });

  it('settles a four-seat room staked in three different stablecoins', async () => {
    roomEntity = makeRoom({
      gameType: GameType.Ludo,
      opponentId: null,
      opponentIds: [JOINER, THIRD, FOURTH],
      stakeTokenChoices: {
        [JOINER]: StakeAsset.Usdt,
        [THIRD]: StakeAsset.Dai,
      },
    });
    await fund(CREATOR, StakeAsset.Usdc, USDC_10);
    await fund(JOINER, StakeAsset.Usdt, USDC_10);
    await fund(THIRD, StakeAsset.Dai, DAI_10);
    await fund(FOURTH, StakeAsset.Usdc, USDC_10);

    await service.beginFunding(roomEntity);
    await service.completeMatch(ROOM, THIRD, 'win');

    // Two USDC legs pool together; USDT and DAI each stand alone.
    const usdcPot = USDC_10 * 2n;
    expect(await stakePotService.availableBalance(THIRD, StakeAsset.Usdc)).toBe(
      usdcPot - usdcPot / 20n,
    );
    expect(await stakePotService.availableBalance(THIRD, StakeAsset.Usdt)).toBe(
      USDC_10 - USDC_10 / 20n,
    );
    expect(await stakePotService.availableBalance(THIRD, StakeAsset.Dai)).toBe(
      DAI_10 - DAI_10 / 20n,
    );
    for (const loser of [CREATOR, JOINER, FOURTH]) {
      for (const asset of [StakeAsset.Usdc, StakeAsset.Usdt, StakeAsset.Dai]) {
        expect(await stakePotService.availableBalance(loser, asset)).toBe(0n);
      }
    }
    expect(settlementRows.get(ROOM)?.payoutByAsset).toEqual({
      [StakeAsset.Usdc]: (usdcPot - usdcPot / 20n).toString(),
      [StakeAsset.Usdt]: (USDC_10 - USDC_10 / 20n).toString(),
      [StakeAsset.Dai]: (DAI_10 - DAI_10 / 20n).toString(),
    });
  });

  it('still records the legacy scalars when every seat staked the room token', async () => {
    roomEntity = makeRoom({ stakeTokenChoices: null });
    await fund(CREATOR, StakeAsset.Usdc, USDC_10);
    await fund(JOINER, StakeAsset.Usdc, USDC_10);

    await service.beginFunding(roomEntity);
    await service.completeMatch(ROOM, CREATOR, 'win');

    const pot = USDC_10 * 2n;
    expect(settlementRows.get(ROOM)).toEqual({
      status: SettlementStatus.Settled,
      error: null,
      payout: (pot - pot / 20n).toString(),
      fee: (pot / 20n).toString(),
      payoutByAsset: null,
      feeByAsset: null,
    });
  });

  // The room may be a stale cache read; captures must follow the holds or two settlers write distinct rows.
  it('captures per the holds even when the room says another token', async () => {
    await fundBoth();
    await service.beginFunding(roomEntity);

    roomEntity = makeRoom({ stakeTokenChoices: null });
    await service.completeMatch(ROOM, CREATOR, 'win');

    const captures = await entries(StakeLedgerKind.Capture);
    expect(
      captures.map(row => ({ userId: row.userId, asset: row.asset })),
    ).toEqual(
      expect.arrayContaining([
        { userId: CREATOR, asset: StakeAsset.Usdc },
        { userId: JOINER, asset: StakeAsset.Dai },
      ]),
    );
    expect(await stakePotService.availableBalance(CREATOR, StakeAsset.Dai)).toBe(
      DAI_10 - DAI_10 / 20n,
    );
    const balances = dataSource.getRepository(StakedBalanceEntity);
    expect(
      BigInt(
        (await balances.findOneByOrFail({
          userId: JOINER,
          asset: StakeAsset.Dai,
        })).locked,
      ),
    ).toBe(0n);
  });

  it('voids the room and charges nobody when one leg cannot be covered', async () => {
    await fund(CREATOR, StakeAsset.Usdc, USDC_10);
    await fund(JOINER, StakeAsset.Dai, DAI_10 - 1n);

    await expect(service.beginFunding(roomEntity)).rejects.toThrow(
      /could not be secured/,
    );

    expect(
      await stakePotService.availableBalance(CREATOR, StakeAsset.Usdc),
    ).toBe(USDC_10);
    expect(await stakePotService.availableBalance(JOINER, StakeAsset.Dai)).toBe(
      DAI_10 - 1n,
    );
    expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Voided);
  });
});
