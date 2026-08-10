import { CHROMA_SUITS, type ChromaSuit } from '@gaming-platform/core';
import {
  ArrowLeft,
  ArrowRight,
  CaretRight,
  Cards,
  Check,
  Trophy,
} from '@phosphor-icons/react';
import { useEffect, useState, type CSSProperties } from 'react';

import { GameResultScreen } from '../../components/GameResultScreen';
import { Sheet } from '../../components/ui';
import { Countdown } from '../battleship/Countdown';
import { ChromaCardBack, ChromaCardView } from './ChromaCard';
import { CHROMA_SUIT_HEX, CHROMA_SUIT_VAR, SUIT_LABELS } from './chroma-theme';
import type { ChromaPlayProps } from './chroma-engine';
import type { ResultExtras } from '../use-result-data';

/** Card widths, in the design's proportions for each surface. */
const HAND_CARD_W = 58;
const HAND_CARD_W_CROWDED = 50;
const DRAW_CARD_W = 64;
const DISCARD_CARD_W = 72;
const PRISM_CARD_W = 78;

/** Past this the fan stops reading and the hand becomes a scrolling row. */
const FAN_LIMIT = 8;

/** Card backs stacked behind an opponent's count, before it just gets silly. */
const MINI_CARDS = 6;

const WIN_COPY = {
  complete: {
    eyebrow: 'SOLO!',
    message: 'You shed every card first. The table is yours.',
  },
  forfeit: {
    eyebrow: 'LAST HAND STANDING',
    message: 'Everyone else dropped out. The table is yours.',
  },
  timeout: {
    eyebrow: 'LAST HAND STANDING',
    message: 'Everyone else ran out of time. The table is yours.',
  },
} as const;

const LOSE_COPY = {
  complete: {
    eyebrow: 'HAND NOT EMPTIED',
    message: (winner: string) => `${winner} shed every card first.`,
  },
  forfeit: {
    eyebrow: 'MATCH FORFEITED',
    message: () => 'You left the match and were eliminated.',
  },
  timeout: {
    eyebrow: 'LOST BY TIMEOUT',
    message: () => 'You ran out of time once too often and were eliminated.',
  },
} as const;

