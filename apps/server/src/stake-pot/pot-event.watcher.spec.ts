import { StakeAsset, StakeLedgerKind } from '@gaming-platform/core';
import { DataSource, Repository } from 'typeorm';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db/db.service';
import { WebsocketsService } from '../websockets/websockets.service';
import { PotEventWatcher } from './pot-event.watcher';
import { StakeLedgerEntryEntity } from './entities/stake-ledger-entry.entity';
import { StakePotCursorEntity } from './entities/stake-pot-cursor.entity';
import { StakePotWithdrawalEntity } from './entities/stake-pot-withdrawal.entity';
import { StakedBalanceEntity } from './entities/staked-balance.entity';
import type {
  PotWithdrawal,
  StakePotChainService,
  StakedDeposit,
} from './stake-pot-chain.service';
import { PLATFORM_ACCOUNT_ID, StakePotService } from './stake-pot.service';
import {
  createTestDataSource,
  testUserId,
  truncatePotTables,
} from './test/db-harness';

const ALICE = testUserId('alice');
const ALICE_ADDRESS = '0x00000000000000000000000000000000000a11ce';
const STRANGER_ADDRESS = '0x00000000000000000000000000000000deadbeef';
const CONFIRMATIONS = 3;

/** Chain stub: a fixed head plus logs the test places at chosen blocks. */
function makeChain(head: bigint) {
  const logs: StakedDeposit[] = [];
  const withdrawnLogs: (PotWithdrawal & { blockNumber: bigint })[] = [];
  const rangesQueried: [bigint, bigint][] = [];
  let failNext = false;

  const chain = {
    enabled: true,
    getLatestBlock: async () => head,
    getDeposits: async (from: bigint, to: bigint) => {
      if (failNext) {
        failNext = false;
        throw new Error('rpc exploded');
      }
      rangesQueried.push([from, to]);
      return logs.filter(l => l.blockNumber >= from && l.blockNumber <= to);
    },
    getWithdrawals: async (from: bigint, to: bigint) =>
      withdrawnLogs.filter(l => l.blockNumber >= from && l.blockNumber <= to),
  } as unknown as StakePotChainService;

  return {
    chain,
    rangesQueried,
    addLog: (deposit: StakedDeposit) => logs.push(deposit),
    addWithdrawn: (w: PotWithdrawal & { blockNumber: bigint }) =>
      withdrawnLogs.push(w),
    failOnce: () => {
      failNext = true;
    },
    setHead: (next: bigint) => {
      head = next;
    },
  };
}

function deposit(
  overrides: Partial<StakedDeposit> & Pick<StakedDeposit, 'blockNumber'>,
): StakedDeposit {
  return {
    beneficiary: ALICE_ADDRESS as StakedDeposit['beneficiary'],
    asset: StakeAsset.Usdc,
    value: 1_000_000n,
    txHash: '0xdep' as StakedDeposit['txHash'],
    logIndex: 0,
    ...overrides,
  };
}

