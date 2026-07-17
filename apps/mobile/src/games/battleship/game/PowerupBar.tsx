import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '../../../components/Icon';
import { GradientView } from '../../../components/GradientView';
import { colors, radius, spacing } from '../../../theme/colors';
import { display, mono } from '../../../theme/typography';
import {
  CHARGE_BAR_MAX,
  POWERUP_COSTS,
  POWERUP_MAX_USES,
  type PowerupKind,
} from './powerups';

type PowerupDef = {
  kind: PowerupKind;
  icon: IconName;
  label: string;
  blurb: string;
};

const POWERUPS: PowerupDef[] = [
  { kind: 'torpedo', icon: 'rocket', label: 'Torpedo', blurb: 'Clears a full row' },
  { kind: 'bomb', icon: 'bomb', label: 'Bomb', blurb: '3×3 area blast' },
];

// Amber "energy" gradient for the charge bar (distinct from the brand gradient).
const CHARGE_GRADIENT = {
  colors: ['#fde047', '#f59e0b'],
  positions: [0.15, 0.85],
} as const;

type Props = {
  /** Current charge points - earned by hitting enemy ships. */
  points: number;
  /** Uses spent so far per power-up (each is capped at POWERUP_MAX_USES). */
  used: Record<PowerupKind, number>;
  armed: PowerupKind | null;
  onArm: (kind: PowerupKind) => void;
};

/** Power-ups with a charge bar. Each hit adds a point; each power-up has its
 *  own cost and a per-match use cap. A card is armable only while you can
 *  afford it and have uses left. */
export default function PowerupBar({ points, used, armed, onArm }: Props) {
  const fill = Math.min(points / CHARGE_BAR_MAX, 1);
  const [showTip, setShowTip] = useState(false);

  return (
    <View style={styles.container}>
      <View style={styles.headingRow}>
        <View style={styles.headingLeft}>
          <Text style={styles.heading}>POWER-UPS</Text>
          <Pressable onPress={() => setShowTip(t => !t)} hitSlop={8}>
            <Icon type="help" color={colors.textMuted} size={14} />
          </Pressable>
        </View>
        <View style={styles.pointsPill}>
          <Icon type="zap" color={colors.kombatAccent} size={12} />
          <Text style={styles.pointsText}>{points} PTS</Text>
        </View>
      </View>

      {showTip && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>
            Land a hit on an enemy ship to earn 1 charge point. A torpedo costs{' '}
            {POWERUP_COSTS.torpedo} points and a bomb {POWERUP_COSTS.bomb};
            each can be fired {POWERUP_MAX_USES}× per match.
          </Text>
        </View>
      )}

      <View style={styles.chargeTrack}>
        <GradientView
          colors={CHARGE_GRADIENT.colors}
          positions={CHARGE_GRADIENT.positions}
          style={[styles.chargeFill, { width: `${fill * 100}%` }]}
        />
      </View>

      <View style={styles.row}>
        {POWERUPS.map(p => {
          const isArmed = armed === p.kind;
          const left = POWERUP_MAX_USES - (used[p.kind] ?? 0);
          const disabled = left <= 0 || points < POWERUP_COSTS[p.kind];
          return (
            <Pressable
              key={p.kind}
              disabled={disabled}
              onPress={() => onArm(p.kind)}
              style={[
                styles.card,
                isArmed && styles.cardArmed,
                disabled && styles.cardDisabled,
              ]}
            >
              <View style={styles.iconWrap}>
                <Icon type={p.icon} color={colors.textPrimary} size={22} />
              </View>
              <View style={styles.cardText}>
                <View style={styles.titleRow}>
                  <Text style={styles.title}>{p.label}</Text>
                  <View style={styles.costBadge}>
                    <Icon type="zap" color={colors.textMuted} size={9} />
                    <Text style={styles.costText}>{POWERUP_COSTS[p.kind]}</Text>
                  </View>
                </View>
                <Text style={styles.blurb}>
                  {left > 0 ? `${p.blurb} · ${left} left` : 'No uses left'}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.md,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  headingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heading: {
    fontSize: 11,
    fontFamily: mono.medium,
    color: colors.textMuted,
    letterSpacing: 1.5,
  },
  tooltip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.chip,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  tooltipText: {
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 17,
  },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pointsText: {
    fontSize: 11,
    fontFamily: mono.bold,
    color: colors.gold,
    letterSpacing: 0.5,
  },
  chargeTrack: {
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  chargeFill: {
    height: '100%',
    borderRadius: 6,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radius.card,
    padding: spacing.sm,
  },
  cardArmed: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(124, 92, 255, 0.12)',
  },
  cardDisabled: {
    opacity: 0.4,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontFamily: display.semiBold,
    color: colors.textPrimary,
  },
  costBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.chip,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  costText: {
    fontSize: 11,
    fontFamily: mono.bold,
    color: colors.textMuted,
  },
  blurb: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
