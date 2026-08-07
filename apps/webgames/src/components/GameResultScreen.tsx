import { Anchor, ArrowLeft, Trophy, type Icon } from '@phosphor-icons/react';

export type ResultVariant = 'win' | 'lose';

export type ResultStat = {
  value: string;
  label: string;
  /** Render the value in the variant's accent, e.g. hits or ships sunk. */
  highlight?: boolean;
};

type Props = {
  variant: ResultVariant;
  icon?: Icon;
  /** Small uppercase kicker, e.g. "FLEET DESTROYED". */
  eyebrow: string;
  /** Big title, e.g. "VICTORY". */
  title: string;
  message: string;
  opponent?: { initial: string; label: string; name: string };
  stats: ResultStat[];
  onBack: () => void;
  backLabel?: string;
  onPlayAgain?: () => void;
};

/**
 * End-of-match screen, shared by every game. The caller supplies the copy and
 * stats; this owns the layout and the win/lose theming.
 */
export function GameResultScreen({
  variant,
  icon,
  eyebrow,
  title,
  message,
  opponent,
  stats,
  onBack,
  backLabel = 'Back to lobby',
  onPlayAgain,
}: Props) {
  const won = variant === 'win';
  const accent = won ? 'var(--gold)' : 'var(--loss)';
  const Glyph = icon ?? (won ? Trophy : Anchor);

  return (
    <div className={won ? 'result result-win' : 'result result-lose'}>
      <div className="result-glow" />
      <div className="result-card">
        <span className="result-ring" style={{ borderColor: accent }}>
          <Glyph size={40} weight="bold" color={accent} />
        </span>

        <span className="result-eyebrow" style={{ color: accent }}>
          {eyebrow}
        </span>
        <h2 className="result-title">{title}</h2>
        <p className="result-message">{message}</p>

        {opponent && (
          <div className="result-opponent">
            <span className="avatar" style={{ width: 44, height: 44, background: accent }}>
              {opponent.initial}
            </span>
            <div>
              <div className="stat-label">{opponent.label}</div>
              <div className="player-name">{opponent.name}</div>
            </div>
          </div>
        )}

        <div className="result-stats">
          {stats.map(stat => (
            <div key={stat.label} className="result-stat">
              <div
                className="stat-value"
                style={stat.highlight ? { color: accent } : undefined}
              >
                {stat.value}
              </div>
              <div className="stat-label">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="result-actions">
          {onPlayAgain && (
            <button type="button" className="btn btn-surface btn-block btn-lg" onClick={onPlayAgain}>
              Play again
            </button>
          )}
          <button
            type="button"
            className={
              won
                ? 'btn btn-gold btn-block btn-lg'
                : 'btn btn-lime btn-block btn-lg'
            }
            onClick={onBack}
          >
            <ArrowLeft size={18} />
            {backLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
