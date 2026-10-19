import { StyleSheet, View } from 'react-native';
import { SALVO_TANK_SCALE, SalvoSide } from '@gaming-platform/core';

import { colors } from '../../theme/colors';

type Props = {
  side: SalvoSide;
  x: number;
  y: number;
  angle: number;
  destroyed: boolean;
  tilt?: number;
  scale?: number;
};

export default function SalvoTank({
  side,
  x,
  y,
  angle,
  destroyed,
  tilt = 0,
  scale = 1,
}: Props) {
  const left = side === SalvoSide.Left;
  const s = (v: number) => v * scale * SALVO_TANK_SCALE;
  const body = left ? colors.accent : colors.salvoEnemy;
  const tread = left ? colors.salvoTread : colors.salvoEnemyTread;

  const at = (offset: number) => (left ? { left: s(offset) } : { right: s(offset) });

  const frame = {
    left: x - s(20),
    top: y - s(24),
    width: s(40),
    height: s(24),
  };

  const lean = frame.height / 2;
  const contour = [
    { translateY: lean },
    { rotate: `${-tilt}deg` },
    { translateY: -lean },
  ];

  if (destroyed) {
    return (
      <View
        style={[
          styles.frame,
          frame,
          { top: y - s(28), height: s(28), transform: contour },
        ]}
      >
        <View
          style={[
            styles.glow,
            { left: s(-2), bottom: s(2), width: s(44), height: s(26), borderRadius: s(13) },
          ]}
        />
        <View
          style={[
            styles.piece,
            at(4),
            {
              bottom: s(1),
              width: s(30),
              height: s(7),
              borderRadius: s(4),
              backgroundColor: colors.salvoWreck,
              transform: [{ rotate: left ? '7deg' : '-7deg' }],
            },
          ]}
        />
        <View
          style={[
            styles.piece,
            at(20),
            {
              bottom: s(6),
              width: s(16),
              height: s(3),
              borderRadius: s(2),
              backgroundColor: colors.salvoWreck,
              transform: [{ rotate: left ? '-58deg' : '58deg' }],
            },
          ]}
        />
      </View>
    );
  }

  const barrelW = s(left ? 22 : 20);
  // RN rotates about the centre; composing T(c) * R * T(-c) pivots on the near edge instead.
  const hinge = left ? -barrelW / 2 : barrelW / 2;

  return (
    <View style={[styles.frame, frame, { transform: contour }]} pointerEvents="none">
      <View
        style={[
          styles.piece,
          at(15),
          {
            bottom: s(11),
            width: barrelW,
            height: s(3.5),
            borderRadius: s(2),
            backgroundColor: body,
            // Elevation is absolute in the physics, so the barrel cancels out the hull's lean.
            transform: [
              { translateX: hinge },
              { rotate: `${(left ? -angle : angle) + tilt}deg` },
              { translateX: -hinge },
            ],
          },
        ]}
      />
      <View
        style={[
          styles.piece,
          at(9),
          {
            bottom: s(8),
            width: s(13),
            height: s(8),
            borderTopLeftRadius: s(4),
            borderTopRightRadius: s(4),
            backgroundColor: body,
          },
        ]}
      />
      <View
        style={[
          styles.piece,
          at(1),
          {
            bottom: s(1),
            width: s(29),
            height: s(8),
            borderRadius: s(4),
            backgroundColor: body,
          },
        ]}
      />
      <View
        style={[
          styles.piece,
          at(3),
          {
            bottom: 0,
            width: s(25),
            height: s(2.5),
            borderRadius: s(2),
            backgroundColor: tread,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute' },
  piece: { position: 'absolute' },
  glow: {
    position: 'absolute',
    backgroundColor: colors.goldSoft,
  },
});