export function ChromaPlay(props: ChromaPlayProps & ResultExtras) {
  const {
    seats,
    myHand,
    playable,
    myTurn,
    stage,
    activeSuit,
    discardTop,
    drawPileCount,
    direction,
    myDrawnIndex,
    pickingColor,
    notice,
    turnDeadline,
    result,
    resultReason,
    winnerName,
    onPlay,
    onDraw,
    onPass,
    onPickColor,
    onTimerExpire,
    onBack,
    onPlayAgain,
    settlement,
    winRate,
  } = props;

  const [selected, setSelected] = useState<number | null>(null);
  const [soloArmed, setSoloArmed] = useState(false);
  const [prismSuit, setPrismSuit] = useState<ChromaSuit>('crimson');

  // Selection and SOLO reset whenever the turn context changes under us.
  useEffect(() => {
    setSelected(null);
    setSoloArmed(false);
  }, [myTurn, stage, myHand.length]);

  if (result) {
    const won = result === 'win';
    const reason = resultReason ?? 'complete';
    const copy = won
      ? WIN_COPY[reason]
      : {
          eyebrow: LOSE_COPY[reason].eyebrow,
          message: LOSE_COPY[reason].message(winnerName ?? 'Another player'),
        };

    return (
      <GameResultScreen
        variant={result}
        icon={won ? Trophy : Cards}
        eyebrow={copy.eyebrow}
        title={won ? 'You win' : 'Defeat'}
        message={copy.message}
        stats={[
          { value: String(myHand.length), label: 'CARDS LEFT', highlight: won },
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

  const playableSet = new Set(playable);
  const opponents = seats.filter(seat => !seat.isMe);
  const turnSeat = seats.find(seat => seat.onTurn) ?? null;

  // A wild I played leaves me off-turn until the colour lands.
  const awaitingMyColor =
    stage === 'pick-color' && (pickingColor || turnSeat?.isMe === true);
  const mine = myTurn || awaitingMyColor;

  const drawEnabled = myTurn && myDrawnIndex === null;
  const selectable = (index: number) =>
    myTurn &&
    playableSet.has(index) &&
    (myDrawnIndex === null || index === myDrawnIndex);
  const playDisabled = selected === null || !selectable(selected);
  // Arming SOLO matters exactly when this play would leave one card.
  const soloRelevant = myHand.length === 2;
  const showPass = myDrawnIndex !== null;
  const showSolo = !showPass || soloRelevant;

  const passButton = (
    <button
      type="button"
      className="btn btn-outline-lime btn-block btn-lg"
      onClick={onPass}
    >
      Keep & pass
    </button>
  );

  const handlePlay = () => {
    if (selected === null || playDisabled) return;
    onPlay(selected, soloArmed);
    setSelected(null);
    setSoloArmed(false);
  };

  const fanned = myHand.length <= FAN_LIMIT;
  const cardWidth = myHand.length > 6 ? HAND_CARD_W_CROWDED : HAND_CARD_W;
  const mid = (myHand.length - 1) / 2;

  const turnText = awaitingMyColor
    ? 'Pick a colour for your Prism'
    : myTurn
      ? myDrawnIndex !== null
        ? 'Play the drawn card or pass'
        : 'Your turn · match the colour or symbol'
      : `${turnSeat?.name ?? 'Opponent'}'s turn`;

  return (
    <div className="chroma-play">
      <div className="chroma-stage">
        <div className="chroma-table">
          {/* Phones hide the sidebar turn strip; this pill is its stand-in. */}
          <div className={mine ? 'chroma-turn-pill' : 'chroma-turn-pill is-theirs'}>
            <span className="turn-dot" />
            <span className="chroma-turn-pill-name">
              {awaitingMyColor
                ? 'PICK A COLOUR'
                : myTurn
                  ? 'YOU'
                  : (turnSeat?.name ?? '--')}
            </span>
            {turnDeadline && <Countdown deadline={turnDeadline} />}
          </div>

          <button
            type="button"
            className="chroma-pile"
            disabled={!drawEnabled}
            onClick={onDraw}
          >
            <span className="chroma-pile-stack">
              <span className="chroma-pile-ghost is-far" />
              <span className="chroma-pile-ghost" />
              <ChromaCardBack width={DRAW_CARD_W} />
            </span>
            <span className="card-label">DRAW · {drawPileCount}</span>
          </button>

          <div className="chroma-discard">
            <ChromaCardView card={discardTop} width={DISCARD_CARD_W} />
            <span className="chroma-active-pill">
              <span
                className="chroma-active-dot"
                style={{ '--suit': CHROMA_SUIT_HEX[activeSuit] } as CSSProperties}
              />
              {SUIT_LABELS[activeSuit].toUpperCase()}
              {direction === 1 ? <ArrowRight size={12} /> : <ArrowLeft size={12} />}
            </span>
          </div>
        </div>

        <div className="chroma-turn">
          <span className={mine ? 'turn-dot' : 'turn-dot is-idle'} />
          <span className="chroma-turn-text">{turnText}</span>
        </div>

        {notice && <p className="chroma-notice">{notice}</p>}

        <div className="chroma-hand-head">
          <span className="card-label">
            YOUR HAND · {myHand.length} CARDS
          </span>
          <span className="chroma-hand-playable">
            {myTurn ? `${playable.length} playable` : ''}
          </span>
        </div>

        <div className={fanned ? 'chroma-hand is-fanned' : 'chroma-hand'}>
          {myHand.map((card, i) => {
            const isSelected = selected === i;
            const lift = (fanned ? Math.abs(i - mid) * 3 : 0) + (isSelected ? -14 : 0);
            return (
              <button
                key={`${card.suit}-${card.value}-${i}`}
                type="button"
                className="chroma-hand-card"
                disabled={!selectable(i)}
                style={{
                  transform: `rotate(${fanned ? (i - mid) * 4 : 0}deg) translateY(${lift}px)`,
                }}
                onClick={() => setSelected(prev => (prev === i ? null : i))}
              >
                <ChromaCardView
                  card={card}
                  width={cardWidth}
                  playable={selectable(i)}
                  selected={isSelected}
                  dimmed={myTurn && myDrawnIndex !== null && i !== myDrawnIndex}
                />
              </button>
            );
          })}
        </div>
      </div>

      <aside className="chroma-side">
        <div className={mine ? 'match-turn' : 'match-turn is-theirs'}>
          <span className="match-turn-label">
            <span className="turn-dot" />
            {awaitingMyColor
              ? 'PICK A COLOUR'
              : myTurn
                ? 'YOUR TURN'
                : (turnSeat?.name.toUpperCase() ?? '--')}
          </span>
          {turnDeadline ? (
            <Countdown deadline={turnDeadline} onExpire={onTimerExpire} />
          ) : (
            <span className="mono bs-clock-value">--</span>
          )}
        </div>

        <div className="chroma-seats">
          {opponents.map(seat => (
            <div
              key={seat.userId}
              className={
                seat.eliminated
                  ? 'chroma-seat is-out'
                  : seat.onTurn
                    ? 'chroma-seat is-turn'
                    : 'chroma-seat'
              }
            >
              <span className="chroma-seat-avatar">
                {seat.initial}
                <span
                  className={
                    seat.online ? 'chroma-seat-dot is-online' : 'chroma-seat-dot'
                  }
                />
              </span>
              <div className="chroma-seat-meta">
                <span className="chroma-seat-name">{seat.name}</span>
                <span className="chroma-seat-sub">
                  {seat.eliminated
                    ? 'Eliminated'
                    : seat.onTurn
                      ? 'On turn'
                      : `${seat.cardCount} cards`}
                </span>
              </div>
              {!seat.eliminated && (
                <span className="chroma-seat-cards">
                  {Array.from(
                    { length: Math.min(seat.cardCount, MINI_CARDS) },
                    (_, i) => (
                      <span key={i} className="chroma-mini" />
                    ),
                  )}
                </span>
              )}
              <span className="chroma-seat-count">
                {seat.eliminated ? '-' : seat.cardCount}
              </span>
            </div>
          ))}
        </div>

        <div className="match-actions">
          <div className="chroma-actions">
            {showSolo ? (
              <button
                type="button"
                className={
                  soloArmed
                    ? 'btn btn-lg btn-block chroma-solo is-armed'
                    : soloRelevant
                      ? 'btn btn-outline-gold btn-lg btn-block chroma-solo'
                      : 'btn btn-outline-lime btn-lg btn-block chroma-solo'
                }
                onClick={() => setSoloArmed(armed => !armed)}
              >
                SOLO!
              </button>
            ) : (
              passButton
            )}
            <button
              type="button"
              className="btn btn-lime btn-lg btn-block chroma-play-btn"
              disabled={playDisabled}
              onClick={handlePlay}
            >
              Play
              <CaretRight size={16} weight="bold" />
            </button>
          </div>
          {showSolo && showPass && passButton}
        </div>
      </aside>

      <Sheet
        open={pickingColor}
        onOpenChange={() => undefined}
        dismissible={false}
        title="Pick a colour"
        subtitle="Your Prism sets the colour everyone must match."
        footer={
          <button
            type="button"
            className="btn btn-lime btn-block btn-lg"
            onClick={() => onPickColor(prismSuit)}
          >
            Confirm {SUIT_LABELS[prismSuit].toLowerCase()}
          </button>
        }
      >
        <div className="chroma-prism-preview">
          <ChromaCardView card={discardTop} width={PRISM_CARD_W} />
        </div>
        <div className="chroma-prism-grid">
          {CHROMA_SUITS.map(suit => {
            const picked = prismSuit === suit;
            return (
              <button
                key={suit}
                type="button"
                className={picked ? 'chroma-prism-opt is-picked' : 'chroma-prism-opt'}
                style={{ '--suit': CHROMA_SUIT_VAR[suit] } as CSSProperties}
                onClick={() => setPrismSuit(suit)}
              >
                <span className="chroma-prism-swatch" />
                <span className="chroma-prism-label">{SUIT_LABELS[suit]}</span>
                {picked && (
                  <span className="chroma-prism-check">
                    <Check size={13} weight="bold" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
