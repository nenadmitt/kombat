import { CHARGE_MAX_HP, formatChargePoints } from '@gaming-platform/core';
import { Crosshair, Lightning } from '@phosphor-icons/react';
import { useState } from 'react';

import {
  ABILITIES,
  AbilityIcon,
  ChargeTrack,
  HELP_TEXT,
  type AbilityId,
} from './LudoAbilityBar';

type Props = {
  chargeHp: number;
  armed: AbilityId | null;
  usesLeft: Record<AbilityId, number>;
  canArm: boolean;
  armWindowHint: string;
  onArm: (id: AbilityId | null) => void;
  onClose: () => void;
};

export function LudoAbilitiesModal({
  chargeHp,
  armed,
  usesLeft,
  canArm,
  armWindowHint,
  onArm,
  onClose,
}: Props) {
  const [picked, setPicked] = useState<AbilityId | null>(armed);
  const detail = ABILITIES.find(ability => ability.id === picked) ?? null;
  const affordable = detail !== null && chargeHp >= detail.costHp;
  const hasUses = detail !== null && usesLeft[detail.id] > 0;
  const short = detail ? detail.costHp - chargeHp : 0;
  const blocked = detail
    ? !hasUses
      ? 'No uses left this match.'
      : !affordable
        ? `Needs ${formatChargePoints(short)} more point${short === 2 ? '' : 's'}.`
        : !canArm
          ? armWindowHint
          : null
    : null;
  const usable = detail !== null && blocked === null;

  return (
    <div className="modal-backdrop ludo-ability-backdrop" onClick={onClose}>
      <div
        className="modal ludo-ability-modal"
        onClick={event => event.stopPropagation()}
      >
        <div className="ability-modal-head">
          <div className="ability-modal-title">
            <Lightning size={20} weight="fill" className="ability-open-bolt" />
            <h2 className="modal-title">Abilities</h2>
          </div>
          <span className="ability-pts is-lg">
            {formatChargePoints(chargeHp)}
            <span className="ability-pts-unit">
              / {formatChargePoints(CHARGE_MAX_HP)} PTS
            </span>
          </span>
        </div>
        <p className="ability-modal-rule">{HELP_TEXT}</p>

        <ChargeTrack chargeHp={chargeHp} />

        <div className="ability-grid">
          {ABILITIES.map(ability => {
            const uses = usesLeft[ability.id];
            const spent = uses <= 0;
            const locked = spent || chargeHp < ability.costHp;
            return (
              <button
                key={ability.id}
                type="button"
                className={
                  picked === ability.id
                    ? 'ability-card is-picked'
                    : locked
                      ? 'ability-card is-locked'
                      : 'ability-card'
                }
                onClick={() => setPicked(ability.id)}
              >
                <span
                  className="ability-card-icon"
                  style={{ color: ability.color }}
                >
                  <AbilityIcon id={ability.id} size={26} />
                </span>
                <span className="ability-card-name">{ability.label}</span>
                <span className="ability-card-cost mono">
                  {formatChargePoints(ability.costHp)} pts
                </span>
                <span
                  className={
                    spent
                      ? 'ability-card-uses is-spent'
                      : locked
                        ? 'ability-card-uses is-short'
                        : 'ability-card-uses is-ready'
                  }
                >
                  {spent
                    ? 'SPENT'
                    : locked
                      ? `NEEDS ${formatChargePoints(ability.costHp - chargeHp)}`
                      : `${uses} USES`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ability-detail">
          {detail ? (
            <>
              <span
                className="ability-detail-icon"
                style={{ color: detail.color }}
              >
                <AbilityIcon id={detail.id} size={24} />
              </span>
              <div className="ability-detail-body">
                <span className="ability-detail-head">
                  {detail.label}
                  <span
                    className={
                      !hasUses
                        ? 'ability-badge is-spent'
                        : affordable
                          ? 'ability-badge is-ready'
                          : 'ability-badge is-short'
                    }
                  >
                    {!hasUses
                      ? 'SPENT'
                      : affordable
                        ? 'AFFORDABLE'
                        : `NEEDS ${formatChargePoints(short)}`}
                  </span>
                </span>
                <p className="ability-detail-text">{detail.detail}</p>
              </div>
            </>
          ) : (
            <p className="ability-detail-text">
              Pick an ability to see what it does.
            </p>
          )}
        </div>

        <div className="ability-modal-actions">
          <span className="ability-modal-foot">
            {detail && usable
              ? `Leaves you ${formatChargePoints(chargeHp - detail.costHp)} pts after arming`
              : blocked}
          </span>
          <button
            type="button"
            className="ability-modal-close"
            onClick={onClose}
          >
            Close
          </button>
          {armed && picked === armed ? (
            <button
              type="button"
              className="ability-modal-arm"
              onClick={() => {
                onArm(null);
                onClose();
              }}
            >
              Disarm
            </button>
          ) : (
            <button
              type="button"
              className="ability-modal-arm"
              disabled={!usable}
              onClick={() => {
                if (picked) {
                  onArm(picked);
                  onClose();
                }
              }}
            >
              <Crosshair size={16} weight="bold" />
              Arm and pick a pawn
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
