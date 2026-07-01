import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEmbeddedEthereumWallet, usePrivy } from '@privy-io/expo';

import type { RootStackParamList } from '../navigation/types';
import { useCurrentUserStore } from '../store/currentUser.store';
import { GradientView } from '../components/GradientView';
import { brandGradient, colors, radius, spacing } from '../theme/colors';

type Props = NativeStackScreenProps<RootStackParamList, 'Wallet'>;

/**
 * Authenticated landing page: shows the user's embedded Ethereum wallet.
 * If the account has no embedded wallet yet (fresh signup, or an older
 * account created before wallets were enabled), one is created on mount.
 */
export default function WalletScreen({ navigation }: Props) {
  const { user, logout } = usePrivy();
  const { wallets, create } = useEmbeddedEthereumWallet();
  const name = useCurrentUserStore(state => state.name);

  const [creationError, setCreationError] = useState<string | null>(null);
  const creationStarted = useRef(false);

  const wallet = wallets[0] ?? null;

  // Does the user already have an embedded Ethereum wallet on their account?
  const hasEthereumWallet =
    user?.linked_accounts.some(
      account =>
        account.type === 'wallet' && account.chain_type === 'ethereum',
    ) ?? false;

  // Create the wallet when missing — exactly once.
  useEffect(() => {
    if (!user || wallet || hasEthereumWallet || creationStarted.current) {
      return;
    }
    creationStarted.current = true;
    create().catch((err: unknown) => {
      creationStarted.current = false; // allow retry
      setCreationError(
        err instanceof Error ? err.message : 'Failed to create wallet',
      );
    });
  }, [user, wallet, hasEthereumWallet, create]);

  const retryCreate = () => {
    setCreationError(null);
    creationStarted.current = true;
    create().catch((err: unknown) => {
      creationStarted.current = false;
      setCreationError(
        err instanceof Error ? err.message : 'Failed to create wallet',
      );
    });
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <GradientView
            colors={brandGradient.colors}
            positions={brandGradient.positions}
            style={styles.logoIcon}
          >
            <Text style={styles.logoGem}>💎</Text>
          </GradientView>
          <Text style={styles.title}>Your Wallet</Text>
          {name ? <Text style={styles.subtitle}>{name}</Text> : null}
        </View>

        {/* Wallet card */}
        <View style={styles.card}>
          {wallet ? (
            <>
              <Text style={styles.cardLabel}>Embedded Ethereum wallet</Text>
              <Text style={styles.address}>{wallet.address}</Text>
              <Text style={styles.cardHint}>
                Managed by Privy — no seed phrase needed.
              </Text>
            </>
          ) : creationError ? (
            <>
              <Text style={styles.cardLabel}>Wallet setup failed</Text>
              <Text style={styles.error}>{creationError}</Text>
              <Pressable onPress={retryCreate}>
                <Text style={styles.linkText}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.brandStart} />
              <Text style={styles.cardHint}>Setting up your wallet…</Text>
            </>
          )}
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable
            onPress={() => navigation.navigate('Home')}
            style={({ pressed }) => [
              styles.buttonWrapper,
              pressed && styles.buttonDimmed,
            ]}
          >
            <GradientView
              colors={brandGradient.colors}
              positions={brandGradient.positions}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Enter the Arena</Text>
            </GradientView>
          </Pressable>

          <Pressable onPress={() => logout()}>
            <Text style={styles.linkText}>Log out</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.logo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoGem: {
    fontSize: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
  },
  card: {
    width: '100%',
    borderRadius: radius.hero,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(139, 92, 246, 0.25)',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  address: {
    fontSize: 15,
    fontFamily: 'Menlo',
    textAlign: 'center',
    color: colors.textPrimary,
  },
  cardHint: {
    fontSize: 13,
    textAlign: 'center',
    color: colors.textMuted,
  },
  error: {
    fontSize: 13,
    textAlign: 'center',
    color: '#f87171',
  },
  actions: {
    width: '100%',
    alignItems: 'center',
    gap: spacing.sm,
  },
  buttonWrapper: {
    width: '100%',
    borderRadius: radius.button,
  },
  buttonDimmed: {
    opacity: 0.85,
  },
  button: {
    height: 56,
    width: '100%',
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  linkText: {
    fontSize: 15,
    color: colors.brandStart,
    paddingVertical: spacing.xs,
  },
});
