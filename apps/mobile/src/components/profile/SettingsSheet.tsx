import Clipboard from '@react-native-clipboard/clipboard';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { STAKE_ASSET_SYMBOLS, StakeAsset } from '@gaming-platform/core';

import { APP_BUILD_NUMBER, APP_VERSION } from '../../config/app-version';
import { useCurrentUserStore } from '../../store/currentUser.store';
import { colors, radius, spacing } from '../../theme/colors';
import { mono, type } from '../../theme/typography';
import { CHAINS } from '../../wallet/chains';
import { getWalletSecret } from '../../wallet/wallet-keychain';
import Icon, { type IconName } from '../Icon';
import { BottomSheet, Button, MODAL_DISMISS_MS, Toggle, useConfirm } from '../ui';

type Props = {
  visible: boolean;
  onClose: () => void;
  username: string | null;
  onLogout: () => void;
};

type PreferenceKey = 'notifications' | 'sound' | 'hideBalances';

type InfoRow = { key: string; icon: IconName; label: string; value?: string };

const ACTIVE_CHAIN = CHAINS.find(chain => chain.enabled) ?? CHAINS[0];

const WALLET_ROWS: readonly InfoRow[] = [
  { key: 'network', icon: 'globe', label: 'Network', value: ACTIVE_CHAIN.name },
  {
    key: 'stake-token',
    icon: 'coins',
    label: 'Default stake token',
    value: STAKE_ASSET_SYMBOLS[StakeAsset.Usdc],
  },
];

const SUPPORT_ROWS: readonly InfoRow[] = [
  { key: 'discord', icon: 'discord', label: 'Discord', value: 'Coming soon' },
  { key: 'terms', icon: 'file-text', label: 'Terms & privacy', value: 'Coming soon' },
  {
    key: 'version',
    icon: 'rotate-cw',
    label: 'App version',
    value: `${APP_VERSION} (${APP_BUILD_NUMBER})`,
  },
];

const PREFERENCE_ROWS: readonly { key: PreferenceKey; icon: IconName; label: string }[] = [
  { key: 'notifications', icon: 'bell', label: 'Match notifications' },
  { key: 'sound', icon: 'volume', label: 'Sound effects' },
  { key: 'hideBalances', icon: 'eye-off', label: 'Hide balances' },
];

