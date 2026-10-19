import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildDeck,
  CHROMA_HAND_SIZE,
  chooseBotColor,
  chooseBotPlay,
  isPlayable,
  MAX_TIMEOUTS,
  nextSeatIndex,
  playEffect,
  shuffle,
  SOLO_PENALTY_DRAWS,
  takeStarter,
  TURN_SECONDS,
  type ChromaCard,
  type ChromaDirection,
  type ChromaEndReason,
  type ChromaSuit,
} from '@gaming-platform/core';

import { describeCard } from './chroma-theme';
import type { ChromaEngine, ChromaPlayProps, ChromaSeatView } from './chroma-engine';

const BOT_NAMES = ['Kraken', 'Mona', 'Rex'];
const BOT_DELAY_MS = 1400;

type DemoState = {
  hands: ChromaCard[][];
  drawPile: ChromaCard[];
  discard: ChromaCard[];
  activeSuit: ChromaSuit;
  direction: ChromaDirection;
  turnIdx: number;
  stage: 'play' | 'pick-color';
  pendingColorIdx: number | null;
  drawnIndex: number | null;
  notice: string | null;
  winnerIdx: number | null;
  endReason: ChromaEndReason | null;
  myTimeouts: number;
  turnStartedAt: number;
};

const freshState = (): DemoState => {
  let deck = shuffle(buildDeck());
  const hands: ChromaCard[][] = [[], [], [], []];
  for (let c = 0; c < CHROMA_HAND_SIZE; c++) {
    for (let s = 0; s < 4; s++) {
      hands[s]!.push(deck.pop()!);
    }
  }
  const start = takeStarter(deck);
  return {
    hands,
    drawPile: start.deck,
    discard: [start.starter],
    activeSuit: start.starter.suit as ChromaSuit,
    direction: 1,
    turnIdx: 0,
    stage: 'play',
    pendingColorIdx: null,
    drawnIndex: null,
    notice: null,
    winnerIdx: null,
    endReason: null,
    myTimeouts: 0,
    turnStartedAt: Date.now(),
  };
};

