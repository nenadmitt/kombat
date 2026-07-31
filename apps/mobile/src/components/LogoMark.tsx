import Svg, { Path } from 'react-native-svg';

import { colors } from '../theme/colors';

/** The Kombat ribbon mark - see branding/HANDOFF.md. Never redraw the path. */
const MARK =
  'M0 2 H13 V21 L34 0 H50 V14 H34 L20 28 L34 42 H50 V56 H34 L13 35 V54 H0 Z';

const RATIO = 50 / 56;

type Props = {
  /** Mark height; the width follows the 50:56 grid. */
  size?: number;
  color?: string;
};

export default function LogoMark({
  size = 96,
  color = colors.accent,
}: Props) {
  return (
    <Svg
      width={Math.round(size * RATIO)}
      height={size}
      viewBox="0 0 50 56"
      fill="none"
    >
      <Path d={MARK} fill={color} />
    </Svg>
  );
}
