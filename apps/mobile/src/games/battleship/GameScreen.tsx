import { useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type GestureResponderEvent,
} from 'react-native';
import { Canvas, Group, Line, Rect, RoundedRect, vec } from '@shopify/react-native-skia';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import Icon from '../../components/Icon';
import type { GamesStackParamList } from '../../navigation/types';
import { fonts } from '../../theme/typography';

type Props = NativeStackScreenProps<GamesStackParamList, 'Battleship'>;

const GRID = 10;
const LABEL = 22; // gutter for the 1-10 axis labels
const AXIS = Array.from({ length: GRID }, (_, i) => i + 1);

type Orientation = 'h' | 'v';
type Ship = { id: string; label: string; size: number };
type Cell = { r: number; c: number };
type Placement = { row: number; col: number; orientation: Orientation };
type Preview = { cells: Cell[]; valid: boolean };

const SHIPS: Ship[] = [
  { id: 'carrier', label: 'Carrier', size: 5 },
  { id: 'battleship', label: 'Battleship', size: 4 },
  { id: 'cruiser', label: 'Cruiser', size: 3 },
  { id: 'submarine', label: 'Submarine', size: 3 },
  { id: 'destroyer', label: 'Destroyer', size: 2 },
];

// --- pure board helpers (easy to lift into packages/games later) ---
function cellsFor(p: Placement, size: number): Cell[] {
  return Array.from({ length: size }, (_, i) => ({
    r: p.orientation === 'v' ? p.row + i : p.row,
    c: p.orientation === 'h' ? p.col + i : p.col,
  }));
}

function buildOccupied(
  placements: Record<string, Placement>,
  shipById: Record<string, Ship>,
): Set<string> {
  const set = new Set<string>();
  for (const [id, p] of Object.entries(placements)) {
    for (const { r, c } of cellsFor(p, shipById[id]!.size)) set.add(`${r},${c}`);
  }
  return set;
}

function canPlace(cells: Cell[], occupied: Set<string>): boolean {
  return cells.every(
    ({ r, c }) =>
      r >= 0 && r < GRID && c >= 0 && c < GRID && !occupied.has(`${r},${c}`),
  );
}

