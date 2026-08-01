import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  SettlementStatus,
  GameType,
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

const ASSET = StakeAsset.Usdc;
const STAKE = 10_000_000n;
const CREATOR = testUserId('creator');
const JOINER = testUserId('joiner');
const ROOM = '44444444-4444-4444-8444-444444444444';

/**
 * The recovery half of the settlement state machine: what happens when the
 * process dies between the claim and the ledger write, and the exact ledger
 * rows a settlement leaves behind. The happy paths live in
 * stakes.service.pot.spec.ts.
 */
describe('StakesService (settlement recovery and edges)', () => {
  let dataSource: DataSource;
  let stakePotService: StakePotService;
  let service: StakesService;
  let settlementRows: Map<
    string,
    { status: SettlementStatus; payout?: string | null; fee?: string | null }
  >;
  let roomWinner: string | null;
  let roomStake: bigint;

  const room = (): GameRoomEntity =>
    ({
      id: ROOM,
      userId: CREATOR,
      opponentId: JOINER,
      opponentIds: [],
      gameType: GameType.NavalBattle,
      stakeToken: ASSET,
      stakeAmount: roomStake.toString(),
      winnerUserId: roomWinner,
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
    roomWinner = null;
    roomStake = STAKE;

    const websockets = {
      sendToUser: () => undefined,
    } as unknown as WebsocketsService;
    const config = { STAKE_FEE_BPS: 500, STAKE_MAX: 1000 } as ConfigurationService;

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
        const current =
          settlementRows.get(roomId) ?? { status: SettlementStatus.Funding };
        settlementRows.set(roomId, { ...current, ...patch });
      },
      findMatchSettlementByRoomId: async (roomId: string) => {
        const row = settlementRows.get(roomId);
        return row ? { roomId, ...row } : null;
      },
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
        error: string,
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
        void error;
      },
      completeGameRoom: async () => undefined,
      findGameRoomById: async () => room(),
      findGameRoomByIdFresh: async () => room(),
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

  const fundedRoom = async () => {
    await fund(CREATOR, STAKE);
    await fund(JOINER, STAKE);
    await service.beginFunding(room());
  };

  describe('ledger rows of a settlement', () => {
    it('credits the platform account exactly the fee', async () => {
      await fundedRoom();
      await service.completeMatch(ROOM, CREATOR, 'win');

      const pot = STAKE * 2n;
      const fee = (pot * 500n) / 10_000n;
      expect(
        await stakePotService.availableBalance(PLATFORM_ACCOUNT_ID, ASSET),
      ).toBe(fee);
      expect(settlementRows.get(ROOM)).toMatchObject({
        payout: (pot - fee).toString(),
        fee: fee.toString(),
      });
    });

    it('floors the fee on an indivisible pot, never rounding it up', async () => {
      // pot = 20_000_002, fee = floor(1_000_000.1)
      const odd = STAKE + 1n;
      roomStake = odd;
      await fund(CREATOR, odd);
      await fund(JOINER, odd);
      await service.beginFunding(room());
      await service.completeMatch(ROOM, JOINER, 'win');

      const pot = odd * 2n;
      const fee = 1_000_000n;
      expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(
        pot - fee,
      );
      expect(
        await stakePotService.availableBalance(PLATFORM_ACCOUNT_ID, ASSET),
      ).toBe(fee);
      // Conservation: every unit that left the players arrived somewhere.
      expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(0n);
    });

    it('leaves no locked balance behind after settling', async () => {
      await fundedRoom();
      await service.completeMatch(ROOM, CREATOR, 'win');

      const balances = dataSource.getRepository(StakedBalanceEntity);
      for (const userId of [CREATOR, JOINER]) {
        const row = await balances.findOneByOrFail({ userId, asset: ASSET });
        expect(BigInt(row.locked)).toBe(0n);
      }
    });

    it('leaves no locked balance behind after voiding', async () => {
      await fundedRoom();
      await service.completeMatch(ROOM, null, 'abandoned');

      for (const userId of [CREATOR, JOINER]) {
        expect(await stakePotService.availableBalance(userId, ASSET)).toBe(
          STAKE,
        );
        const row = await dataSource
          .getRepository(StakedBalanceEntity)
          .findOneByOrFail({ userId, asset: ASSET });
        expect(BigInt(row.locked)).toBe(0n);
      }
      expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Voided);
    });
  });

  describe('crash recovery', () => {
    it('hands the claim back when the ledger write fails, and a retry settles once', async () => {
      await fundedRoom();
      const real = stakePotService.settleMatch.bind(stakePotService);
      let failures = 0;
      stakePotService.settleMatch = async (...args) => {
        failures += 1;
        if (failures === 1) {
          throw new Error('db gone');
        }
        return real(...args);
      };

      await expect(service.completeMatch(ROOM, CREATOR, 'win')).rejects.toThrow(
        'db gone',
      );
      expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Funded);

      await service.completeMatch(ROOM, CREATOR, 'win');
      const pot = STAKE * 2n;
      const fee = (pot * 500n) / 10_000n;
      expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(
        pot - fee,
      );
      expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Settled);
    });

    it('recoverSettlement finishes a SettlePending orphan using the recorded winner', async () => {
      await fundedRoom();
      roomWinner = CREATOR;
      settlementRows.set(ROOM, { status: SettlementStatus.SettlePending });

      await service.recoverSettlement(ROOM);

      const pot = STAKE * 2n;
      const fee = (pot * 500n) / 10_000n;
      expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(
        pot - fee,
      );
      expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Settled);
    });

    it('recoverSettlement voids a VoidPending orphan, refunding every hold', async () => {
      await fundedRoom();
      settlementRows.set(ROOM, { status: SettlementStatus.VoidPending });

      await service.recoverSettlement(ROOM);

      for (const userId of [CREATOR, JOINER]) {
        expect(await stakePotService.availableBalance(userId, ASSET)).toBe(
          STAKE,
        );
      }
      expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Voided);
    });

    it('recoverSettlement is a no-op on terminal or missing settlements', async () => {
      await service.recoverSettlement(ROOM);
      expect(settlementRows.get(ROOM)).toBeUndefined();

      await fundedRoom();
      await service.completeMatch(ROOM, CREATOR, 'win');
      const settled = await stakePotService.availableBalance(CREATOR, ASSET);
      await service.recoverSettlement(ROOM);
      expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(
        settled,
      );
    });

    it('refuses to settle a room whose holds never landed, charging nobody', async () => {
      // Crash before holdFromPot: the row says Funding, the ledger has no
      // holds. The claim goes through, but the capture would drive locked
      // negative and the schema's non-negative CHECK rolls the whole
      // settlement back - the constraint, not application code, is the guard.
      settlementRows.set(ROOM, { status: SettlementStatus.Funding });
      await fund(CREATOR, 1n);
      await fund(JOINER, 1n);

      await expect(service.completeMatch(ROOM, CREATOR, 'forfeit')).rejects.toThrow(
        'non_negative',
      );

      expect(await stakePotService.availableBalance(CREATOR, ASSET)).toBe(1n);
      expect(await stakePotService.availableBalance(JOINER, ASSET)).toBe(1n);
      // The claim was handed back, so recovery can still fund and settle.
      expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Funding);
    });

    it('recoverFunding places the missing holds and marks the room Funded', async () => {
      await fund(CREATOR, STAKE);
      await fund(JOINER, STAKE);
      settlementRows.set(ROOM, { status: SettlementStatus.Funding });

      await service.recoverFunding(ROOM);

      expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Funded);
      for (const userId of [CREATOR, JOINER]) {
        expect(await stakePotService.availableBalance(userId, ASSET)).toBe(0n);
      }
    });

    it('recoverFunding is idempotent over an already-funded room', async () => {
      await fundedRoom();
      settlementRows.set(ROOM, { status: SettlementStatus.Funding });

      await service.recoverFunding(ROOM);

      expect(settlementRows.get(ROOM)?.status).toBe(SettlementStatus.Funded);
      const holds = await dataSource
        .getRepository(StakeLedgerEntryEntity)
        .findBy({ roomId: ROOM });
      // One hold per player from the first funding - recovery added nothing.
      expect(holds.filter(e => e.kind === StakeLedgerKind.Hold)).toHaveLength(2);
    });
  });

  describe('gates', () => {
    it('validateStake rejects non-integer amounts', () => {
      for (const bad of ['1.5', '-3', '1e6', '', 'abc', '0x10']) {
        expect(() => service.validateStake(ASSET, bad)).toThrow(
          BadRequestException,
        );
      }
    });

    it('validateStake enforces the per-asset minimum and env maximum', () => {
      expect(() => service.validateStake(ASSET, '999999')).toThrow(
        'Minimum stake not met',
      );
      expect(() => service.validateStake(ASSET, '1000000')).not.toThrow();
      // STAKE_MAX=1000 USDC at 6 decimals.
      expect(() => service.validateStake(ASSET, '1000000000')).not.toThrow();
      expect(() => service.validateStake(ASSET, '1000000001')).toThrow(
        'maximum',
      );
    });

    it('assertRoomPlayable admits only held stakes', async () => {
      const staked = room();
      await expect(service.assertRoomPlayable(staked)).rejects.toThrow(
        ConflictException,
      );

      for (const status of [
        SettlementStatus.Funding,
        SettlementStatus.Failed,
        SettlementStatus.VoidPending,
        SettlementStatus.Voided,
      ]) {
        settlementRows.set(ROOM, { status });
        await expect(service.assertRoomPlayable(staked)).rejects.toThrow(
          ConflictException,
        );
      }

      settlementRows.set(ROOM, { status: SettlementStatus.Funded });
      await expect(service.assertRoomPlayable(staked)).resolves.toBeUndefined();

      const free = { ...staked, stakeToken: null } as GameRoomEntity;
      settlementRows.delete(ROOM);
      await expect(service.assertRoomPlayable(free)).resolves.toBeUndefined();
    });
  });
});