export default function SettingsSheet({ visible, onClose, username, onLogout }: Props) {
  const confirm = useConfirm();
  const userId = useCurrentUserStore(state => state.userId);
  const [preferences, setPreferences] = useState<Record<PreferenceKey, boolean>>({
    notifications: true,
    sound: true,
    hideBalances: false,
  });

  const [keyPanelOpen, setKeyPanelOpen] = useState(false);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [keyCopied, setKeyCopied] = useState(false);

  // The sheet stays mounted while hidden, so never leave the key in state once it is off screen.
  useEffect(() => {
    if (!visible) {
      setKeyPanelOpen(false);
      setPrivateKey(null);
      setKeyError(null);
      setKeyCopied(false);
    }
  }, [visible]);

  const handleReveal = async () => {
    if (!userId) return;
    try {
      const secret = await getWalletSecret(userId);
      if (!secret) {
        setKeyError('No wallet key on this device.');
        return;
      }
      setPrivateKey(secret.privateKey);
    } catch {
      setKeyError('Could not read the key from secure storage.');
    }
  };

  const handleCopyKey = () => {
    if (!privateKey) return;
    Clipboard.setString(privateKey);
    setKeyCopied(true);
  };

  const accountRows: readonly InfoRow[] = [
    { key: 'username', icon: 'user', label: 'Username', value: username ?? 'Player' },
    { key: 'avatar', icon: 'image', label: 'Avatar', value: 'Initial' },
    { key: 'recovery', icon: 'key', label: 'Recovery phrase', value: 'On this device' },
  ];

  // The confirm sheet is a second native Modal, so this one has to be off screen before it opens.
  const handleLogoutPress = () => {
    onClose();
    setTimeout(() => {
      void (async () => {
        const ok = await confirm({
          title: 'Sign out?',
          message:
            'Your wallet key stays on this device, so you can sign back in with the same account.',
          confirmLabel: 'Sign out',
          icon: 'log-out',
          destructive: true,
        });
        if (ok) {
          onLogout();
        }
      })();
    }, MODAL_DISMISS_MS);
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Settings" showClose>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <SettingsGroup label="Account">
          {accountRows.map(row => (
            <Row key={row.key} row={row} />
          ))}
        </SettingsGroup>

        <SettingsGroup label="Wallet">
          {WALLET_ROWS.map(row => (
            <Row key={row.key} row={row} />
          ))}
          <Pressable
            style={styles.row}
            onPress={() => setKeyPanelOpen(open => !open)}
            accessibilityRole="button"
            accessibilityLabel="Show private key"
          >
            <Icon type="key" color={colors.textSecondary} size={20} />
            <Text style={styles.rowLabel}>Private key</Text>
            <Icon
              type={keyPanelOpen ? 'eye-off' : 'eye'}
              color={colors.textMuted}
              size={18}
            />
          </Pressable>
          {keyPanelOpen ? (
            <View style={styles.keyPanel}>
              {privateKey ? (
                <>
                  <Text style={styles.keyValue} selectable>
                    {privateKey}
                  </Text>
                  <Pressable
                    style={styles.keyCopy}
                    onPress={handleCopyKey}
                    accessibilityRole="button"
                    accessibilityLabel="Copy private key"
                  >
                    <Icon
                      type={keyCopied ? 'check' : 'copy'}
                      color={keyCopied ? colors.accent : colors.textMuted}
                      size={16}
                    />
                    <Text style={styles.keyCopyLabel}>
                      {keyCopied ? 'Copied' : 'Copy'}
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.keyWarning}>
                    <Icon type="warning" color={colors.gold} size={16} />
                    <Text style={styles.keyWarningText}>
                      Anyone with this key can take everything in your wallet.
                      Never share it, and only reveal it somewhere private.
                    </Text>
                  </View>
                  {keyError ? (
                    <Text style={styles.keyError}>{keyError}</Text>
                  ) : (
                    <Button
                      label="Reveal key"
                      icon="eye"
                      variant="secondary"
                      onPress={() => void handleReveal()}
                    />
                  )}
                </>
              )}
            </View>
          ) : null}
        </SettingsGroup>

        <SettingsGroup label="Preferences">
          {PREFERENCE_ROWS.map(row => (
            <View key={row.key} style={styles.row}>
              <Icon type={row.icon} color={colors.textSecondary} size={20} />
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Toggle
                value={preferences[row.key]}
                onValueChange={next =>
                  setPreferences(prev => ({ ...prev, [row.key]: next }))
                }
              />
            </View>
          ))}
        </SettingsGroup>

        <SettingsGroup label="Support">
          {SUPPORT_ROWS.map(row => (
            <Row key={row.key} row={row} />
          ))}
        </SettingsGroup>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="Log out" icon="log-out" variant="danger" onPress={handleLogoutPress} />
      </View>
    </BottomSheet>
  );
}

function SettingsGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={[type.label, styles.groupLabel]}>{label.toUpperCase()}</Text>
      <View style={styles.groupRows}>{children}</View>
    </View>
  );
}

function Row({ row }: { row: InfoRow }) {
  return (
    <View style={styles.row}>
      <Icon type={row.icon} color={colors.textSecondary} size={20} />
      <Text style={styles.rowLabel}>{row.label}</Text>
      {row.value ? <Text style={styles.rowValue}>{row.value}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 420,
  },
  group: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  groupLabel: {
    color: colors.textMuted,
  },
  groupRows: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  rowLabel: {
    ...type.body,
    flex: 1,
    color: colors.textPrimary,
  },
  rowValue: {
    fontFamily: mono.regular,
    fontSize: 12,
    color: colors.textMuted,
  },
  footer: {
    paddingTop: spacing.md,
  },
  keyPanel: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  keyWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  keyWarningText: {
    ...type.caption,
    flex: 1,
    color: colors.textSecondary,
  },
  keyValue: {
    fontFamily: mono.regular,
    fontSize: 13,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    padding: spacing.sm,
  },
  keyCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
  },
  keyCopyLabel: {
    ...type.caption,
    color: colors.textMuted,
  },
  keyError: {
    ...type.caption,
    color: colors.danger,
  },
});
