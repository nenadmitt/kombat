import {
  hasJump,
  jumpableTokens,
  launchableTokens,
  shieldableTokens,
  teleportableTokens,
  TOKENS_PER_PLAYER,
} from '@gaming-platform/core';
import { DiceFive, Hourglass, Lightning, Trophy } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';

import { GameResultScreen } from '../../components/GameResultScreen';
import { Countdown } from '../battleship/Countdown';
import { LudoAbilitiesModal } from './LudoAbilitiesModal';
import { ABILITIES, LudoAbilityBar, type AbilityId } from './LudoAbilityBar';
import { LudoBoard } from './LudoBoard';
import { LudoDice } from './LudoDice';
import type { LudoPlayProps } from './ludo-engine';
import { LUDO_COLOR_HEX } from './ludo-theme';
import type { ResultExtras } from '../use-result-data';

/** How long the die tumbles before it settles on the rolled value. */
const ROLL_ANIMATION_MS = 550;

const WIN_COPY = {
  complete: {
    eyebrow: 'ALL PAWNS HOME',
    message: 'You raced every pawn home first. The table is yours.',
  },
  forfeit: {
    eyebrow: 'LAST PLAYER STANDING',
    message: 'Everyone else dropped out. The table is yours.',
  },
  timeout: {
    eyebrow: 'LAST PLAYER STANDING',
    message: 'Everyone else ran out of time. The table is yours.',
  },
} as const;

const LOSE_COPY = {
  complete: {
    eyebrow: 'RACE LOST',
    message: (winner: string) => `${winner} brought every pawn home first.`,
  },
  forfeit: {
    eyebrow: 'MATCH FORFEITED',
    message: () => 'You left the match and were eliminated.',
  },
  timeout: {
    eyebrow: 'OUT OF TIME',
    message: () => 'You ran out of time once too often and were eliminated.',
  },
} as const;

/** Pawn-pick hint per ability: [something to pick, nothing to pick]. */
const PICK_HINTS: Record<AbilityId, [string, string]> = {
  launcher: [
    'Pick one of your pawns on the track to launch it.',
    'No pawn of yours is on the track to launch.',
  ],
  jump: [
    'Pick one of your pawns to give it Extra Jump.',
    'Every pawn of yours already has Extra Jump.',
  ],
  teleport: [
    'Pick a pawn on the track to send it to your home stretch.',
    'No pawn of yours can teleport right now.',
  ],
  shield: [
    'Pick one of your pawns to shield it for the rest of the match.',
    'No pawn of yours can take a shield right now.',
  ],
};

