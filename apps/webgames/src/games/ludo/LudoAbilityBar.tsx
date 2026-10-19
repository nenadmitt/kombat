import {
  ABILITY_COST_HP,
  ABILITY_MAX_USES,
  CHARGE_MAX_HP,
  formatChargePoints,
  LAUNCH_DISTANCE,
  type LudoAbilityKind,
} from '@gaming-platform/core';
import {
  CaretDoubleUp,
  Lightning,
  RocketLaunch,
  Shield,
  Sparkle,
  Spiral,
  type Icon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import { ABILITY_COLORS, ABILITY_LABELS } from './ludo-theme';

export type AbilityId = LudoAbilityKind;

const ABILITY_GLYPHS: Record<AbilityId, Icon> = {
  launcher: RocketLaunch,
  jump: CaretDoubleUp,
  teleport: Spiral,
  shield: Shield,
};

export function AbilityIcon({ id, size = 22 }: { id: AbilityId; size?: number }) {
  const Glyph = ABILITY_GLYPHS[id];
  return <Glyph size={size} weight="duotone" />;
}

export type Ability = {
  id: AbilityId;
  label: string;
  /** In half-points. */
  costHp: number;
  maxUses: number;
  blurb: string;
  detail: string;
  color: string;
};

export const ABILITIES: Ability[] = [
  {
    id: 'launcher',
    label: ABILITY_LABELS.launcher,
    costHp: ABILITY_COST_HP.launcher,
    maxUses: ABILITY_MAX_USES.launcher,
    blurb: `Your pawn jumps forward ${LAUNCH_DISTANCE} cells`,
    detail: `Pick one of your own pawns on the track and it springs ${LAUNCH_DISTANCE} cells forward straight away. A pawn close enough to the end lands home.`,
    color: ABILITY_COLORS.launcher,
  },
  {
    id: 'jump',
    label: ABILITY_LABELS.jump,
    costHp: ABILITY_COST_HP.jump,
    maxUses: ABILITY_MAX_USES.jump,
    blurb: 'Pawn glows and every move is doubled, for the whole game',
    detail:
      'Pick one of your pawns: it glows for the rest of the match and every roll moves it twice as far along the track. One buff per pawn, and the home stretch still needs an exact roll.',
    color: ABILITY_COLORS.jump,
  },
  {
    id: 'teleport',
    label: ABILITY_LABELS.teleport,
    costHp: ABILITY_COST_HP.teleport,
    maxUses: ABILITY_MAX_USES.teleport,
    blurb: 'Sends a pawn to the first square of its home stretch',
    detail:
      'Pick one of your pawns on the track and it skips straight to the first square of its own home column, out of reach of every capture. One use per match.',
    color: ABILITY_COLORS.teleport,
  },
  {
    id: 'shield',
    label: ABILITY_LABELS.shield,
    costHp: ABILITY_COST_HP.shield,
    maxUses: ABILITY_MAX_USES.shield,
    blurb: 'The pawn can never be captured',
    detail:
      'Pick one of your pawns: it carries a shield for the rest of the match and can never be sent back to base by an enemy landing on it.',
    color: ABILITY_COLORS.shield,
  },
];

const EARN_RULES: { label: string; value: string }[] = [
  { label: 'Roll a 5', value: '+½ pt' },
  { label: 'Roll a 6', value: '+1 pt' },
  { label: 'Land on a star field', value: '+2 pts' },
  { label: 'Capture a pawn', value: '+2 pts' },
  { label: 'Bring a pawn home', value: '+2 pts' },
];

function LudoPointsModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop ludo-ability-backdrop" onClick={onClose}>
      <div
        className="modal ludo-points-modal"
        role="dialog"
        aria-label="How points are earned"
        onClick={event => event.stopPropagation()}
      >
        <div className="ability-modal-head">
          <span className="ability-modal-title">
            <Lightning size={20} weight="fill" />
            <h2 className="modal-title">Earning points</h2>
          </span>
        </div>
        <div className="points-rules">
          {EARN_RULES.map(rule => (
            <div key={rule.label} className="points-rule">
              <span className="points-rule-label">{rule.label}</span>
              <span className="points-rule-value mono">{rule.value}</span>
            </div>
          ))}
        </div>
        <p className="points-cap">
          You can bank at most {formatChargePoints(CHARGE_MAX_HP)} points.
          Spend them on abilities before the bar fills.
        </p>
        <div className="ability-modal-actions">
          <button type="button" className="btn btn-surface" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export const HELP_TEXT =
  'Earn points from 5 and 6 rolls, star fields, captures and pawns brought ' +
  'home, up to 10. Spend points to arm an ability, then pick one of your pawns.';

const SEGMENTS = CHARGE_MAX_HP / 2;

export function ChargeTrack({ chargeHp }: { chargeHp: number }) {
  return (
    <div className="charge-track">
      {Array.from({ length: SEGMENTS }, (_, i) => {
        const hp = Math.max(0, Math.min(2, chargeHp - i * 2));
        return (
          <span key={i} className="charge-seg">
            {hp > 0 && (
              <span
                className="charge-seg-fill"
                style={{ width: hp === 1 ? '50%' : '100%' }}
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

type Props = {
  /** Half-points; the bar shows points. */
  chargeHp: number;
  armed: AbilityId | null;
  disabled: boolean;
  onOpenAbilities: () => void;
};

export function LudoAbilityBar({
  chargeHp,
  armed,
  disabled,
  onOpenAbilities,
}: Props) {
  const armedAbility = ABILITIES.find(ability => ability.id === armed) ?? null;
  const [showHelp, setShowHelp] = useState(false);

  const [gain, setGain] = useState<{ seq: number; hp: number } | null>(null);
  const prevHpRef = useRef(chargeHp);
  const gainSeqRef = useRef(0);
  useEffect(() => {
    const delta = chargeHp - prevHpRef.current;
    prevHpRef.current = chargeHp;
    if (delta > 0) {
      gainSeqRef.current += 1;
      setGain({ seq: gainSeqRef.current, hp: delta });
    }
  }, [chargeHp]);
  useEffect(() => {
    if (!gain) return;
    const timer = setTimeout(() => setGain(null), 1400);
    return () => clearTimeout(timer);
  }, [gain]);

  return (
    <div className="ability-bar">
      <div className="ability-head">
        <span className="ability-title">
          ABILITIES
          <button
            type="button"
            className={showHelp ? 'ability-help is-open' : 'ability-help'}
            aria-label="How points are earned"
            aria-haspopup="dialog"
            onClick={() => setShowHelp(true)}
          >
            ?
          </button>
        </span>
        <span className={gain ? 'ability-pts is-gaining' : 'ability-pts'}>
          {gain && (
            <span key={gain.seq} className="ability-gain mono">
              +{formatChargePoints(gain.hp)}
            </span>
          )}
          {formatChargePoints(chargeHp)}
          <span className="ability-pts-unit">
            / {formatChargePoints(CHARGE_MAX_HP)} PTS
          </span>
        </span>
      </div>

      {showHelp && <LudoPointsModal onClose={() => setShowHelp(false)} />}

      <ChargeTrack chargeHp={chargeHp} />

      <button
        type="button"
        className={armedAbility ? 'ability-open is-armed' : 'ability-open'}
        disabled={disabled}
        onClick={onOpenAbilities}
      >
        <Sparkle size={16} weight="fill" />
        <span className="ability-open-label">
          {armedAbility ? `${armedAbility.label} armed` : 'Abilities'}
        </span>
      </button>
    </div>
  );
}
