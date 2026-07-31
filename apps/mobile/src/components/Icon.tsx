import {
  Alert01Icon,
  AnchorIcon,
  ArrowDown02Icon,
  ArrowLeft02Icon,
  ArrowLeftRightIcon,
  ArrowRight02Icon,
  ArrowUp02Icon,
  AtSignIcon,
  BanknoteIcon,
  BoatIcon,
  BombIcon,
  Cancel01Icon,
  ChampionIcon,
  ChartSplineIcon,
  ChartUpIcon,
  CheckmarkCircle01Icon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  Copy01Icon,
  CrosshairIcon,
  CrownIcon,
  Delete01Icon,
  DiceIcon,
  DollarCircleIcon,
  EyeIcon,
  EyeOffIcon,
  File01Icon,
  FireIcon,
  Flag01Icon,
  GameController01Icon,
  GemIcon,
  GiftIcon,
  GridIcon,
  HandIcon,
  HelpCircleIcon,
  HistoryIcon,
  Key01Icon,
  Layers01Icon,
  LockIcon,
  Logout01Icon,
  MinusSignIcon,
  MoreHorizontalIcon,
  Notification01Icon,
  PartyIcon,
  PlusSignIcon,
  QrCodeIcon,
  RefreshIcon,
  Rotate01Icon,
  RocketIcon,
  Search01Icon,
  SecurityCheckIcon,
  Settings01Icon,
  Share01Icon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Target01Icon,
  Tick02Icon,
  Timer01Icon,
  Triangle01Icon,
  UserGroupIcon,
  UserIcon,
  VersusIcon,
  Wallet01Icon,
  WifiOff01Icon,
  WindPowerIcon,
  ZapIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type HugeiconsProps } from '@hugeicons/react-native';

import { colors } from '../theme/colors';

const ICONS = {
  anchor: AnchorIcon,
  /** Elevation dial - Salvo's ANGLE card. */
  angle: Triangle01Icon,
  'arrow-down': ArrowDown02Icon,
  'arrow-left': ArrowLeft02Icon,
  'arrow-right': ArrowRight02Icon,
  'arrow-up': ArrowUp02Icon,
  'at-sign': AtSignIcon,
  banknote: BanknoteIcon,
  bell: Notification01Icon,
  bomb: BombIcon,
  check: Tick02Icon,
  'check-circle': CheckmarkCircle01Icon,
  'chevron-down': ChevronDownIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'chevron-up': ChevronUpIcon,
  close: Cancel01Icon,
  copy: Copy01Icon,
  crosshair: CrosshairIcon,
  dollar: DollarCircleIcon,
  crown: CrownIcon,
  dice: DiceIcon,
  eye: EyeIcon,
  'eye-off': EyeOffIcon,
  'file-text': File01Icon,
  flag: Flag01Icon,
  flame: FireIcon,
  games: GameController01Icon,
  gem: GemIcon,
  gift: GiftIcon,
  grid: GridIcon,
  hand: HandIcon,
  layers: Layers01Icon,
  help: HelpCircleIcon,
  history: HistoryIcon,
  key: Key01Icon,
  lock: LockIcon,
  'log-out': Logout01Icon,
  minus: MinusSignIcon,
  'more-horizontal': MoreHorizontalIcon,
  'move-horizontal': ArrowLeftRightIcon,
  party: PartyIcon,
  plus: PlusSignIcon,
  'qr-code': QrCodeIcon,
  refresh: RefreshIcon,
  rocket: RocketIcon,
  'rotate-cw': Rotate01Icon,
  search: Search01Icon,
  settings: Settings01Icon,
  sliders: SlidersHorizontalIcon,
  share: Share01Icon,
  shield: SecurityCheckIcon,
  ship: BoatIcon,
  sparkles: SparklesIcon,
  swords: VersusIcon,
  target: Target01Icon,
  timer: Timer01Icon,
  /** Shell arc - Salvo's glyph across lobby / history rows. */
  trajectory: ChartSplineIcon,
  trash: Delete01Icon,
  'trending-up': ChartUpIcon,
  trophy: ChampionIcon,
  user: UserIcon,
  users: UserGroupIcon,
  wallet: Wallet01Icon,
  warning: Alert01Icon,
  'wifi-off': WifiOff01Icon,
  wind: WindPowerIcon,
  zap: ZapIcon,
} as const;

export type IconName = keyof typeof ICONS;

type Props = Omit<HugeiconsProps, 'icon' | 'altIcon' | 'showAlt' | 'ref'> & {
  type: IconName;
};

/**
 * The app's single icon surface (Hugeicons, stroke-rounded). Screens name an
 * icon rather than importing one, so the underlying set can be swapped in this
 * file alone - which is how the app moved off lucide, and how it would move to
 * Hugeicons' duotone-rounded once that Pro set is licensed.
 *
 * Two defaults differ from the raw component on purpose: Hugeicons renders
 * black when no colour is given (invisible on this dark ground), and its 1.5
 * stroke reads lighter than the weight the screens were drawn against.
 */
export default function Icon({
  type,
  color = colors.textPrimary,
  strokeWidth = 2,
  ...props
}: Props) {
  return (
    <HugeiconsIcon
      icon={ICONS[type]}
      color={color}
      strokeWidth={strokeWidth}
      {...props}
    />
  );
}
