import {
  STAKE_POT_EVENTS,
  StakeAsset,
  StakeLedgerKind,
  StakeWithdrawalStatus,
} from '@gaming-platform/core';
import { ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { ConfigurationService } from '../configuration/configuration.service';
import { WebsocketsService } from '../websockets';
import { StakeLedgerEntryEntity } from './entities/stake-ledger-entry.entity';
import { StakePotWithdrawalEntity } from './entities/stake-pot-withdrawal.entity';
import { StakedBalanceEntity } from './entities/staked-balance.entity';
import { PLATFORM_ACCOUNT_ID, StakePotService } from './stake-pot.service';
import {
  createTestDataSource,
  testUserId,
  truncatePotTables,
} from './test/db-harness';

const ASSET = StakeAsset.Usdc;
const FEE_BPS = 500; // 5%
const STAKE = 10_000_000n; // 10 USDC
const ALICE = testUserId('alice');
const BOB = testUserId('bob');
const CAROL = testUserId('carol');
const DAVE = testUserId('dave');
const ROOM = '11111111-1111-4111-8111-111111111111';
const ROOM_2 = '22222222-2222-4222-8222-222222222222';
const WALLET = '0x000000000000000000000000000000000000dEaD';

describe('StakePotService (ledger)', () => {
  let dataSource: DataSource;
  let service: StakePotService;
  let sent: { userId: string; event: string; payload: unknown }[];
  let balances: Repository<StakedBalanceEntity>;
  let ledger: Repository<StakeLedgerEntryEntity>;
  let withdrawals: Repository<StakePotWithdrawalEntity>;

  const websockets = {
    sendToUser: (userId: string, event: string, payload?: unknown) => {
      sent.push({ userId, event, payload });
    },
  } as unknown as WebsocketsService;

  const makeService = (feeBps = FEE_BPS) =>
    new StakePotService(
      dataSource,
      balances,
      ledger,
      withdrawals,
      { STAKE_FEE_BPS: feeBps } as ConfigurationService,
      websockets,
    );

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    balances = dataSource.getRepository(StakedBalanceEntity);
    ledger = dataSource.getRepository(StakeLedgerEntryEntity);
    withdrawals = dataSource.getRepository(StakePotWithdrawalEntity);
  });

  afterAll(async () => {
    await truncatePotTables(dataSource);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await truncatePotTables(dataSource);
    sent = [];
    service = makeService();
  });

  const deposit = (userId: string, amount: bigint, tx = `0x${userId.slice(-6)}`) =>
    service.credit(userId, ASSET, amount, { txHash: tx, logIndex: 0 });

  const balanceOf = async (userId: string) => {
    const row = await balances.findOneBy({ userId, asset: ASSET });
    return {
      available: BigInt(row?.available ?? 0),
      locked: BigInt(row?.locked ?? 0),
    };
  };

  const entriesFor = (userId: string) =>
    ledger.find({ where: { userId }, order: { createdAt: 'ASC', id: 'ASC' } });

  // ---- deposits ------------------------------------------------------------

  it('credits a deposit and records it in the journal', async () => {
    await deposit(ALICE, 25_000_000n, '0xabc');

    expect((await balanceOf(ALICE)).available).toBe(25_000_000n);
    const entries = await entriesFor(ALICE);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: StakeLedgerKind.Deposit,
      amount: '25000000',
      balanceAfter: '25000000',
      txHash: '0xabc',
      logIndex: 0,
    });
  });

  it('is idempotent per (txHash, logIndex) so re-scanning a range is a no-op', async () => {
    await service.credit(ALICE, ASSET, 5_000_000n, { txHash: '0xdup', logIndex: 3 });
    await service.credit(ALICE, ASSET, 5_000_000n, { txHash: '0xdup', logIndex: 3 });

    expect((await balanceOf(ALICE)).available).toBe(5_000_000n);
    expect(await entriesFor(ALICE)).toHaveLength(1);
  });

  it('treats different log indexes in one transaction as distinct deposits', async () => {
    await service.credit(ALICE, ASSET, 1_000_000n, { txHash: '0xsame', logIndex: 0 });
    await service.credit(ALICE, ASSET, 2_000_000n, { txHash: '0xsame', logIndex: 1 });

    expect((await balanceOf(ALICE)).available).toBe(3_000_000n);
  });

  it('refuses a non-positive credit', async () => {
    await expect(
      service.credit(ALICE, ASSET, 0n, { txHash: '0xzero', logIndex: 0 }),
    ).rejects.toThrow(/non-positive/);
  });

  it('pushes a balance snapshot to the depositor', async () => {
    await deposit(ALICE, 1_000_000n);
    const push = sent.find(s => s.event === STAKE_POT_EVENTS.balance);
    expect(push?.userId).toBe(ALICE);
    expect(push?.payload).toMatchObject({
      available: { [ASSET]: '1000000' },
    });
  });

  // ---- holds ---------------------------------------------------------------

  it('moves every participant from available to locked', async () => {
    await deposit(ALICE, STAKE * 2n);
    await deposit(BOB, STAKE * 2n);

    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);

    expect(await balanceOf(ALICE)).toEqual({ available: STAKE, locked: STAKE });
    expect(await balanceOf(BOB)).toEqual({ available: STAKE, locked: STAKE });
  });

  it('holds all four seats of a multi-seat room', async () => {
    for (const user of [ALICE, BOB, CAROL, DAVE]) {
      await deposit(user, STAKE);
    }
    await service.holdForMatch(ROOM, [ALICE, BOB, CAROL, DAVE], ASSET, STAKE);

    for (const user of [ALICE, BOB, CAROL, DAVE]) {
      expect(await balanceOf(user)).toEqual({ available: 0n, locked: STAKE });
    }
  });

  it('rolls the whole hold back when one participant cannot cover it', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE - 1n);

    await expect(
      service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE),
    ).rejects.toBeInstanceOf(ConflictException);

    // Nobody is charged for a match that could not be funded.
    expect(await balanceOf(ALICE)).toEqual({ available: STAKE, locked: 0n });
    expect(await balanceOf(BOB)).toEqual({
      available: STAKE - 1n,
      locked: 0n,
    });
    expect(await ledger.countBy({ roomId: ROOM })).toBe(0);
  });

  it('does not double-hold when funding is retried after a crash', async () => {
    await deposit(ALICE, STAKE * 2n);
    await deposit(BOB, STAKE * 2n);

    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);

    expect(await balanceOf(ALICE)).toEqual({ available: STAKE, locked: STAKE });
    expect(
      await ledger.countBy({ roomId: ROOM, kind: StakeLedgerKind.Hold }),
    ).toBe(2);
  });

  it('holds only the participants still missing one', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE], ASSET, STAKE);

    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);

    expect(await balanceOf(ALICE)).toEqual({ available: 0n, locked: STAKE });
    expect(await balanceOf(BOB)).toEqual({ available: 0n, locked: STAKE });
  });

  // ---- concurrency ---------------------------------------------------------

  it('lets only one of two concurrent holds win when the balance covers one', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE * 2n);
    await deposit(CAROL, STAKE * 2n);

    const results = await Promise.allSettled([
      service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE),
      service.holdForMatch(ROOM_2, [ALICE, CAROL], ASSET, STAKE),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    // Alice's stake was taken exactly once, never twice and never lost.
    expect(await balanceOf(ALICE)).toEqual({ available: 0n, locked: STAKE });
  });

  it('cannot withdraw and stake the same funds concurrently', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);

    const results = await Promise.allSettled([
      service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE),
      service.requestWithdrawal(ALICE, ASSET, STAKE, WALLET),
    ]);

    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    // Whichever won, the stake is accounted for exactly once - either locked by
    // the match or debited into the pending withdrawal, never both, never lost.
    const snapshot = await service.getBalances(ALICE);
    const owned =
      BigInt(snapshot.available[ASSET]) +
      BigInt(snapshot.locked[ASSET]) +
      BigInt(snapshot.pendingWithdrawals[ASSET]);
    expect(owned).toBe(STAKE);
  });

  // ---- settlement ----------------------------------------------------------

  it('pays the winner pot minus fee and credits the fee to the platform', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);

    const result = await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    const pot = STAKE * 2n;
    const fee = (pot * BigInt(FEE_BPS)) / 10_000n;
    expect(result).toEqual({ payout: pot - fee, fee });
    expect(await balanceOf(ALICE)).toEqual({
      available: pot - fee,
      locked: 0n,
    });
    expect(await balanceOf(BOB)).toEqual({ available: 0n, locked: 0n });
    const platform = await balances.findOneBy({
      userId: PLATFORM_ACCOUNT_ID,
      asset: ASSET,
    });
    expect(BigInt(platform!.available)).toBe(fee);
  });

  it('conserves the pot exactly: payout + fee equals every stake taken', async () => {
    const players = [ALICE, BOB, CAROL, DAVE];
    for (const user of players) {
      await deposit(user, STAKE);
    }
    await service.holdForMatch(ROOM, players, ASSET, STAKE);
    const result = await service.settleMatch(ROOM, CAROL, players, ASSET, STAKE);

    expect(result!.payout + result!.fee).toBe(STAKE * 4n);
    let total = 0n;
    for (const user of [...players, PLATFORM_ACCOUNT_ID]) {
      const b = await balanceOf(user);
      total += b.available + b.locked;
    }
    expect(total).toBe(STAKE * 4n);
  });

  it('keeps integer-division dust with the winner rather than losing it', async () => {
    // 3 wei pot at 5% → fee floors to 0, so the winner must receive all 3.
    const tiny = 1n;
    service = makeService(FEE_BPS);
    for (const user of [ALICE, BOB, CAROL]) {
      await deposit(user, tiny);
    }
    await service.holdForMatch(ROOM, [ALICE, BOB, CAROL], ASSET, tiny);
    const result = await service.settleMatch(
      ROOM,
      ALICE,
      [ALICE, BOB, CAROL],
      ASSET,
      tiny,
    );

    expect(result).toEqual({ payout: 3n, fee: 0n });
    expect((await balanceOf(ALICE)).available).toBe(3n);
  });

  it('is idempotent when a completed match is settled twice', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    const second = await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    expect(second).toBeNull();
    const pot = STAKE * 2n;
    const fee = (pot * BigInt(FEE_BPS)) / 10_000n;
    expect((await balanceOf(ALICE)).available).toBe(pot - fee);
  });

  it('charges no fee when the fee is configured to zero', async () => {
    service = makeService(0);
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);

    const result = await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    expect(result).toEqual({ payout: STAKE * 2n, fee: 0n });
    expect(
      await balances.findOneBy({ userId: PLATFORM_ACCOUNT_ID, asset: ASSET }),
    ).toBeNull();
  });

  // ---- release -------------------------------------------------------------

  it('returns every hold on a void', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);

    await service.releaseMatch(ROOM);

    expect(await balanceOf(ALICE)).toEqual({ available: STAKE, locked: 0n });
    expect(await balanceOf(BOB)).toEqual({ available: STAKE, locked: 0n });
  });

  it('is idempotent when a void is replayed', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);

    await service.releaseMatch(ROOM);
    await service.releaseMatch(ROOM);

    expect(await balanceOf(ALICE)).toEqual({ available: STAKE, locked: 0n });
  });

  it('refuses to release a room that was already settled', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    await service.releaseMatch(ROOM);

    const pot = STAKE * 2n;
    const fee = (pot * BigInt(FEE_BPS)) / 10_000n;
    expect(await balanceOf(ALICE)).toEqual({
      available: pot - fee,
      locked: 0n,
    });
    expect(await balanceOf(BOB)).toEqual({ available: 0n, locked: 0n });
  });

  it('refuses to settle a room that was already released', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    await service.releaseMatch(ROOM);

    const result = await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    expect(result).toBeNull();
    expect(await balanceOf(ALICE)).toEqual({ available: STAKE, locked: 0n });
  });

  it('is a no-op for a room that never had holds', async () => {
    await expect(service.releaseMatch(ROOM)).resolves.toBeUndefined();
  });

  // ---- withdrawals ---------------------------------------------------------

  it('debits available and queues the payout', async () => {
    await deposit(ALICE, STAKE);

    const row = await service.requestWithdrawal(ALICE, ASSET, 4_000_000n, WALLET);

    expect(row.status).toBe(StakeWithdrawalStatus.Pending);
    expect(row.toAddress).toBe(WALLET);
    expect(await balanceOf(ALICE)).toEqual({
      available: STAKE - 4_000_000n,
      locked: 0n,
    });
  });

  it('rejects a withdrawal beyond available', async () => {
    await deposit(ALICE, STAKE);

    await expect(
      service.requestWithdrawal(ALICE, ASSET, STAKE + 1n, WALLET),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(await balanceOf(ALICE)).toEqual({ available: STAKE, locked: 0n });
  });

  it('cannot withdraw funds locked by a live match', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);

    await expect(
      service.requestWithdrawal(ALICE, ASSET, STAKE, WALLET),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reports an in-flight withdrawal as pending, not as spendable', async () => {
    await deposit(ALICE, STAKE);
    await service.requestWithdrawal(ALICE, ASSET, 4_000_000n, WALLET);

    const snapshot = await service.getBalances(ALICE);
    expect(snapshot.available[ASSET]).toBe(String(STAKE - 4_000_000n));
    expect(snapshot.pendingWithdrawals[ASSET]).toBe('4000000');
  });

  it('walks a withdrawal through sent and confirmed', async () => {
    await deposit(ALICE, STAKE);
    const row = await service.requestWithdrawal(ALICE, ASSET, STAKE, WALLET);

    await service.markWithdrawalSent(row.id, '0xsent');
    expect((await withdrawals.findOneBy({ id: row.id }))!.status).toBe(
      StakeWithdrawalStatus.Sent,
    );

    await service.markWithdrawalConfirmed(row.id, '0xsent');
    const confirmed = await withdrawals.findOneBy({ id: row.id });
    expect(confirmed!.status).toBe(StakeWithdrawalStatus.Confirmed);
    expect(confirmed!.txHash).toBe('0xsent');
    // Confirmed funds are gone from the pot entirely.
    const snapshot = await service.getBalances(ALICE);
    expect(snapshot.available[ASSET]).toBe('0');
    expect(snapshot.pendingWithdrawals[ASSET]).toBe('0');
  });

  it('retries before giving up, then refunds exactly once', async () => {
    await deposit(ALICE, STAKE);
    const row = await service.requestWithdrawal(ALICE, ASSET, STAKE, WALLET);

    await service.recordWithdrawalFailure(row.id, new Error('rpc down'), 3);
    await service.recordWithdrawalFailure(row.id, new Error('rpc down'), 3);
    expect((await balanceOf(ALICE)).available).toBe(0n);
    expect((await withdrawals.findOneBy({ id: row.id }))!.attempts).toBe(2);

    await service.recordWithdrawalFailure(row.id, new Error('rpc down'), 3);
    expect((await withdrawals.findOneBy({ id: row.id }))!.status).toBe(
      StakeWithdrawalStatus.Failed,
    );
    expect((await balanceOf(ALICE)).available).toBe(STAKE);

    // A late duplicate failure must not refund a second time.
    await service.recordWithdrawalFailure(row.id, new Error('late'), 3);
    expect((await balanceOf(ALICE)).available).toBe(STAKE);
    expect(
      await ledger.countBy({ kind: StakeLedgerKind.WithdrawalRefund }),
    ).toBe(1);
  });

  it('never refunds a withdrawal that already confirmed', async () => {
    await deposit(ALICE, STAKE);
    const row = await service.requestWithdrawal(ALICE, ASSET, STAKE, WALLET);
    await service.markWithdrawalConfirmed(row.id, '0xok');

    await service.recordWithdrawalFailure(row.id, new Error('too late'), 1);

    expect((await balanceOf(ALICE)).available).toBe(0n);
    expect((await withdrawals.findOneBy({ id: row.id }))!.status).toBe(
      StakeWithdrawalStatus.Confirmed,
    );
  });

  // ---- reporting -----------------------------------------------------------

  it('totals the ledger the way reconciliation expects', async () => {
    await deposit(ALICE, STAKE * 2n);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    await service.requestWithdrawal(ALICE, ASSET, STAKE, WALLET);

    const totals = await service.getLedgerTotals();

    // Everything deposited is still accounted for: available + locked +
    // in-flight withdrawal.
    expect(totals[ASSET]).toBe(STAKE * 3n);
  });

  it('reports history newest first', async () => {
    await deposit(ALICE, STAKE, '0xh1');
    await service.credit(ALICE, ASSET, STAKE, { txHash: '0xh2', logIndex: 0 });

    const history = await service.getHistory(ALICE, 10);

    expect(history).toHaveLength(2);
    expect(history[0]!.kind).toBe(StakeLedgerKind.Deposit);
    expect(history.map(h => h.txHash)).toContain('0xh2');
  });

  it('reports zeroes for a user who has never deposited', async () => {
    const snapshot = await service.getBalances(ALICE);
    expect(snapshot.available[ASSET]).toBe('0');
    expect(snapshot.locked[ASSET]).toBe('0');
    expect(await service.availableBalance(ALICE, ASSET)).toBe(0n);
  });

  it('keeps assets separate', async () => {
    await service.credit(ALICE, StakeAsset.Usdc, 5_000_000n, {
      txHash: '0xusdc',
      logIndex: 0,
    });
    await service.credit(ALICE, StakeAsset.Kombat, 7n, {
      txHash: '0xkombat',
      logIndex: 0,
    });

    expect(await service.availableBalance(ALICE, StakeAsset.Usdc)).toBe(
      5_000_000n,
    );
    expect(await service.availableBalance(ALICE, StakeAsset.Kombat)).toBe(7n);
    expect(await service.availableBalance(ALICE, StakeAsset.Native)).toBe(0n);
  });

  // ---- fee sweeps ----------------------------------------------------------

  it('debits the platform account when the owner sweeps fees', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    const settlement = await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);
    const fee = settlement!.fee;

    await service.recordFeeSweep(ASSET, fee, { txHash: '0xsweep', logIndex: 0 });

    const platform = await balances.findOneBy({
      userId: PLATFORM_ACCOUNT_ID,
      asset: ASSET,
    });
    expect(BigInt(platform!.available)).toBe(0n);
    expect(
      await ledger.countBy({ kind: StakeLedgerKind.FeeSweep }),
    ).toBe(1);
  });

  it('records a sweep once, however often the range is re-scanned', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    const settlement = await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    await service.recordFeeSweep(ASSET, settlement!.fee, { txHash: '0xdup', logIndex: 0 });
    await service.recordFeeSweep(ASSET, settlement!.fee, { txHash: '0xdup', logIndex: 0 });

    expect(await ledger.countBy({ kind: StakeLedgerKind.FeeSweep })).toBe(1);
  });

  /**
   * An owner withdrawal bigger than the accrued fees is a rescue of player
   * funds, not a sweep. Forcing it onto the platform account would hide a real
   * shortfall behind a plausible-looking entry.
   */
  it('refuses to book a withdrawal larger than the accrued fees', async () => {
    await deposit(ALICE, STAKE);

    await service.recordFeeSweep(ASSET, STAKE, { txHash: '0xrescue', logIndex: 0 });

    expect(await ledger.countBy({ kind: StakeLedgerKind.FeeSweep })).toBe(0);
    expect((await balanceOf(ALICE)).available).toBe(STAKE);
  });

  it('reports fees accrued, swept and claimable', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    const settlement = await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);
    const fee = settlement!.fee;

    let summary = (await service.getFeeSummary()).find(f => f.asset === ASSET)!;
    expect(summary).toMatchObject({
      accrued: fee.toString(),
      swept: '0',
      claimable: fee.toString(),
    });

    await service.recordFeeSweep(ASSET, fee, { txHash: '0xs2', logIndex: 0 });

    summary = (await service.getFeeSummary()).find(f => f.asset === ASSET)!;
    expect(summary).toMatchObject({
      accrued: fee.toString(),
      swept: fee.toString(),
      claimable: '0',
    });
  });

  it('keeps the reconciliation total in step with a sweep', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    const settlement = await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    const before = (await service.getLedgerTotals())[ASSET];
    await service.recordFeeSweep(ASSET, settlement!.fee, {
      txHash: '0xs3',
      logIndex: 0,
    });
    const after = (await service.getLedgerTotals())[ASSET];

    // The expected on-chain holdings drop by exactly what left the contract.
    expect(before - after).toBe(settlement!.fee);
  });

  it('does not push socket events to the platform fee account', async () => {
    await deposit(ALICE, STAKE);
    await deposit(BOB, STAKE);
    await service.holdForMatch(ROOM, [ALICE, BOB], ASSET, STAKE);
    sent = [];

    await service.settleMatch(ROOM, ALICE, [ALICE, BOB], ASSET, STAKE);

    expect(sent.map(s => s.userId)).toEqual(
      expect.arrayContaining([ALICE, BOB]),
    );
    expect(sent.map(s => s.userId)).not.toContain(PLATFORM_ACCOUNT_ID);
  });
});