export function useDemoChroma(): ChromaEngine {
  const [state, setState] = useState<DemoState>(freshState);
  const botTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (botTimer.current) {
        clearTimeout(botTimer.current);
      }
    },
    [],
  );

  const drawInto = (s: DemoState, seat: number, n: number): number => {
    let drew = 0;
    for (let i = 0; i < n; i++) {
      if (s.drawPile.length === 0 && s.discard.length > 1) {
        const top = s.discard.pop()!;
        s.drawPile = shuffle(s.discard);
        s.discard = [top];
      }
      const card = s.drawPile.pop();
      if (!card) {
        break;
      }
      s.hands[seat]!.push(card);
      drew++;
    }
    return drew;
  };

  const eliminatedSet = () => new Set<number>();

  const advance = (s: DemoState, steps: number) => {
    s.turnIdx = nextSeatIndex(4, s.turnIdx, s.direction, eliminatedSet(), steps);
    s.stage = 'play';
    s.drawnIndex = null;
    s.turnStartedAt = Date.now();
  };

  const applyPlay = (
    s: DemoState,
    seat: number,
    idx: number,
    solo: boolean,
  ) => {
    const hand = s.hands[seat]!;
    const card = hand[idx]!;
    hand.splice(idx, 1);
    s.discard.push(card);

    const who = seat === 0 ? 'You' : BOT_NAMES[seat - 1]!;
    let notice = `${who} played ${describeCard(card)}`;

    if (hand.length === 1) {
      if (seat === 0 && !solo) {
        drawInto(s, 0, SOLO_PENALTY_DRAWS);
        notice = `You forgot SOLO - drew ${SOLO_PENALTY_DRAWS} penalty cards`;
      } else {
        notice = `${who} ${seat === 0 ? 'are' : 'is'} on SOLO!`;
      }
    }

    if (hand.length === 0) {
      s.winnerIdx = seat;
      s.endReason = 'complete';
      s.notice = null;
      return;
    }

    const effect = playEffect(card, 4);
    if (effect.flipsDirection) {
      s.direction = s.direction === 1 ? -1 : 1;
    }
    if (effect.needsColorPick) {
      s.stage = 'pick-color';
      s.pendingColorIdx = seat;
      s.notice = notice;
      s.turnStartedAt = Date.now();
      return;
    }
    if (card.suit !== 'wild') {
      s.activeSuit = card.suit;
    }
    if (effect.victimDraws > 0) {
      const victim = nextSeatIndex(4, seat, s.direction, eliminatedSet());
      drawInto(s, victim, effect.victimDraws);
      const victimName = victim === 0 ? 'you' : BOT_NAMES[victim - 1]!;
      notice += ` - ${victimName} drew ${effect.victimDraws}`;
    }
    s.notice = notice;
    advance(s, effect.skipsNext ? 2 : 1);
  };

  const resolveColor = (s: DemoState, suit: ChromaSuit) => {
    const seat = s.pendingColorIdx!;
    const card = s.discard[s.discard.length - 1]!;
    s.activeSuit = suit;
    s.pendingColorIdx = null;
    s.stage = 'play';
    const effect = playEffect(card, 4);
    if (effect.victimDraws > 0) {
      const victim = nextSeatIndex(4, seat, s.direction, eliminatedSet());
      drawInto(s, victim, effect.victimDraws);
      const victimName = victim === 0 ? 'You' : BOT_NAMES[victim - 1]!;
      s.notice = `${victimName} drew ${effect.victimDraws}`;
    }
    s.turnIdx = seat;
    advance(s, effect.skipsNext ? 2 : 1);
  };

  const runBots = useCallback(() => {
    if (botTimer.current) {
      clearTimeout(botTimer.current);
    }
    botTimer.current = setTimeout(() => {
      setState(prev => {
        if (prev.winnerIdx !== null) {
          return prev;
        }
        const s: DemoState = {
          ...prev,
          hands: prev.hands.map(h => [...h]),
          drawPile: [...prev.drawPile],
          discard: [...prev.discard],
        };
        if (s.stage === 'pick-color' && s.pendingColorIdx !== null && s.pendingColorIdx !== 0) {
          resolveColor(s, chooseBotColor(s.hands[s.pendingColorIdx]!));
          return s;
        }
        if (s.turnIdx === 0 || s.stage !== 'play') {
          return prev;
        }
        const seat = s.turnIdx;
        const hand = s.hands[seat]!;
        const top = s.discard[s.discard.length - 1]!;
        const pick = chooseBotPlay(hand, s.activeSuit, top.value);
        if (pick !== null) {
          applyPlay(s, seat, pick, true);
        } else {
          const before = hand.length;
          drawInto(s, seat, 1);
          const drawn = hand[hand.length - 1];
          const name = BOT_NAMES[seat - 1]!;
          if (
            hand.length > before &&
            drawn &&
            isPlayable(drawn, s.activeSuit, top.value)
          ) {
            applyPlay(s, seat, hand.length - 1, true);
          } else {
            s.notice = `${name} drew a card`;
            advance(s, 1);
          }
        }
        return s;
      });
    }, BOT_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const botsBusy =
      state.winnerIdx === null &&
      ((state.stage === 'pick-color' && state.pendingColorIdx !== 0) ||
        (state.stage === 'play' && state.turnIdx !== 0));
    if (botsBusy) {
      runBots();
    }
  }, [state, runBots]);

  const onPlay = useCallback((handIndex: number, solo: boolean) => {
    setState(prev => {
      if (prev.winnerIdx !== null || prev.turnIdx !== 0 || prev.stage !== 'play') {
        return prev;
      }
      const hand = prev.hands[0]!;
      const card = hand[handIndex];
      const top = prev.discard[prev.discard.length - 1]!;
      if (!card || !isPlayable(card, prev.activeSuit, top.value)) {
        return prev;
      }
      if (prev.drawnIndex !== null && handIndex !== prev.drawnIndex) {
        return prev;
      }
      const s: DemoState = {
        ...prev,
        hands: prev.hands.map(h => [...h]),
        drawPile: [...prev.drawPile],
        discard: [...prev.discard],
      };
      applyPlay(s, 0, handIndex, solo);
      return s;
    });
  }, []);

  const onDraw = useCallback(() => {
    setState(prev => {
      if (
        prev.winnerIdx !== null ||
        prev.turnIdx !== 0 ||
        prev.stage !== 'play' ||
        prev.drawnIndex !== null
      ) {
        return prev;
      }
      const s: DemoState = {
        ...prev,
        hands: prev.hands.map(h => [...h]),
        drawPile: [...prev.drawPile],
        discard: [...prev.discard],
      };
      const drew = drawInto(s, 0, 1);
      const hand = s.hands[0]!;
      const drawn = drew > 0 ? hand[hand.length - 1]! : null;
      const top = s.discard[s.discard.length - 1]!;
      if (drawn && isPlayable(drawn, s.activeSuit, top.value)) {
        s.drawnIndex = hand.length - 1;
        s.notice = 'Playable! Play it or keep it and pass';
        s.turnStartedAt = Date.now();
      } else {
        s.notice = 'Nothing playable - turn passes';
        advance(s, 1);
      }
      return s;
    });
  }, []);

  const onPass = useCallback(() => {
    setState(prev => {
      if (prev.winnerIdx !== null || prev.turnIdx !== 0 || prev.drawnIndex === null) {
        return prev;
      }
      const s: DemoState = { ...prev, hands: prev.hands.map(h => [...h]) };
      s.notice = null;
      advance(s, 1);
      return s;
    });
  }, []);

  const onPickColor = useCallback((suit: ChromaSuit) => {
    setState(prev => {
      if (prev.stage !== 'pick-color' || prev.pendingColorIdx !== 0) {
        return prev;
      }
      const s: DemoState = {
        ...prev,
        hands: prev.hands.map(h => [...h]),
        drawPile: [...prev.drawPile],
        discard: [...prev.discard],
      };
      resolveColor(s, suit);
      return s;
    });
  }, []);

  const onTimerExpire = useCallback(() => {
    setState(prev => {
      if (prev.winnerIdx !== null) {
        return prev;
      }
      const myMove =
        (prev.stage === 'play' && prev.turnIdx === 0) ||
        (prev.stage === 'pick-color' && prev.pendingColorIdx === 0);
      if (!myMove) {
        return prev;
      }
      const s: DemoState = {
        ...prev,
        hands: prev.hands.map(h => [...h]),
        drawPile: [...prev.drawPile],
        discard: [...prev.discard],
      };
      s.myTimeouts = prev.myTimeouts + 1;
      if (s.myTimeouts >= MAX_TIMEOUTS) {
        s.winnerIdx = 1;
        s.endReason = 'timeout';
        return s;
      }
      if (s.stage === 'pick-color') {
        resolveColor(s, chooseBotColor(s.hands[0]!));
      } else {
        drawInto(s, 0, 1);
        advance(s, 1);
      }
      s.notice = `Time ran out - you drew a card (${s.myTimeouts}/${MAX_TIMEOUTS})`;
      return s;
    });
  }, []);

  const seats: ChromaSeatView[] = state.hands.map((hand, i) => ({
    userId: `seat-${i}`,
    name: i === 0 ? 'You' : BOT_NAMES[i - 1]!,
    initial: i === 0 ? 'Y' : BOT_NAMES[i - 1]!.charAt(0),
    isMe: i === 0,
    online: true,
    eliminated: false,
    cardCount: hand.length,
    onTurn: state.winnerIdx === null && state.turnIdx === i,
  }));

  const result: 'win' | 'lose' | null =
    state.winnerIdx === null ? null : state.winnerIdx === 0 ? 'win' : 'lose';

  const playProps: ChromaPlayProps = {
    seats,
    myHand: state.hands[0]!,
    myTurn: result === null && state.turnIdx === 0 && state.stage === 'play',
    stage: state.stage,
    activeSuit: state.activeSuit,
    discardTop: state.discard[state.discard.length - 1]!,
    drawPileCount: state.drawPile.length,
    direction: state.direction,
    myDrawnIndex: state.drawnIndex,
    pickingColor: state.stage === 'pick-color' && state.pendingColorIdx === 0,
    notice: state.notice,
    turnDeadline:
      result !== null ? null : state.turnStartedAt + TURN_SECONDS * 1000,
    result,
    resultReason: result ? state.endReason : null,
    winnerName:
      state.winnerIdx === null
        ? null
        : state.winnerIdx === 0
          ? 'You'
          : BOT_NAMES[state.winnerIdx - 1]!,
    onPlay,
    onDraw,
    onPass,
    onPickColor,
    onTimerExpire,
  };

  return { phase: 'play', forfeit: () => {}, playProps };
}