export function LudoPlay(props: LudoPlayProps & ResultExtras) {
  const {
    seats,
    tokens,
    eliminatedColors,
    myColor,
    turnColor,
    myTurn,
    stage,
    die,
    rollId,
    movableTokens,
    notice,
    turnDeadline,
    result,
    resultReason,
    winnerName,
    myCaptures,
    chargeHp,
    usesLeft,
    jumps,
    shields,
    onRoll,
    onMoveToken,
    onLaunch,
    onJump,
    onTeleport,
    onShield,
    onTimerExpire,
    onBack,
    onPlayAgain,
    settlement,
    winRate,
  } = props;

  const [armedAbility, setArmedAbility] = useState<AbilityId | null>(null);
  const [showAbilities, setShowAbilities] = useState(false);
  const canArm = myTurn;
  const armedKind = canArm ? armedAbility : null;
  const pickTargets =
    armedKind === 'launcher'
      ? launchableTokens(tokens, myColor)
      : armedKind === 'jump'
        ? jumpableTokens(tokens, myColor, jumps)
        : armedKind === 'teleport'
          ? teleportableTokens(tokens, myColor)
          : armedKind === 'shield'
            ? shieldableTokens(tokens, myColor, shields)
            : null;
  const onAbilityPick =
    armedKind === 'launcher'
      ? onLaunch
      : armedKind === 'jump'
        ? onJump
        : armedKind === 'teleport'
          ? onTeleport
          : armedKind === 'shield'
            ? onShield
            : onMoveToken;

  // An ability armed but never cast dies with the turn, and the picker cannot
  // outlive the turn it would arm for.
  useEffect(() => {
    if (!myTurn) {
      setArmedAbility(null);
      setShowAbilities(false);
    }
  }, [myTurn]);

  // Disarm on the engine's ack, never optimistically: a rejected cast leaves
  // the ability armed and the points unspent.
  const armedUses = armedAbility ? usesLeft[armedAbility] : null;
  const spentRef = useRef<{ id: AbilityId | null; uses: number | null }>({
    id: null,
    uses: null,
  });
  useEffect(() => {
    const last = spentRef.current;
    if (
      armedAbility !== null &&
      last.id === armedAbility &&
      last.uses !== null &&
      armedUses !== null &&
      armedUses < last.uses
    ) {
      setArmedAbility(null);
    }
    spentRef.current = { id: armedAbility, uses: armedUses };
  }, [armedAbility, armedUses]);

  // The die tumbles on every roll, including a repeat of the same value.
  const [rolling, setRolling] = useState(false);
  const firstRoll = useRef(true);
  useEffect(() => {
    if (firstRoll.current) {
      firstRoll.current = false;
      return;
    }
    setRolling(true);
    const timer = setTimeout(() => setRolling(false), ROLL_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [rollId]);

  if (result) {
    const won = result === 'win';
    const reason = resultReason ?? 'complete';
    const mine = seats.find(seat => seat.color === myColor);
    const copy = won
      ? { eyebrow: WIN_COPY[reason].eyebrow, message: WIN_COPY[reason].message }
      : {
          eyebrow: LOSE_COPY[reason].eyebrow,
          message: LOSE_COPY[reason].message(winnerName ?? 'Another player'),
        };

    return (
      <GameResultScreen
        variant={result}
        icon={won ? Trophy : DiceFive}
        eyebrow={copy.eyebrow}
        title={won ? 'Victory' : 'Defeat'}
        message={copy.message}
        stats={[
          {
            value: `${mine?.homeCount ?? 0} / ${TOKENS_PER_PLAYER}`,
            label: 'PAWNS HOME',
            highlight: true,
          },
          { value: String(myCaptures), label: 'CAPTURES' },
          { value: String(seats.length), label: 'PLAYERS' },
        ]}
        meters={
          winRate === null || winRate === undefined
            ? undefined
            : [{ label: 'Your win rate', percent: winRate }]
        }
        settlement={settlement}
        onBack={onBack}
        onPlayAgain={onPlayAgain}
      />
    );
  }

  const boostedMovable = movableTokens.some(i => hasJump(jumps, myColor, i));
  const turnSeat = seats.find(seat => seat.color === turnColor) ?? null;
  const turnHint = myTurn
    ? stage === 'roll'
      ? 'Roll a 6 to release a pawn, or move one already out.'
      : `Pick a glowing pawn to move ${die ?? ''}.${
          boostedMovable ? ' Extra Jump pawns move double.' : ''
        }`
    : turnSeat
      ? `${turnSeat.name} is playing...`
      : 'Waiting for the next turn.';
  const hint = armedKind
    ? PICK_HINTS[armedKind][pickTargets && pickTargets.length > 0 ? 0 : 1]
    : (notice ?? turnHint);
  const armedLabel = armedKind
    ? (ABILITIES.find(ability => ability.id === armedKind)?.label ?? '')
    : null;
  const noticeText = armedLabel
    ? `Arming ${armedLabel} · pick a pawn`
    : !myTurn && turnSeat
      ? (notice ??
        `${turnSeat.name} is ${stage === 'move' ? 'moving' : 'rolling'}`)
      : hint;
  const turnStyle = {
    '--seat': turnColor ? LUDO_COLOR_HEX[turnColor] : 'var(--text-3)',
  } as React.CSSProperties;

  return (
    <div className="ludo-play">
      <div className="ludo-stage">
        {/* Phones hide the sidebar seat list; this strip is its stand-in. */}
        <div className="ludo-seat-strip">
          {seats.map(seat => (
            <div
              key={seat.userId}
              className={
                seat.eliminated
                  ? 'ludo-chip is-out'
                  : seat.color === turnColor
                    ? 'ludo-chip is-turn'
                    : 'ludo-chip'
              }
              style={{ '--seat': LUDO_COLOR_HEX[seat.color] } as React.CSSProperties}
            >
              <span className="ludo-chip-avatar">
                {seat.initial}
                <span
                  className={
                    seat.online ? 'ludo-seat-dot is-online' : 'ludo-seat-dot'
                  }
                />
              </span>
              <span className="ludo-chip-count mono">
                {seat.homeCount}/{TOKENS_PER_PLAYER}
              </span>
            </div>
          ))}
        </div>
        <div className="ludo-board-panel">
          <LudoBoard
            seatedColors={seats.map(seat => seat.color)}
            tokens={tokens}
            eliminated={eliminatedColors}
            myColor={myColor}
            movableTokens={pickTargets ?? movableTokens}
            onTokenPick={pickTargets ? onAbilityPick : onMoveToken}
            jumps={jumps}
            shields={shields}
          />
        </div>
      </div>

      <aside className="ludo-side" style={turnStyle}>
        {/* Every seat, so a 2-, 3- or 4-player table reads the same. */}
        <div className="ludo-seats">
          {seats.map(seat => (
            <div
              key={seat.userId}
              className={
                seat.eliminated
                  ? 'ludo-seat is-out'
                  : seat.color === turnColor
                    ? 'ludo-seat is-turn'
                    : 'ludo-seat'
              }
              style={{ '--seat': LUDO_COLOR_HEX[seat.color] } as React.CSSProperties}
            >
              <span className="ludo-seat-avatar">{seat.initial}</span>
              <div className="ludo-seat-meta">
                <span className="ludo-seat-name">{seat.name}</span>
                <span className="ludo-seat-sub mono">
                  {seat.eliminated
                    ? 'Eliminated'
                    : `${seat.homeCount} / ${TOKENS_PER_PLAYER} home`}
                </span>
              </div>
              <span
                className={seat.online ? 'ludo-seat-dot is-online' : 'ludo-seat-dot'}
              />
            </div>
          ))}
        </div>

        {/* Abilities, die, notice and button share the tray, so the sticky
            mobile tray keeps all of them on screen. */}
        <div className="match-actions">
          <LudoAbilityBar
            chargeHp={chargeHp}
            armed={armedAbility}
            disabled={!myTurn}
            onOpenAbilities={() => setShowAbilities(true)}
          />

          <div className={myTurn ? 'ludo-turn is-mine' : 'ludo-turn'}>
            <div className="ludo-turn-head">
              <span className="ludo-turn-who">
                <span className="ludo-turn-avatar">
                  {turnSeat?.initial ?? '-'}
                </span>
                <span className="ludo-turn-name">
                  {myTurn
                    ? 'Your turn'
                    : turnSeat
                      ? `${turnSeat.name}'s turn`
                      : 'Waiting'}
                </span>
              </span>
              <span className="ludo-turn-clock">
                <span className="ludo-turn-dot" />
                {/* The only Countdown on the screen: it fires the turn timeout. */}
                {turnDeadline ? (
                  <Countdown deadline={turnDeadline} onExpire={onTimerExpire} />
                ) : (
                  <span className="mono bs-clock-value">--</span>
                )}
              </span>
            </div>

            <div className="ludo-roll-row">
              <LudoDice value={die} rolling={rolling} />
              <button
                type="button"
                className={myTurn ? 'ludo-roll-btn' : 'ludo-roll-btn is-waiting'}
                disabled={!myTurn || stage !== 'roll'}
                onClick={onRoll}
              >
                {myTurn ? (
                  stage === 'move' ? (
                    'Move a pawn'
                  ) : (
                    'Roll'
                  )
                ) : (
                  <>
                    <Hourglass size={17} />
                    Waiting
                  </>
                )}
              </button>
            </div>

            <div className="ludo-notice">
              {armedKind ? (
                <Lightning size={14} weight="fill" className="ludo-notice-bolt" />
              ) : (
                !myTurn && (
                  <span className="ludo-notice-dots">
                    <span />
                    <span />
                    <span />
                  </span>
                )
              )}
              <span className="ludo-notice-text">{noticeText}</span>
            </div>
          </div>
        </div>
      </aside>

      {showAbilities && (
        <LudoAbilitiesModal
          chargeHp={chargeHp}
          armed={armedAbility}
          usesLeft={usesLeft}
          canArm={canArm}
          armWindowHint="You can only arm an ability on your own turn."
          onArm={setArmedAbility}
          onClose={() => setShowAbilities(false)}
        />
      )}
    </div>
  );
}
