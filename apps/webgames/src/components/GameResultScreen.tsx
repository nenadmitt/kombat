import { Anchor, ArrowLeft, CheckCircle, Play, Trophy, type Icon } from '@phosphor-icons/react';

import type { ResultSettlement } from '../games/use-result-data';

export type ResultVariant = 'win' | 'lose';

export type ResultStat = {
  value: string;
  label: string;
  highlight?: boolean;
};

export type ResultMeter = {
  label: string;
  percent: number;
  accent?: boolean;
};

type Props = {
  variant: ResultVariant;
  icon?: Icon;
  eyebrow: string;
  title: string;
  message: string;
  opponent?: { initial: string; label: string; name: string };
  stats: ResultStat[];
  meters?: ResultMeter[];
  settlement?: ResultSettlement | null;
  onBack: () => void;
  backLabel?: string;
  onPlayAgain?: () => void;
};

export function GameResultScreen({
  variant,
  icon,
  eyebrow,
  title,
  message,
  opponent,
  stats,
  meters,
  settlement,
  onBack,
  backLabel = 'Back to lobby',
  onPlayAgain,
}: Props) {
  const won = variant === 'win';
  const Glyph = icon ?? (won ? Trophy : Anchor);

  return (
    <div className={won ? 'result result-win' : 'result result-lose'}>
      <div className={settlement ? 'result-card has-settle' : 'result-card'}>
        <div className="result-main">
          <div className="result-head">
            <span className="result-badge">
              <Glyph size={26} weight="fill" />
            </span>
            <div className="result-head-text">
              <span className="result-eyebrow">{eyebrow}</span>
              <h2 className="result-title">{title}</h2>
            </div>
          </div>

          <p className="result-message">{message}</p>

          {opponent && (
            <div className="result-opponent">
              <span className="result-opponent-avatar">{opponent.initial}</span>
              <div className="result-opponent-meta">
                <span className="result-opponent-label">{opponent.label}</span>
                <span className="result-opponent-name">{opponent.name}</span>
              </div>
            </div>
          )}

          <div className="result-stats">
            {stats.map(stat => (
              <div key={stat.label} className="result-stat">
                <span
                  className={
                    stat.highlight ? 'result-stat-value is-accent' : 'result-stat-value'
                  }
                >
                  {stat.value}
                </span>
                <span className="result-stat-label">{stat.label}</span>
              </div>
            ))}
          </div>

          {meters && meters.length > 0 && (
            <div className="result-meters">
              {meters.map(meter => (
                <div key={meter.label} className="result-meter">
                  <div className="result-meter-head">
                    <span className="result-meter-label">{meter.label}</span>
                    <span
                      className={
                        meter.accent
                          ? 'result-meter-value is-accent'
                          : 'result-meter-value'
                      }
                    >
                      {meter.percent}%
                    </span>
                  </div>
                  <div className="result-meter-track">
                    <span
                      className={
                        meter.accent ? 'result-meter-fill is-accent' : 'result-meter-fill'
                      }
                      style={{ width: `${Math.min(100, Math.max(0, meter.percent))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {settlement && (
          <div className="result-settle">
            <span className="result-settle-eyebrow">{settlement.eyebrow}</span>
            <span className="result-settle-delta">{settlement.delta}</span>
            <span className="result-settle-symbol">{settlement.symbol}</span>

            <div className="result-settle-rows">
              {settlement.rows.map(row => (
                <div key={row.label} className="result-settle-row">
                  <span className="result-settle-row-label">{row.label}</span>
                  <span className="result-settle-row-value">{row.value}</span>
                </div>
              ))}
            </div>

            {settlement.potNow && (
              <div className="result-settle-pot">
                <span className="result-settle-pot-label">POT NOW</span>
                <span className="result-settle-pot-value">{settlement.potNow}</span>
              </div>
            )}

            <div className="result-settle-note">
              <CheckCircle size={14} weight="fill" color="var(--win)" />
              Settled on-chain
            </div>
          </div>
        )}

        <div className="result-actions">
          {onPlayAgain && (
            <button
              type="button"
              className={won ? 'btn btn-gold btn-lg' : 'btn btn-loss btn-lg'}
              onClick={onPlayAgain}
            >
              <Play size={16} weight="fill" />
              {settlement ? `Play again · ${settlement.stakeLabel}` : 'Play again'}
            </button>
          )}
          <button type="button" className="btn btn-surface btn-lg" onClick={onBack}>
            <ArrowLeft size={16} />
            {backLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
