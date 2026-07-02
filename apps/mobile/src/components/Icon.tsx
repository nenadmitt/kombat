import type { LucideProps } from 'lucide-react-native';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  AtSign,
  Banknote,
  Bell,
  ChevronRight,
  CircleQuestionMark,
  Copy,
  Crown,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Gamepad2,
  Gem,
  History,
  Key,
  Lock,
  LogOut,
  PartyPopper,
  Plus,
  Share2,
  Swords,
  TriangleAlert,
  Trophy,
  User,
  Wallet,
  WifiOff,
  Zap,
} from 'lucide-react-native';

const ICONS = {
  'arrow-down': ArrowDownToLine,
  'arrow-right': ArrowRight,
  'arrow-up': ArrowUpFromLine,
  'at-sign': AtSign,
  banknote: Banknote,
  bell: Bell,
  'chevron-right': ChevronRight,
  copy: Copy,
  crown: Crown,
  eye: Eye,
  'eye-off': EyeOff,
  'file-text': FileText,
  flame: Flame,
  games: Gamepad2,
  gem: Gem,
  help: CircleQuestionMark,
  history: History,
  key: Key,
  lock: Lock,
  'log-out': LogOut,
  party: PartyPopper,
  plus: Plus,
  share: Share2,
  swords: Swords,
  trophy: Trophy,
  user: User,
  wallet: Wallet,
  warning: TriangleAlert,
  'wifi-off': WifiOff,
  zap: Zap,
} as const;

export type IconName = keyof typeof ICONS;

type Props = Omit<LucideProps, 'ref'> & {
  type: IconName;
};

export default function Icon({ type, ...props }: Props) {
  const IconComponent = ICONS[type];
  return <IconComponent {...props} />;
}
