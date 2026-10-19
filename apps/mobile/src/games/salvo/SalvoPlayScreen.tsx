import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  SALVO_FIELD_WIDTH,
  SALVO_MAX_POWER,
  SALVO_MIN_POWER,
  SALVO_MOVE_RANGE,
  SalvoSide,
  formatStakeAmount,
  salvoAccuracy,
  STAKE_ASSET_SYMBOLS,
  type StakeAsset,
} from '@gaming-platform/core';

import GameResultScreen, {
  type ResultStat,
} from '../../components/GameResultScreen';
import Icon from '../../components/Icon';
import { GradientView } from '../../components/GradientView';
import { MatchHeader, MatchPlayerBar } from '../../components/MatchChrome';
import { colors, radius, spacing } from '../../theme/colors';
import { display, fonts, mono } from '../../theme/typography';
import SalvoBattlefield from './SalvoBattlefield';
import type { SalvoPlayProps } from './salvo-engine';

export type SalvoPlayScreenProps = SalvoPlayProps & {
  stake?: { token: StakeAsset; amount: string } | null;
  onExit: () => void;
  onQuit: () => void;
};

const VISIBLE_UNITS = 190;
const IN_VIEW_INSET = 48;
const STEP = { angle: 1, power: 2 };

export default function SalvoPlayScreen({
  terrain,
  seats,
  me,
  myTurn,
  armed,
  movesLeft,
  wind,
  shotNumber,
  round,
  flight,
  trail,
  aiming,
  damage,
  destroyed,
  notice,
  turnDeadline,
  result,
  resultReason,
  stats,
  onAim,
  onMove,
  onFire,
  onTimerExpire,
  stake,
  onExit,
  onQuit,
}: SalvoPlayScreenProps) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const scroller = useRef<ScrollView>(null);
  const scrollX = useRef(0);
  const latchedShot = useRef<number | null>(null);
  const following = useRef(false);
  const centredTurn = useRef<number | null>(null);
  const framed = useRef(false);

  const mine = seats.find(s => s.side === me)!;
  const foe = seats.find(s => s.side !== me)!;

  const scale = viewport.width / VISIBLE_UNITS;
  const worldWidth = SALVO_FIELD_WIDTH * scale;

  const centreOn = useCallback(
    (terrainX: number, animated: boolean) => {
      if (viewport.width === 0) {
        return;
      }
      const target = Math.max(
        0,
        Math.min(worldWidth - viewport.width, terrainX * scale - viewport.width / 2),
      );
      scroller.current?.scrollTo({ x: target, animated });
    },
    [scale, viewport.width, worldWidth],
  );

  const isInView = useCallback(
    (terrainX: number) => {
      const at = terrainX * scale;
      return (
        at >= scrollX.current + IN_VIEW_INSET &&
        at <= scrollX.current + viewport.width - IN_VIEW_INSET
      );
    },
    [scale, viewport.width],
  );

  // Skipped until the world is framed once, or the first turn would consume the latch while scrollTo is a no-op.
  useEffect(() => {
    if (myTurn && framed.current && centredTurn.current !== shotNumber) {
      centredTurn.current = shotNumber;
      centreOn(mine.x, true);
    }
    // Only the turn handover should recentre, never a mid-turn drive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, shotNumber]);

  useEffect(() => {
    if (!flight) {
      return;
    }
    if (latchedShot.current !== flight.id) {
      latchedShot.current = flight.id;
      const target = seats.find(s => s.side !== flight.shooter);
      following.current = target ? !isInView(target.x) : false;
    }
    if (following.current) {
      centreOn(flight.shell.x, false);
    }
  }, [flight, seats, isInView, centreOn]);

  if (result) {
    const mineStats = stats[me];
    const resultStats: ResultStat[] = [
      { value: `${mineStats.shots}`, label: 'SHOTS' },
      { value: `${salvoAccuracy(mineStats)}%`, label: 'ACCURACY', highlight: result === 'win' },
      { value: `${mineStats.bestHit}`, label: 'BEST HIT' },
      { value: `${round}`, label: 'ROUNDS' },
    ];
    if (stake) {
      const symbol = STAKE_ASSET_SYMBOLS[stake.token];
      const amount = formatStakeAmount(stake.amount, stake.token);
      const pot = formatStakeAmount(
        (BigInt(stake.amount) * BigInt(seats.length)).toString(),
        stake.token,
      );
      resultStats.push(
        result === 'win'
          ? { value: `${pot} ${symbol}`, label: 'POT WON', highlight: true }
          : { value: `${amount} ${symbol}`, label: 'STAKE LOST' },
      );
    }

    const copy =
      result === 'win'
        ? {
            eyebrow: resultReason === 'forfeit' ? 'OPPONENT FORFEITED' : 'TANK DESTROYED',
            message:
              resultReason === 'forfeit'
                ? `${foe.name} abandoned the field. The ridge is yours.`
                : `You knocked out ${foe.name} in round ${round}.`,
          }
        : {
            eyebrow: resultReason === 'forfeit' ? 'MATCH FORFEITED' : 'HULL DESTROYED',
            message:
              resultReason === 'forfeit'
                ? 'You left the field to the enemy.'
                : `${foe.name} knocked you out in round ${round}.`,
          };

    return (
      <GameResultScreen
        variant={result}
        icon={result === 'win' ? 'trophy' : 'flag'}
        eyebrow={copy.eyebrow}
        title={result === 'win' ? 'VICTORY' : 'DEFEAT'}
        message={copy.message}
        opponent={{
          initial: foe.initial,
          label: result === 'win' ? 'DESTROYED' : 'LOST TO',
          name: foe.name,
        }}
        stats={resultStats}
        onBack={onQuit}
      />
    );
  }

  const inbound = flight !== null && flight.shooter !== me;

  const bump = (key: 'angle' | 'power', dir: 1 | -1) =>
    onAim({ [key]: (key === 'angle' ? mine.angle : mine.power) + STEP[key] * dir });

  const onFieldLayout = (e: LayoutChangeEvent) =>
    setViewport({
      width: e.nativeEvent.layout.width,
      height: e.nativeEvent.layout.height,
    });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollX.current = e.nativeEvent.contentOffset.x;
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <MatchHeader label="ARTILLERY DUEL" title="Salvo" onBack={onExit} />

      <View style={styles.barWrap}>
        <MatchPlayerBar
          me={{ initial: mine.initial, name: mine.name, sub: `${mine.hp} HP` }}
          opponent={{ initial: foe.initial, name: foe.name, sub: `${foe.hp} HP` }}
          myTurn={myTurn}
          turnDeadline={turnDeadline}
          onTimerExpire={myTurn ? onTimerExpire : undefined}
        />
      </View>

      <View style={styles.fieldWrap} onLayout={onFieldLayout}>
        {viewport.width > 0 && (
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            onScroll={onScroll}
            contentContainerStyle={{ width: worldWidth }}
            onContentSizeChange={() => {
              // Centring before the first measure just clamps scrollTo to 0.
              if (!framed.current) {
                framed.current = true;
                centredTurn.current = shotNumber;
                centreOn(mine.x, false);
              }
            }}
          >
            <SalvoBattlefield
              width={worldWidth}
              height={viewport.height}
              terrain={terrain}
              tanks={seats}
              trajectory={flight?.path ?? trail?.path ?? null}
              trajectorySide={flight?.shooter ?? trail?.shooter ?? null}
              shell={flight?.shell ?? null}
              impact={trail?.impact ?? null}
              incomingOn={inbound ? me : null}
              aimingSide={aiming}
              impactId={trail?.id ?? null}
              destroyedSide={destroyed}
              damage={damage}
              draggableSide={armed ? me : null}
              onAimAngle={angle => onAim({ angle })}
            />
          </ScrollView>
        )}

        <View
          style={[
            styles.statusPill,
            inbound ? styles.statusPillDanger : styles.statusPillAccent,
          ]}
          pointerEvents="none"
        >
          {inbound ? (
            <Icon type="warning" color={colors.dangerLight} size={12} />
          ) : (
            <View style={styles.statusDot} />
          )}
          <Text
            style={[
              styles.statusText,
              { color: inbound ? colors.dangerLight : colors.accent100 },
            ]}
          >
            {inbound ? 'SHELL INBOUND' : `SHOT ${shotNumber} / ROUND ${round}`}
          </Text>
        </View>

        <View style={styles.windPill} pointerEvents="none">
          <Icon type="wind" color={colors.accent300} size={13} />
          <Text style={styles.windValue}>{Math.abs(wind)}</Text>
          <Icon
            type={wind >= 0 ? 'chevron-right' : 'chevron-left'}
            color={colors.accent}
            size={13}
          />
        </View>

        {viewport.width > 0 && !isInView(foe.x) && (
          <View
            style={[
              styles.offscreen,
              foe.x * scale < scrollX.current ? styles.offscreenLeft : styles.offscreenRight,
            ]}
            pointerEvents="none"
          >
            <Icon
              type={foe.x * scale < scrollX.current ? 'chevron-left' : 'chevron-right'}
              color={colors.salvoEnemy}
              size={14}
            />
            <Text style={styles.offscreenText}>{foe.name}</Text>
          </View>
        )}

        {notice && (
          <View style={styles.noticeWrap} pointerEvents="none">
            <Text style={styles.notice}>{notice}</Text>
          </View>
        )}
      </View>

      <View style={styles.controls}>
        <View style={[styles.dials, !armed && styles.dialsIdle]}>
          <View style={styles.dial}>
            <View style={styles.dialHead}>
              <Text style={styles.dialLabel}>ANGLE</Text>
              <Icon type="angle" color={colors.textMuted} size={13} />
            </View>
            <View style={styles.dialBody}>
              <Pressable
                style={styles.nudge}
                disabled={!armed}
                onPress={() => bump('angle', -1)}
                hitSlop={8}
              >
                <Icon type="minus" color={colors.textPrimary} size={11} />
              </Pressable>
              <Text style={styles.dialValue}>{Math.round(mine.angle)}°</Text>
              <Pressable
                style={styles.nudge}
                disabled={!armed}
                onPress={() => bump('angle', 1)}
                hitSlop={8}
              >
                <Icon type="plus" color={colors.textPrimary} size={11} />
              </Pressable>
            </View>
          </View>

          <View style={styles.dial}>
            <View style={styles.dialHead}>
              <Text style={styles.dialLabel}>POWER</Text>
              <Text style={styles.powerValue}>{Math.round(mine.power)}</Text>
            </View>
            <View style={styles.powerRow}>
              <Pressable
                style={styles.nudge}
                disabled={!armed}
                onPress={() => bump('power', -1)}
                hitSlop={8}
              >
                <Icon type="minus" color={colors.textPrimary} size={11} />
              </Pressable>
              <View style={styles.powerTrack}>
                <GradientView
                  colors={[colors.accent600, colors.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.powerFill, { width: `${powerPct(mine.power)}%` }]}
                />
              </View>
              <Pressable
                style={styles.nudge}
                disabled={!armed}
                onPress={() => bump('power', 1)}
                hitSlop={8}
              >
                <Icon type="plus" color={colors.textPrimary} size={11} />
              </Pressable>
            </View>
            <View style={styles.powerScale}>
              <Text style={styles.powerTick}>{SALVO_MIN_POWER}</Text>
              <Text style={styles.powerTick}>{SALVO_MAX_POWER}</Text>
            </View>
          </View>
        </View>

        {myTurn ? (
          <View style={styles.actions}>
            <View style={styles.moveGroup}>
              <Pressable
                style={styles.moveButton}
                disabled={!armed || movesLeft <= 0}
                onPress={() => onMove(-1)}
                hitSlop={6}
              >
                <Icon
                  type="chevron-left"
                  color={armed && movesLeft > 0 ? colors.accent300 : colors.textFaint}
                  size={18}
                />
              </Pressable>
              <View style={styles.moveMeter}>
                <View
                  style={[
                    styles.moveMeterFill,
                    { width: `${(movesLeft / SALVO_MOVE_RANGE) * 100}%` },
                  ]}
                />
              </View>
              <Pressable
                style={styles.moveButton}
                disabled={!armed || movesLeft <= 0}
                onPress={() => onMove(1)}
                hitSlop={6}
              >
                <Icon
                  type="chevron-right"
                  color={armed && movesLeft > 0 ? colors.accent300 : colors.textFaint}
                  size={18}
                />
              </Pressable>
            </View>
            <Pressable
              style={[styles.fire, !armed && styles.fireIdle]}
              disabled={!armed}
              onPress={onFire}
            >
              <Icon type="crosshair" color={colors.onAccent} size={17} />
              <Text style={styles.fireText}>{armed ? 'FIRE' : 'MOVING'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.waiting}>
            <View style={styles.waitingDot} />
            <Text style={styles.waitingText}>
              {destroyed !== null
                ? destroyed === me
                  ? 'YOUR TANK IS DESTROYED'
                  : `${foe.name.toUpperCase()} IS DESTROYED`
                : inbound
                  ? 'SHELL IN THE AIR'
                  : `${foe.name.toUpperCase()} IS AIMING`}
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const powerPct = (power: number) =>
  ((power - SALVO_MIN_POWER) / (SALVO_MAX_POWER - SALVO_MIN_POWER)) * 100;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.salvoGround },
  barWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },

  fieldWrap: { flex: 1, marginTop: spacing.sm, overflow: 'hidden' },
  statusPill: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
    borderWidth: 1,
  },
  statusPillAccent: {
    backgroundColor: 'rgba(142, 224, 90, 0.18)',
    borderColor: colors.accentBorder,
  },
  statusPillDanger: {
    backgroundColor: 'rgba(255, 90, 110, 0.2)',
    borderColor: 'rgba(255, 90, 110, 0.45)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.9,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  statusText: { fontSize: 9.5, fontFamily: fonts.bold, letterSpacing: 1.3 },

  windPill: {
    position: 'absolute',
    right: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 11,
    backgroundColor: 'rgba(8, 9, 16, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(233, 233, 237, 0.12)',
  },
  windValue: { fontSize: 11, fontFamily: mono.bold, color: colors.textPrimary },

  offscreen: {
    position: 'absolute',
    top: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(8, 9, 16, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(233, 233, 237, 0.12)',
  },
  offscreenLeft: { left: 10 },
  offscreenRight: { right: 10 },
  offscreenText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: colors.salvoEnemy,
  },

  noticeWrap: { position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' },
  notice: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 0.4,
    color: colors.textSecondary,
    backgroundColor: 'rgba(8, 9, 16, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },

  controls: {
    paddingHorizontal: spacing.md,
    paddingTop: 14,
    paddingBottom: spacing.xs,
    gap: 13,
    backgroundColor: colors.salvoGround,
    borderTopWidth: 1,
    borderTopColor: 'rgba(233, 233, 237, 0.1)',
  },
  dials: { flexDirection: 'row', gap: 11 },
  dialsIdle: { opacity: 0.34 },
  dial: {
    flex: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: colors.salvoPanel,
    borderWidth: 1,
    borderColor: 'rgba(233, 233, 237, 0.09)',
  },
  dialHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dialLabel: {
    fontSize: 8.5,
    fontFamily: fonts.semiBold,
    letterSpacing: 1.3,
    color: colors.textMuted,
  },
  dialBody: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  dialValue: {
    fontSize: 21,
    fontFamily: mono.bold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  nudge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(233, 233, 237, 0.09)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerValue: { fontSize: 8.5, fontFamily: mono.bold, color: colors.accent200 },
  powerRow: { marginTop: 11, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  powerTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(233, 233, 237, 0.11)',
    overflow: 'hidden',
  },
  powerFill: { height: '100%', borderRadius: 4 },
  powerScale: { marginTop: 9, flexDirection: 'row', justifyContent: 'space-between' },
  powerTick: { fontSize: 8, fontFamily: mono.semiBold, color: colors.textFaint },

  actions: { flexDirection: 'row', gap: 11 },
  moveGroup: {
    width: 124,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 15,
    backgroundColor: colors.salvoPanel,
    borderWidth: 1,
    borderColor: 'rgba(233, 233, 237, 0.09)',
  },
  moveButton: {
    width: 30,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveMeter: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(233, 233, 237, 0.11)',
    overflow: 'hidden',
  },
  moveMeterFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent600 },
  fire: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 18,
    borderRadius: 15,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fireIdle: { opacity: 0.45 },
  fireText: {
    fontSize: 15,
    fontFamily: display.extraBold,
    letterSpacing: 0.9,
    color: colors.onAccent,
  },
  waiting: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
    borderRadius: 15,
    backgroundColor: colors.salvoPanel,
    borderWidth: 1,
    borderColor: 'rgba(233, 233, 237, 0.09)',
  },
  waitingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.textPrimary,
  },
  waitingText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    color: colors.textSecondary,
  },
});