describe('PotEventWatcher', () => {
  let dataSource: DataSource;
  let cursors: Repository<StakePotCursorEntity>;
  let ledger: Repository<StakeLedgerEntryEntity>;
  let stakePotService: StakePotService;

  const wallets: Record<string, string> = {
    [ALICE_ADDRESS.toLowerCase()]: ALICE,
  };
  const dbService = {
    findWalletByAddress: async (address: string) => {
      const userId = wallets[address.toLowerCase()];
      return userId ? { userId, address } : null;
    },
  } as unknown as DbService;

  const config = (deployBlock?: number) =>
    ({
      CHAIN_CONFIRMATIONS: CONFIRMATIONS,
      STAKE_POT_POLL_MS: 5_000,
      STAKE_POT_DEPLOY_BLOCK: deployBlock,
      STAKE_FEE_BPS: 500,
    }) as ConfigurationService;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    cursors = dataSource.getRepository(StakePotCursorEntity);
    ledger = dataSource.getRepository(StakeLedgerEntryEntity);
    stakePotService = new StakePotService(
      dataSource,
      dataSource.getRepository(StakedBalanceEntity),
      ledger,
      dataSource.getRepository(StakePotWithdrawalEntity),
      config(),
      { sendToUser: () => undefined } as unknown as WebsocketsService,
    );
  });

  afterAll(async () => {
    // Leave no cursor behind. These tests use fake block numbers, and the
    // suite shares the app's database - a stale cursor of e.g. 97 would send a
    // real watcher scanning from genesis. With no row it re-initialises from
    // STAKE_POT_DEPLOY_BLOCK, which is correct.
    await truncatePotTables(dataSource);
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await truncatePotTables(dataSource);
  });

  const makeWatcher = (chain: StakePotChainService, deployBlock?: number) =>
    new PotEventWatcher(
      cursors,
      chain,
      stakePotService,
      dbService,
      config(deployBlock),
    );

  const cursor = async () => {
    const row = await cursors.findOneBy({ id: 1 });
    return row ? BigInt(row.lastScannedBlock) : null;
  };

  it('credits a deposit once and advances the cursor to the safe head', async () => {
    const harness = makeChain(100n);
    harness.addLog(deposit({ blockNumber: 90n, txHash: '0xa' as `0x${string}` }));

    await makeWatcher(harness.chain, 80).scan();

    expect(await stakePotService.availableBalance(ALICE, StakeAsset.Usdc)).toBe(
      1_000_000n,
    );
    expect(await cursor()).toBe(100n - BigInt(CONFIRMATIONS));
  });

  it('does not read blocks inside the confirmation lag', async () => {
    const harness = makeChain(100n);
    // Block 99 is above the safe head (100 − 3 = 97): a reorg could still
    // remove it, so crediting now could invent money.
    harness.addLog(deposit({ blockNumber: 99n, txHash: '0xfresh' as `0x${string}` }));

    await makeWatcher(harness.chain, 90).scan();

    expect(await stakePotService.availableBalance(ALICE, StakeAsset.Usdc)).toBe(0n);
    expect(harness.rangesQueried.at(-1)![1]).toBe(97n);
  });

  it('credits a log only once when its range is re-scanned', async () => {
    const harness = makeChain(100n);
    harness.addLog(deposit({ blockNumber: 90n, txHash: '0xrepeat' as `0x${string}` }));

    await makeWatcher(harness.chain, 80).scan();
    // Simulate a crash that lost the cursor advance.
    await cursors.update({ id: 1 }, { lastScannedBlock: '80' });
    await makeWatcher(harness.chain, 80).scan();

    expect(await stakePotService.availableBalance(ALICE, StakeAsset.Usdc)).toBe(
      1_000_000n,
    );
    expect(await ledger.count()).toBe(1);
  });

  it('skips a deposit for an address the platform does not know', async () => {
    const harness = makeChain(100n);
    harness.addLog(
      deposit({
        blockNumber: 90n,
        beneficiary: STRANGER_ADDRESS as StakedDeposit['beneficiary'],
        txHash: '0xstranger' as `0x${string}`,
      }),
    );

    await makeWatcher(harness.chain, 80).scan();

    // Nothing credited, but the cursor still moves - the funds are pooled and
    // unattributed, which is reconciliation's problem, not the watcher's.
    expect(await ledger.count()).toBe(0);
    expect(await cursor()).toBe(97n);
  });

  it('matches a beneficiary address case-insensitively', async () => {
    const harness = makeChain(100n);
    harness.addLog(
      deposit({
        blockNumber: 90n,
        beneficiary: ALICE_ADDRESS.toUpperCase().replace(
          '0X',
          '0x',
        ) as StakedDeposit['beneficiary'],
        txHash: '0xcase' as `0x${string}`,
      }),
    );

    await makeWatcher(harness.chain, 80).scan();

    expect(await stakePotService.availableBalance(ALICE, StakeAsset.Usdc)).toBe(
      1_000_000n,
    );
  });

  it('leaves the cursor untouched when the RPC fails, and retries next tick', async () => {
    const harness = makeChain(100n);
    harness.addLog(deposit({ blockNumber: 90n, txHash: '0xretry' as `0x${string}` }));
    const watcher = makeWatcher(harness.chain, 80);

    harness.failOnce();
    await watcher.scan();
    expect(await cursor()).toBe(79n); // initialised, never advanced
    expect(await ledger.count()).toBe(0);

    await watcher.scan();
    expect(await stakePotService.availableBalance(ALICE, StakeAsset.Usdc)).toBe(
      1_000_000n,
    );
    expect(await cursor()).toBe(97n);
  });

  it('credits several logs from one transaction', async () => {
    const harness = makeChain(100n);
    harness.addLog(
      deposit({ blockNumber: 90n, txHash: '0xmulti' as `0x${string}`, logIndex: 0 }),
    );
    harness.addLog(
      deposit({
        blockNumber: 90n,
        txHash: '0xmulti' as `0x${string}`,
        logIndex: 1,
        value: 2_000_000n,
      }),
    );

    await makeWatcher(harness.chain, 80).scan();

    expect(await stakePotService.availableBalance(ALICE, StakeAsset.Usdc)).toBe(
      3_000_000n,
    );
  });

  it('chunks a long catch-up range instead of asking for it all at once', async () => {
    const harness = makeChain(10_000n);

    await makeWatcher(harness.chain, 1).scan();

    expect(harness.rangesQueried.length).toBeGreaterThan(1);
    for (const [from, to] of harness.rangesQueried) {
      expect(to - from).toBeLessThan(2_000n);
    }
    expect(await cursor()).toBe(9_997n);
  });

  it('starts at the current head when no deploy block is configured', async () => {
    const harness = makeChain(500n);
    harness.addLog(deposit({ blockNumber: 100n, txHash: '0xold' as `0x${string}` }));

    await makeWatcher(harness.chain, undefined).scan();

    // Historical deposits are deliberately not backfilled without the env var.
    expect(await ledger.count()).toBe(0);
    expect(await cursor()).toBe(499n);
  });

  it('does nothing when the chain has not advanced past the cursor', async () => {
    const harness = makeChain(100n);
    const watcher = makeWatcher(harness.chain, 80);
    await watcher.scan();
    const before = harness.rangesQueried.length;

    await watcher.scan();

    expect(harness.rangesQueried.length).toBe(before);
  });

  // ---- owner fee sweeps ----------------------------------------------------

  /**
   * `ownerWithdrawTo` never touches the server, so without this the ledger keeps
   * claiming fees the pot no longer holds and reconciliation reports a permanent
   * shortfall.
   */
  it('records an owner sweep as a fee sweep', async () => {
    const harness = makeChain(100n);
    // Give the platform account some accrued fees to sweep against.
    await stakePotService.credit(PLATFORM_ACCOUNT_ID, StakeAsset.Usdc, 500_000n, {
      txHash: '0xfees',
      logIndex: 0,
    });
    harness.addWithdrawn({
      blockNumber: 90n,
      withdrawalId: null, // not minted by this server
      to: ALICE_ADDRESS as `0x${string}`,
      asset: StakeAsset.Usdc,
      value: 500_000n,
      txHash: '0xownersweep' as `0x${string}`,
      logIndex: 0,
    });

    await makeWatcher(harness.chain, 80).scan();

    expect(
      await stakePotService.availableBalance(PLATFORM_ACCOUNT_ID, StakeAsset.Usdc),
    ).toBe(0n);
    expect(await ledger.countBy({ kind: StakeLedgerKind.FeeSweep })).toBe(1);
  });

  it('leaves a withdrawal this server minted alone', async () => {
    const harness = makeChain(100n);
    await stakePotService.credit(PLATFORM_ACCOUNT_ID, StakeAsset.Usdc, 500_000n, {
      txHash: '0xfees2',
      logIndex: 0,
    });
    harness.addWithdrawn({
      blockNumber: 90n,
      // A real withdrawal row id: already debited at request time.
      withdrawalId: '019fafe8-4741-76c5-ad43-0b919261bc32',
      to: ALICE_ADDRESS as `0x${string}`,
      asset: StakeAsset.Usdc,
      value: 500_000n,
      txHash: '0xplayerpayout' as `0x${string}`,
      logIndex: 0,
    });

    await makeWatcher(harness.chain, 80).scan();

    expect(
      await stakePotService.availableBalance(PLATFORM_ACCOUNT_ID, StakeAsset.Usdc),
    ).toBe(500_000n);
    expect(await ledger.countBy({ kind: StakeLedgerKind.FeeSweep })).toBe(0);
  });
});
