import {
  ApiError,
  formatStakeAmount,
  parseStakeAmount,
  STAKE_ASSET_SYMBOLS,
  STAKEABLE_ASSETS,
  StakeAsset,
  type StakePotDepositTarget,
  type StakePotHistoryEntry,
  type WalletSummary,
} from '@gaming-platform/core';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Gift,
  QrCode,
  ShieldCheck,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { erc20Abi, formatUnits, type Address } from 'viem';
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { TokenIcon } from '../components/TokenIcon';
import { Field, Segmented, Sheet } from '../components/ui';
import { apiClient } from '../lib/api';
import {
  CHAIN_ID,
  CHAIN_NAME,
  NATIVE_TOKEN,
  STAKE_POT_ABI,
  TOKENS,
} from '../lib/chain';
import { shortAddress } from '../lib/format';
import { usePotStore } from '../store/pot.store';
import { useSessionStore } from '../store/session.store';

type Mode = 'deposit' | 'withdraw';

function trim(value: string): string {
  if (!value.includes('.')) return value;
  const [whole, fraction = ''] = value.split('.');
  const short = fraction.slice(0, 4).replace(/0+$/, '');
  return short ? `${whole}.${short}` : whole!;
}

function useWalletBalances(address: Address | undefined) {
  const erc20s = TOKENS.filter(token => !token.native);
  const native = useBalance({ address, query: { enabled: Boolean(address) } });
  const reads = useReadContracts({
    contracts: erc20s.map(token => ({
      address: token.address as Address,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: address ? [address] : undefined,
    })),
    query: { enabled: Boolean(address) },
  });

  return TOKENS.map(token => {
    if (token.native) {
      return { token, amount: native.data?.value };
    }
    const index = erc20s.indexOf(token);
    const result = reads.data?.[index];
    return {
      token,
      amount: result?.status === 'success' ? (result.result as bigint) : undefined,
    };
  });
}

