import {
  ApiError,
  formatStakeAmount,
  parseStakeAmount,
  STAKE_ASSET_SYMBOLS,
  STAKEABLE_ASSETS,
  StakeAsset,
  type StakePotDepositTarget,
  type StakePotHistoryEntry,
} from '@gaming-platform/core';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Gift,
  ShieldCheck,
} from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { erc20Abi, type Address } from 'viem';
import {
  useAccount,
  usePublicClient,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';

import { apiClient } from '../lib/api';
import { CHAIN_ID, CHAIN_NAME, NATIVE_TOKEN, STAKE_POT_ABI } from '../lib/chain';
import { shortAddress } from '../lib/format';
import { usePotStore } from '../store/pot.store';
import { useSessionStore } from '../store/session.store';

type Mode = 'deposit' | 'withdraw';

export function WalletPage() {
  const user = useSessionStore(s => s.user);
  const { address, chainId } = useAccount();
  const { balances, enabled, refresh } = usePotStore();

  const [target, setTarget] = useState<StakePotDepositTarget | null>(null);
  const [history, setHistory] = useState<StakePotHistoryEntry[]>([]);
  const [mode, setMode] = useState<Mode>('deposit');
  const [asset, setAsset] = useState<StakeAsset>(StakeAsset.Usdc);
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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
    if (!depositMined) return;
    setNotice('Deposit confirmed on-chain. Your pot updates within a minute.');
    setPendingTx(undefined);
    setBusy(false);
    void refresh();
  }, [depositMined, refresh]);

  if (!enabled) {
    return (
      <div className="page">
        <h1 className="page-title">Wallet</h1>
        <div className="card">
          <span className="card-label">STAKING UNAVAILABLE</span>
          <p style={{ color: 'var(--text-2)', marginTop: 'var(--s-3)' }}>
            The server has no chain configured, so deposits, withdrawals and
            staked matches are switched off. Free matches still work.
          </p>
        </div>
      </div>
    );
  }

  const wrongChain = Boolean(address) && chainId !== CHAIN_ID;
  const tokenFor = (a: StakeAsset) =>
    target?.tokens.find(token => token.asset === a)?.address as
      | Address
      | undefined;

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
    setNotice(null);
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
    setNotice(null);
    try {
      await apiClient.withdrawFromStakePot(asset, parseStakeAmount(amount, asset));
      setNotice('Withdrawal queued. It lands once the transaction confirms.');
      setAmount('');
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'The withdrawal failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    setError(null);
    try {
      // This endpoint reports `amount` in whole tokens, not base units like
      // every other amount in the API - do not run it through formatStakeAmount.
      const { amount: granted, symbol } = await apiClient.claimWelcomeBonus();
      setNotice(`Claimed ${granted} ${symbol}.`);
      await refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Nothing to claim right now.',
      );
    }
  }

  return (
    <div className="page">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 'var(--s-6)',
        }}
      >
        <div>
          <h1 className="page-title">Wallet</h1>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--s-4)',
              marginTop: 'var(--s-4)',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 21 }}>
              {address ? shortAddress(address) : 'Wallet disconnected'}
            </span>
            {address && (
              <button type="button" className="icon-btn" onClick={copyAddress}>
                <Copy size={14} />
              </button>
            )}
          </div>
          {user?.ensName && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--s-2)',
                marginTop: 'var(--s-3)',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--lime-bright)' }}>
                {user.ensName}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                anyone can send you funds using this name
              </span>
            </div>
          )}
          {copied && <div className="card-label">ADDRESS COPIED</div>}
        </div>

        <span className="chip">{CHAIN_NAME}</span>
      </div>

      {wrongChain && (
        <div className="banner">Switch your wallet to {CHAIN_NAME}.</div>
      )}

      <div className="page-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-5)' }}>
          <div className="rows">
            <div className="row-head" style={{ gridTemplateColumns: '1.5fr 1fr 1fr' }}>
              <span>ASSET</span>
              <span>AVAILABLE</span>
              <span>LOCKED</span>
            </div>
            {STAKEABLE_ASSETS.map(option => (
              <div
                key={option}
                className="row"
                style={{ gridTemplateColumns: '1.5fr 1fr 1fr' }}
              >
                <span className="row-name">{STAKE_ASSET_SYMBOLS[option]}</span>
                <span className="mono">
                  {formatStakeAmount(balances.available[option] ?? '0', option)}
                </span>
                <span className="mono" style={{ color: 'var(--text-3)' }}>
                  {formatStakeAmount(balances.locked[option] ?? '0', option)}
                </span>
              </div>
            ))}
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

            <div style={{ display: 'flex', gap: 'var(--s-2)', marginTop: 'var(--s-4)' }}>
              <button
                type="button"
                className={mode === 'deposit' ? 'pill is-active' : 'pill'}
                onClick={() => setMode('deposit')}
              >
                <ArrowDown size={12} weight="bold" /> Deposit
              </button>
              <button
                type="button"
                className={mode === 'withdraw' ? 'pill is-active' : 'pill'}
                onClick={() => setMode('withdraw')}
              >
                <ArrowUp size={12} weight="bold" /> Withdraw
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--s-2)',
                marginTop: 'var(--s-4)',
              }}
            >
              {STAKEABLE_ASSETS.map(option => (
                <button
                  key={option}
                  type="button"
                  className={option === asset ? 'pill is-active' : 'pill'}
                  onClick={() => setAsset(option)}
                >
                  {STAKE_ASSET_SYMBOLS[option]}
                </button>
              ))}
            </div>

            <input
              className="input"
              style={{ marginTop: 'var(--s-4)' }}
              value={amount}
              onChange={event => setAmount(event.target.value)}
              placeholder="0.00"
              inputMode="decimal"
            />

            <button
              type="button"
              className="btn btn-gold btn-block"
              style={{ marginTop: 'var(--s-4)' }}
              disabled={busy || !amount || wrongChain || !address}
              onClick={() => (mode === 'deposit' ? deposit() : withdraw())}
            >
              {busy ? (
                <span className="spinner" />
              ) : mode === 'deposit' ? (
                'Deposit to pot'
              ) : (
                'Withdraw to wallet'
              )}
            </button>

            {mode === 'withdraw' && (
              <p
                style={{
                  margin: 'var(--s-3) 0 0',
                  fontSize: 11.5,
                  color: 'var(--text-3)',
                }}
              >
                Withdrawals always go to the wallet you signed in with.
              </p>
            )}
          </div>

          <button type="button" className="card" onClick={claim}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
              <Gift size={18} color="var(--gold)" />
              <span style={{ fontWeight: 700, fontSize: 13.5 }}>
                Claim welcome KOMBAT
              </span>
            </div>
          </button>

          {notice && <div className="card-label">{notice}</div>}
          {error && <div className="banner">{error}</div>}
        </aside>
      </div>
    </div>
  );
}