export default function GameScreen(_props: Props) {
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - 32 - LABEL, 340);
  const cell = boardSize / GRID;

  const [placements, setPlacements] = useState<Record<string, Placement>>({});
  const [orientation, setOrientation] = useState<Orientation>('h');
  const [preview, setPreview] = useState<Preview | null>(null);

  const shipById = Object.fromEntries(SHIPS.map(s => [s.id, s])) as Record<string, Ship>;

  const boardRef = useRef<View>(null);
  const boardOrigin = useRef({ x: 0, y: 0 }); // window coords of board top-left
  // Read latest values inside stable pan handlers.
  const orientationRef = useRef(orientation);
  orientationRef.current = orientation;
  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  const measureBoard = () =>
    boardRef.current?.measureInWindow((x, y) => {
      boardOrigin.current = { x, y };
    });

  // Map the finger position to a candidate placement + validity.
  const candidateAt = (ship: Ship, pageX: number, pageY: number) => {
    const { x, y } = boardOrigin.current;
    const col = Math.floor((pageX - x) / cell);
    const row = Math.floor((pageY - y) / cell);
    const cells = cellsFor({ row, col, orientation: orientationRef.current }, ship.size);
    const occ = buildOccupied(placementsRef.current, shipById);
    const inside =
      pageX >= x && pageX <= x + boardSize && pageY >= y && pageY <= y + boardSize;
    return { row, col, cells, valid: canPlace(cells, occ), inside };
  };

  const onDragMove = (ship: Ship, pageX: number, pageY: number) => {
    const { cells, valid, inside } = candidateAt(ship, pageX, pageY);
    setPreview(inside ? { cells, valid } : null);
  };

  const onDrop = (ship: Ship, pageX: number, pageY: number, snapBack: () => void) => {
    const { row, col, cells, valid, inside } = candidateAt(ship, pageX, pageY);
    if (inside && valid) {
      setPlacements(prev => ({ ...prev, [ship.id]: { row, col, orientation: orientationRef.current } }));
    } else {
      snapBack();
    }
    void cells;
    setPreview(null);
  };

  // Tap a placed ship to send it back to the tray.
  const removeAtPoint = (e: GestureResponderEvent) => {
    const col = Math.floor(e.nativeEvent.locationX / cell);
    const row = Math.floor(e.nativeEvent.locationY / cell);
    setPlacements(prev => {
      const hitId = Object.keys(prev).find(id =>
        cellsFor(prev[id]!, shipById[id]!.size).some(c => c.r === row && c.c === col),
      );
      if (!hitId) return prev;
      const { [hitId]: _removed, ...rest } = prev;
      return rest;
    });
  };

  const gridLines = Array.from({ length: GRID + 1 }, (_, i) => i * cell);
  const unplaced = SHIPS.filter(s => !placements[s.id]);
  const previewColor = preview?.valid
    ? 'rgba(34,197,94,0.55)' // green
    : 'rgba(239,68,68,0.55)'; // red

  return (
    <View style={styles.container}>
      <Text style={styles.hint}>
        Drag a ship onto the grid. Tap a placed ship to remove it.
      </Text>

      {/* Column labels 1-10 */}
      <View style={styles.rowLine}>
        <View style={{ width: LABEL }} />
        {AXIS.map(n => (
          <Text key={`c${n}`} style={[styles.axisLabel, { width: cell }]}>
            {n}
          </Text>
        ))}
      </View>

      <View style={styles.rowLine}>
        {/* Row labels 1-10 */}
        <View style={{ width: LABEL }}>
          {AXIS.map(n => (
            <Text key={`r${n}`} style={[styles.axisLabel, { height: cell, lineHeight: cell }]}>
              {n}
            </Text>
          ))}
        </View>

        {/* Board */}
        <View
          ref={boardRef}
          onLayout={measureBoard}
          style={{ width: boardSize, height: boardSize }}>
          <Canvas style={StyleSheet.absoluteFill}>
            <Rect x={0} y={0} width={boardSize} height={boardSize} color="#dbeafe" />
            <Group>
              {gridLines.map(pos => (
                <Line key={`v${pos}`} p1={vec(pos, 0)} p2={vec(pos, boardSize)} color="#93c5fd" strokeWidth={1} />
              ))}
              {gridLines.map(pos => (
                <Line key={`h${pos}`} p1={vec(0, pos)} p2={vec(boardSize, pos)} color="#93c5fd" strokeWidth={1} />
              ))}
            </Group>

            {/* Placed ships */}
            {Object.entries(placements).map(([id, p]) => {
              const size = shipById[id]!.size;
              const w = (p.orientation === 'h' ? size : 1) * cell;
              const h = (p.orientation === 'v' ? size : 1) * cell;
              return (
                <RoundedRect key={id} x={p.col * cell + 2} y={p.row * cell + 2} width={w - 4} height={h - 4} r={6} color="#334155" />
              );
            })}

            {/* Live drag preview (green = valid, red = invalid) */}
            {preview?.cells
              .filter(({ r, c }) => r >= 0 && r < GRID && c >= 0 && c < GRID)
              .map(({ r, c }) => (
                <Rect key={`p${r}-${c}`} x={c * cell + 1} y={r * cell + 1} width={cell - 2} height={cell - 2} color={previewColor} />
              ))}
          </Canvas>
          <Pressable style={StyleSheet.absoluteFill} onPress={removeAtPoint} />
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable style={styles.btn} onPress={() => setOrientation(o => (o === 'h' ? 'v' : 'h'))}>
          <Text style={styles.btnText}>Rotate ({orientation})</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={() => setPlacements({})}>
          <Text style={styles.btnText}>Reset</Text>
        </Pressable>
      </View>

      {/* Tray of draggable ships */}
      <View style={styles.tray}>
        {unplaced.map(ship => (
          <DraggableShip
            key={ship.id}
            ship={ship}
            onDragStart={measureBoard}
            onDragMove={onDragMove}
            onDrop={onDrop}
            onCancel={() => setPreview(null)}
          />
        ))}
        {unplaced.length === 0 && (
          <View style={styles.allPlacedRow}>
            <Icon type="party" color="#16a34a" size={16} />
            <Text style={styles.allPlaced}>All ships placed</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const MINI = 22;

function DraggableShip({
  ship,
  onDragStart,
  onDragMove,
  onDrop,
  onCancel,
}: {
  ship: Ship;
  onDragStart: () => void;
  onDragMove: (ship: Ship, pageX: number, pageY: number) => void;
  onDrop: (ship: Ship, pageX: number, pageY: number, snapBack: () => void) => void;
  onCancel: () => void;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  const snapBack = () =>
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setDragging(true);
        pan.setValue({ x: 0, y: 0 });
        onDragStart();
      },
      onPanResponderMove: (_e, g) => {
        pan.setValue({ x: g.dx, y: g.dy });
        onDragMove(ship, g.moveX, g.moveY);
      },
      onPanResponderRelease: (_e, g) => {
        onDrop(ship, g.moveX, g.moveY, snapBack);
        setDragging(false);
      },
      onPanResponderTerminate: () => {
        snapBack();
        onCancel();
        setDragging(false);
      },
    }),
  ).current;

  return (
    <View style={styles.trayItem}>
      {/* Only the ship graphic is draggable — not the label. */}
      <Animated.View
        {...responder.panHandlers}
        style={[
          dragging && styles.dragging,
          { transform: pan.getTranslateTransform() },
        ]}>
        <Canvas style={{ width: ship.size * MINI, height: MINI }}>
          <RoundedRect x={1} y={1} width={ship.size * MINI - 2} height={MINI - 2} r={5} color="#334155" />
        </Canvas>
      </Animated.View>
      <Text style={styles.trayLabel}>
        {ship.label} ({ship.size})
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', padding: 16, gap: 12 },
  hint: { fontSize: 14, color: '#475569', textAlign: 'center' },
  rowLine: { flexDirection: 'row' },
  axisLabel: { fontSize: 11, color: '#64748b', textAlign: 'center' },
  controls: { flexDirection: 'row', gap: 12 },
  btn: { backgroundColor: '#e2e8f0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  btnText: { fontSize: 15, fontWeight: '600', fontFamily: fonts.semiBold, color: '#1e293b' },
  tray: { alignSelf: 'stretch', gap: 10, marginTop: 4 },
  trayItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dragging: { zIndex: 10, opacity: 0.9 },
  trayLabel: { fontSize: 14, color: '#1e293b' },
  allPlacedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  allPlaced: { fontSize: 15, color: '#16a34a', textAlign: 'center' },
});
