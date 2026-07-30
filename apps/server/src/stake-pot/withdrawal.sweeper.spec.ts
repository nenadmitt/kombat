import { StakeAsset, StakeWithdrawalStatus } from '@gaming-platform/core';
import { ConflictException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

import { ConfigurationService } from '../configuration/configuration.service';
import { WebsocketsService } from '../websockets/websockets.service';
import { StakeLedgerEntryEntity } from './entities/stake-ledger-entry.entity';
import { StakePotWithdrawalEntity } from './entities/stake-pot-withdrawal.entity';
import { StakedBalanceEntity } from './entities/staked-balance.entity';
import type { StakePotChainService } from './stake-pot-chain.service';
import { StakePotService } from './stake-pot.service';
import { WithdrawalSweeper } from './withdrawal.sweeper';
import {
  createTestDataSource,
  testUserId,
  truncatePotTables,
} from './test/db-harness';

const ALICE = testUserId('alice');
const ASSET = StakeAsset.Usdc;
const AMOUNT = 5_000_000n;
const WALLET = '0x00000000000000000000000000000000000a11ce';

/** Contract stub whose `processedWithdrawals` set is the thing under test. */
function makeChain() {
  const processed = new Set<string>();
  const sends: string[] = [];
  let mode: 'ok' | 'throw' | 'locked' | 'alreadyProcessed' = 'ok';
  let receiptStatus: 'success' | 'reverted' | null = null;

  const chain = {
    enabled: true,
    isWithdrawalProcessed: async (id: string) => processed.has(id),
    getTransactionStatus: async () => receiptStatus,
    isAlreadyProcessedError: (error: unknown) =>
      error instanceof Error && error.message.includes('AlreadyProcessed'),
    withdrawTo: async (args: { withdrawalId: string }) => {
      sends.push(args.withdrawalId);
      if (mode === 'throw') {
        throw new Error('rpc down');
      }
      if (mode === 'locked') {
        throw new ConflictException('operator busy');
      }
      if (mode === 'alreadyProcessed') {
        throw new Error(
          'execution reverted, custom error AlreadyProcessed(bytes32)',
        );
      }
      processed.add(args.withdrawalId);
      return `0xtx-${args.withdrawalId.slice(0, 6)}`;
    },
  } as unknown as StakePotChainService;

  return {
    chain,
    sends,
    processed,
    setMode: (next: typeof mode) => {
      mode = next;
    },
    setReceipt: (next: typeof receiptStatus) => {
      receiptStatus = next;
    },
    /** Pretend a payout landed on-chain without the server recording it. */
    markProcessedBehindOurBack: (id: string) => processed.add(id),
  };
}

describe('WithdrawalSweeper', () => {
  let dataSource: DataSource;
  let service: StakePotService;
  let withdrawals: Repository<StakePotWithdrawalEntity>;
  let balances: Repository<StakedBalanceEntity>;
  let ledger: Repository<StakeLedgerEntryEntity>;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    balances = dataSource.getRepository(StakedBalanceEntity);
    ledger = dataSource.getRepository(StakeLedgerEntryEntity);
    withdrawals = dataSource.getRepository(StakePotWithdrawalEntity);
    service = new StakePotService(
      dataSource,
      balances,
      ledger,
      withdrawals,
      { STAKE_FEE_BPS: 500 } as ConfigurationService,
      { sendToUser: () => undefined } as unknown as WebsocketsService,
    );
  });

  afterAll(async () => {
    await truncatePotTables(dataSource);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await truncatePotTables(dataSource);
  });

  const fund = () =>
    service.credit(ALICE, ASSET, AMOUNT * 4n, { txHash: '0xfund', logIndex: 0 });

  const request = () => service.requestWithdrawal(ALICE, ASSET, AMOUNT, WALLET);

  const statusOf = async (id: string) =>
    (await withdrawals.findOneBy({ id }))!;

  const availableOf = async () =>
    BigInt(
      (await balances.findOneBy({ userId: ALICE, asset: ASSET }))?.available ?? 0,
    );

  it('sends a pending withdrawal and confirms it', async () => {
    await fund();
    const row = await request();
    const harness = makeChain();

    await new WithdrawalSweeper(service, harness.chain).sweep();

    expect(harness.sends).toEqual([row.id]);
    const after = await statusOf(row.id);
    expect(after.status).toBe(StakeWithdrawalStatus.Confirmed);
    expect(after.txHash).toBeTruthy();
  });

  /**
   * The crash window the whole design exists for: the transaction landed but
   * the process died before recording it.
   */
  it('confirms without resending when the payout already happened', async () => {
    await fund();
    const row = await request();
    const harness = makeChain();
    harness.markProcessedBehindOurBack(row.id);

    await new WithdrawalSweeper(service, harness.chain).sweep();

    expect(harness.sends).toEqual([]);
    expect((await statusOf(row.id)).status).toBe(
      StakeWithdrawalStatus.Confirmed,
    );
    // Crucially: no refund, because the user was paid.
    expect(await availableOf()).toBe(AMOUNT * 3n);
  });

  it('treats an AlreadyProcessed revert as confirmation, not failure', async () => {
    await fund();
    const row = await request();
    const harness = makeChain();
    harness.setMode('alreadyProcessed');

    await new WithdrawalSweeper(service, harness.chain).sweep();

    expect((await statusOf(row.id)).status).toBe(
      StakeWithdrawalStatus.Confirmed,
    );
    expect(await availableOf()).toBe(AMOUNT * 3n);
  });

  it('defers rather than burning an attempt when the operator lock is held', async () => {
    await fund();
    const row = await request();
    const harness = makeChain();
    harness.setMode('locked');

    await new WithdrawalSweeper(service, harness.chain).sweep();

    const after = await statusOf(row.id);
    expect(after.status).toBe(StakeWithdrawalStatus.Pending);
    expect(after.attempts).toBe(0);
  });

  it('retries, then gives up and refunds after the attempt cap', async () => {
    await fund();
    const row = await request();
    const harness = makeChain();
    harness.setMode('throw');
    const sweeper = new WithdrawalSweeper(service, harness.chain);

    await sweeper.sweep();
    await sweeper.sweep();
    expect((await statusOf(row.id)).attempts).toBe(2);
    expect(await availableOf()).toBe(AMOUNT * 3n);

    await sweeper.sweep();
    expect((await statusOf(row.id)).status).toBe(StakeWithdrawalStatus.Failed);
    // Terminal failure returns the money rather than leaving it in limbo.
    expect(await availableOf()).toBe(AMOUNT * 4n);

    // A Failed row is terminal - later sweeps must not touch it again.
    await sweeper.sweep();
    expect(await availableOf()).toBe(AMOUNT * 4n);
    expect(
      await ledger.countBy({ userId: ALICE, kind: 7 /* WithdrawalRefund */ }),
    ).toBe(1);
  });

  it('leaves a freshly sent row alone until it goes stale', async () => {
    await fund();
    const row = await request();
    await service.markWithdrawalSent(row.id, '0xinflight');
    const harness = makeChain();

    await new WithdrawalSweeper(service, harness.chain).sweep();

    expect(harness.sends).toEqual([]);
    expect((await statusOf(row.id)).status).toBe(StakeWithdrawalStatus.Sent);
  });

  it('resends a stale sent row that never landed', async () => {
    await fund();
    const row = await request();
    await service.markWithdrawalSent(row.id, '0xdropped');
    await withdrawals.query(
      `UPDATE stake_pot_withdrawals SET updated_at = now() - interval '10 minutes' WHERE id = $1`,
      [row.id],
    );
    const harness = makeChain();
    harness.setReceipt(null); // never mined

    await new WithdrawalSweeper(service, harness.chain).sweep();

    expect(harness.sends).toEqual([row.id]);
    expect((await statusOf(row.id)).status).toBe(
      StakeWithdrawalStatus.Confirmed,
    );
  });

  it('confirms a stale sent row whose payout is recorded on-chain', async () => {
    await fund();
    const row = await request();
    await service.markWithdrawalSent(row.id, '0xlanded');
    await withdrawals.query(
      `UPDATE stake_pot_withdrawals SET updated_at = now() - interval '10 minutes' WHERE id = $1`,
      [row.id],
    );
    const harness = makeChain();
    harness.markProcessedBehindOurBack(row.id);

    await new WithdrawalSweeper(service, harness.chain).sweep();

    expect(harness.sends).toEqual([]);
    expect((await statusOf(row.id)).status).toBe(
      StakeWithdrawalStatus.Confirmed,
    );
  });

  it('never pays the same withdrawal id twice across repeated sweeps', async () => {
    await fund();
    const row = await request();
    const harness = makeChain();
    const sweeper = new WithdrawalSweeper(service, harness.chain);

    await sweeper.sweep();
    await sweeper.sweep();
    await sweeper.sweep();

    expect(harness.sends).toEqual([row.id]);
  });

  it('processes several queued withdrawals in one pass', async () => {
    await fund();
    const first = await request();
    const second = await request();
    const harness = makeChain();

    await new WithdrawalSweeper(service, harness.chain).sweep();

    expect(harness.sends.sort()).toEqual([first.id, second.id].sort());
    expect(await availableOf()).toBe(AMOUNT * 2n);
  });
});
