import {
  formatStakeAmount,
  StakeAsset,
  STAKE_ASSET_SYMBOLS,
  STAKEABLE_ASSETS,
} from '@gaming-platform/core';
import { ShieldCheck } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

import { usePotStore } from '../store/pot.store';

/** The rail's stake-pot summary: headline asset plus the two money actions. */
export function PotCard() {
  const navigate = useNavigate();
  const { balances, enabled } = usePotStore();

  const headline = STAKEABLE_ASSETS.reduce(
    (best, asset) =>
      BigInt(balances.available[asset] ?? '0') >
      BigInt(balances.available[best] ?? '0')
        ? asset
        : best,
    StakeAsset.Usdc,
  );

  return (
    <div className="card-gold">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
        <ShieldCheck size={13} weight="fill" color="var(--gold)" />
        <span className="card-label-gold">STAKE POT</span>
      </div>
      <div
        style={{
          marginTop: 'var(--s-3)',
          fontWeight: 800,
          fontSize: 26,
          lineHeight: 1,
          letterSpacing: '-0.03em',
          color: 'var(--gold)',
        }}
      >
        {enabled
          ? formatStakeAmount(balances.available[headline] ?? '0', headline)
          : '--'}
        <span style={{ fontSize: 12, marginLeft: 'var(--s-1)' }}>
          {STAKE_ASSET_SYMBOLS[headline]}
        </span>
      </div>
      {/* Stacked: side by side, "Withdraw" cannot shrink below its label and
          spills out of the rail. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-2)',
          marginTop: 'var(--s-4)',
        }}
      >
        <button
          type="button"
          className="btn btn-gold btn-block"
          onClick={() => navigate('/wallet')}
          disabled={!enabled}
        >
          Stake
        </button>
        <button
          type="button"
          className="btn btn-outline-gold btn-block"
          onClick={() => navigate('/wallet')}
          disabled={!enabled}
        >
          Withdraw
        </button>
      </div>
    </div>
  );
}