export function WalletPage() {
  const user = useSessionStore(s => s.user);
  const { address: connectedAddress, chainId } = useAccount();
  // A custodial account has no wagmi connection; its address lives on the server.
  const [custodial, setCustodial] = useState<WalletSummary | null>(null);
  const address = connectedAddress ?? (custodial?.address as Address | undefined);
  const { balances, enabled, refresh } = usePotStore();

  const [target, setTarget] = useState<StakePotDepositTarget | null>(null);
  const [history, setHistory] = useState<StakePotHistoryEntry[]>([]);
  const [mode, setMode] = useState<Mode | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [asset, setAsset] = useState<StakeAsset>(StakeAsset.Usdc);
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const walletBalances = useWalletBalances(address);
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [pendingTx, setPendingTx] = useState<`0x${string}` | undefined>();
  const { isSuccess: depositMined } = useWaitForTransactionReceipt({
    hash: pendingTx,
  });

  useEffect(() => {
    if (!enabled) return;
    apiClient.getStakePotDepositTarget().then(setTarget).catch(() => undefined);
    apiClient.getStakePotHistory(25).then(setHistory).catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    apiClient
      .listWallets()
      .then(wallets => setCustodial(wallets.find(w => w.custodial) ?? null))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!depositMined) return;
    setNotice('Deposit confirmed. Your pot updates within a minute.');
    setPendingTx(undefined);
    setBusy(false);
    setMode(null);
    void refresh();
  }, [depositMined, refresh]);

  if (!enabled) {
    return (
      <div className="page">
        <h1 className="page-title">Wallet</h1>
        <div className="card">
          <span className="card-label">STAKING UNAVAILABLE</span>
          <p style={{ color: 'var(--text-2)', marginTop: 'var(--s-3)' }}>
            This server has no chain configured, so deposits, withdrawals and
            staked matches are switched off. Free matches still work.
          </p>
        </div>
      </div>
    );
  }

  const wrongChain = Boolean(connectedAddress) && chainId !== CHAIN_ID;
  const tokenFor = (a: StakeAsset) =>
    target?.tokens.find(token => token.asset === a)?.address as Address | undefined;

  async function copyAddress() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function deposit() {
    if (!address || !target || !amount) return;
    setBusy(true);
    setError(null);
    try {
      const base = BigInt(parseStakeAmount(amount, asset));
      const token = tokenFor(asset);
      const pot = target.contract as Address;

      if (!token || token.toLowerCase() === NATIVE_TOKEN.toLowerCase()) {
        setPendingTx(
          await writeContractAsync({
            address: pot,
            abi: STAKE_POT_ABI,
            functionName: 'stakeNative',
            args: [address],
            value: base,
          }),
        );
        return;
      }

      const allowance = await publicClient?.readContract({
        address: token,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, pot],
      });
      if ((allowance ?? 0n) < base) {
        const approval = await writeContractAsync({
          address: token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [pot, base],
        });
        await publicClient?.waitForTransactionReceipt({ hash: approval });
      }

      setPendingTx(
        await writeContractAsync({
          address: pot,
          abi: STAKE_POT_ABI,
          functionName: 'stake',
          args: [address, token, base],
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The deposit failed.');
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.withdrawFromStakePot(asset, parseStakeAmount(amount, asset));
      setNotice('Withdrawal queued. It lands once the transaction confirms.');
      setAmount('');
      setMode(null);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The withdrawal failed.');
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    setError(null);
    try {
      // Whole tokens, not base units, unlike every other amount in the API.
      const { amount: granted, symbol } = await apiClient.claimWelcomeBonus();
      setNotice(`Claimed ${granted} ${symbol}.`);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nothing to claim.');
    }
  }

  const totalLocked = STAKEABLE_ASSETS.some(
    a => BigInt(balances.locked[a] ?? '0') > 0n,
  );

  return (
    <div className="page">
      <div className="wallet-head">
        <div>
          <h1 className="page-title">Wallet</h1>
          <div className="wallet-address">
            <span>
              {address
                ? shortAddress(address)
                : custodial === null
                  ? 'Wallet disconnected'
                  : 'Loading your wallet'}
            </span>
            {address && (
              <>
                <button type="button" className="icon-btn" onClick={copyAddress}>
                  <Copy size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setReceiveOpen(true)}
                >
                  <QrCode size={14} />
                </button>
              </>
            )}
          </div>
          {user?.ensName && (
            <div className="wallet-ens">
              <span style={{ fontWeight: 700, color: 'var(--lime-bright)' }}>
                {user.ensName}
              </span>
              <span className="muted">
                your personal ENS name, use it to send funds to your address
              </span>
            </div>
          )}
          {copied && <span className="card-label">ADDRESS COPIED</span>}
        </div>
        <span className="chip">{CHAIN_NAME}</span>
      </div>

      {wrongChain && (
        <div className="banner">Switch your wallet to {CHAIN_NAME}.</div>
      )}
      {notice && <div className="notice">{notice}</div>}
      {error && !mode && <div className="banner">{error}</div>}

      <div className="page-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <div className="rows">
            <div className="row-head wallet-grid">
              <span>ASSET</span>
              <span>IN WALLET</span>
              <span>IN POT</span>
            </div>
            {walletBalances.map(({ token, amount }) => {
              const pot =
                token.stakeAsset !== undefined && token.stakeAsset !== StakeAsset.Native
                  ? formatStakeAmount(
                      balances.available[token.stakeAsset] ?? '0',
                      token.stakeAsset,
                    )
                  : null;
              return (
                <div key={token.symbol} className="row wallet-grid">
                  <span className="row-name">
                    <TokenIcon symbol={token.symbol} size={28} />
                    <span className="asset-label">
                      <span>{token.symbol}</span>
                      <span className="muted asset-name">{token.name}</span>
                    </span>
                  </span>
                  <span className="mono">
                    {address
                      ? amount === undefined
                        ? '...'
                        : trim(formatUnits(amount, token.decimals))
                      : '-'}
                  </span>
                  <span className="mono" style={{ color: 'var(--gold)' }}>
                    {pot ?? '-'}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="wallet-actions">
            <button
              type="button"
              className="btn btn-surface btn-lg"
              onClick={() => setReceiveOpen(true)}
              disabled={!address}
            >
              <ArrowDown size={16} weight="bold" color="var(--lime)" />
              Receive
            </button>
            <button
              type="button"
              className="btn btn-surface btn-lg"
              onClick={() => {
                setMode('deposit');
                setError(null);
              }}
              disabled={!address}
            >
              <ArrowDown size={16} weight="bold" color="var(--gold)" />
              Deposit to pot
            </button>
            <button
              type="button"
              className="btn btn-surface btn-lg"
              onClick={() => {
                setMode('withdraw');
                setError(null);
              }}
            >
              <ArrowUp size={16} weight="bold" color="var(--gold)" />
              Withdraw
            </button>
          </div>

          <div className="card">
            <span className="card-label">RECENT POT ACTIVITY</span>
            {history.length === 0 ? (
              <div className="empty">Nothing here yet.</div>
            ) : (
              <div className="rows" style={{ marginTop: 'var(--s-3)' }}>
                {history.slice(0, 8).map(entry => (
                  <div
                    key={entry.id}
                    className="row"
                    style={{ gridTemplateColumns: '1fr auto' }}
                  >
                    <span className="muted">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                    <span
                      className="mono"
                      style={{
                        color: entry.amount.startsWith('-')
                          ? 'var(--loss)'
                          : 'var(--win)',
                      }}
                    >
                      {formatStakeAmount(entry.amount, entry.asset)}{' '}
                      {STAKE_ASSET_SYMBOLS[entry.asset]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
          <div className="card-gold">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
              <ShieldCheck size={14} weight="fill" color="var(--gold)" />
              <span className="card-label-gold">STAKE POT</span>
            </div>
            <CoinPile />
            <p className="pot-caption">
              Staked matches are paid from this pool, not from your wallet.
              Deposit here first, and withdraw whenever you like.
            </p>
            <div className="rows">
              {STAKEABLE_ASSETS.map(option => (
                <div
                  key={option}
                  className="row"
                  style={{ gridTemplateColumns: '1fr auto' }}
                >
                  <span className="row-name">{STAKE_ASSET_SYMBOLS[option]}</span>
                  <span className="mono" style={{ color: 'var(--gold)' }}>
                    {formatStakeAmount(balances.available[option] ?? '0', option)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--s-3)', marginTop: 'var(--s-4)' }}>
              <button
                type="button"
                className="btn btn-gold btn-block"
                onClick={() => setMode('deposit')}
                disabled={!address}
              >
                Stake
              </button>
              <button
                type="button"
                className="btn btn-outline-gold btn-block"
                onClick={() => setMode('withdraw')}
              >
                Withdraw
              </button>
            </div>
          </div>

          <button type="button" className="card claim-card" onClick={claim}>
            <Gift size={18} color="var(--gold)" />
            <span style={{ fontWeight: 700, fontSize: 13.5 }}>
              Claim welcome KOMBAT
            </span>
          </button>
        </aside>
      </div>

      <Sheet
        open={mode !== null}
        onOpenChange={next => !next && setMode(null)}
        title={mode === 'withdraw' ? 'Withdraw from pot' : 'Deposit to pot'}
        subtitle={
          mode === 'withdraw'
            ? 'Funds always go back to the wallet you signed in with.'
            : 'Move funds into the pot so you can enter staked matches.'
        }
        footer={
          <button
            type="button"
            className="btn btn-gold btn-block btn-lg"
            disabled={busy || !amount || wrongChain}
            onClick={() => (mode === 'withdraw' ? withdraw() : deposit())}
          >
            {busy ? (
              <span className="spinner" />
            ) : mode === 'withdraw' ? (
              'Withdraw'
            ) : (
              'Deposit'
            )}
          </button>
        }
      >
        <Field label="Asset">
          <div className="preset-row">
            {STAKEABLE_ASSETS.map(option => (
              <button
                key={option}
                type="button"
                className={option === asset ? 'preset is-active' : 'preset'}
                onClick={() => setAsset(option)}
              >
                {STAKE_ASSET_SYMBOLS[option]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Amount">
          <input
            className="input"
            value={amount}
            onChange={event => setAmount(event.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            autoFocus
          />
          <span className="muted">
            {mode === 'withdraw' ? 'In pot: ' : 'In pot: '}
            {formatStakeAmount(balances.available[asset] ?? '0', asset)}{' '}
            {STAKE_ASSET_SYMBOLS[asset]}
          </span>
        </Field>

        {error && <div className="banner">{error}</div>}
      </Sheet>

      <Sheet
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        title="Receive"
        subtitle="Send funds to this address on the right network."
      >
        <Field label={CHAIN_NAME}>
          <code className="address-block">{address}</code>
        </Field>
        <button type="button" className="btn btn-surface btn-block" onClick={copyAddress}>
          <Copy size={16} />
          {copied ? 'Copied' : 'Copy address'}
        </button>
        {user?.ensName && (
          <p className="bs-hint">
            Or use your name: <strong>{user.ensName}</strong>
          </p>
        )}
      </Sheet>
    </div>
  );
}

function CoinPile() {
  return (
    <svg
      viewBox="0 0 132 108"
      width="180"
      height="147"
      fill="none"
      aria-hidden
      style={{ alignSelf: 'center', margin: '0 auto' }}
    >
      <ellipse cx="66" cy="99" rx="46" ry="5" fill="var(--gold)" opacity="0.1" />
      <circle cx="24" cy="94" r="6" fill="var(--gold)" opacity="0.85" />
      <circle cx="107" cy="96" r="5" fill="var(--gold)" opacity="0.8" />
      <path
        d="M18,50 C18,44 114,44 114,50 L104,86 C101,96 31,96 28,86 Z"
        fill="#191c2a"
        stroke="rgba(245,184,41,.34)"
        strokeWidth="1.5"
      />
      <ellipse
        cx="66"
        cy="49"
        rx="48"
        ry="9"
        fill="#23273a"
        stroke="rgba(245,184,41,.4)"
        strokeWidth="1.5"
      />
      <ellipse cx="66" cy="50" rx="40" ry="6" fill="#0d1019" opacity="0.85" />
      <circle cx="45" cy="46" r="7.5" fill="var(--gold)" />
      <circle cx="63" cy="48" r="8" fill="var(--gold)" />
      <circle cx="81" cy="46" r="7.5" fill="var(--gold)" />
      <circle cx="54" cy="38" r="7" fill="var(--gold)" />
      <circle cx="72" cy="37" r="7" fill="var(--gold)" />
      <circle cx="63" cy="30" r="6.5" fill="var(--gold)" />
    </svg>
  );
}
