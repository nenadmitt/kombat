import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { display, type } from '../../theme/typography';
import BottomSheet from './BottomSheet';
import Button from './Button';

/** Everything a confirmation/notice sheet needs. All optional but `title`. */
export type ConfirmOptions = {
  title: string;
  message?: string;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". Ignored for `mode: 'info'`. */
  cancelLabel?: string;
  /** Red confirm button + red icon ring, for irreversible actions. */
  destructive?: boolean;
  /** Optional icon shown in the ring above the title. */
  icon?: IconName;
  /** `info` shows a single acknowledge button (no cancel). */
  mode?: 'confirm' | 'info';
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * App-wide confirmation sheet. Mount `<ConfirmProvider>` once near the root,
 * then call `const confirm = useConfirm()` and `await confirm({ ... })` from
 * anywhere - it resolves `true` on confirm, `false` on cancel/dismiss. This is
 * the bottom-sheet replacement for `Alert.alert` across the app.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const pendingValueRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve only once the sheet is fully off-screen. Callers often present
  // another Modal right after awaiting confirm(); presenting while this one
  // is still animating out wedges iOS's modal presentation stack (frozen,
  // touch-dead app). iOS signals real dismissal via onDismiss; the timer is the
  // Android/safety fallback. First one wins.
  const finishSettle = useCallback(() => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(pendingValueRef.current);
  }, []);

  const settle = useCallback(
    (value: boolean) => {
      if (!resolverRef.current) {
        return;
      }
      pendingValueRef.current = value;
      setOptions(null);
      fallbackTimerRef.current = setTimeout(finishSettle, 450);
    },
    [finishSettle],
  );

  const confirm = useCallback<ConfirmFn>(options => {
    setOptions(options);
    return new Promise<boolean>(resolve => {
      resolverRef.current = resolve;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  const isInfo = options?.mode === 'info';
  const destructive = options?.destructive ?? false;
  const ringColor = destructive ? colors.danger : colors.accent;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <BottomSheet
        visible={options !== null}
        onClose={() => settle(false)}
        onDismissed={finishSettle}
      >
        {options ? (
          <View style={styles.body}>
            {options.icon ? (
              <View
                style={[
                  styles.iconRing,
                  { borderColor: ringColor, backgroundColor: colors.accentSoft },
                ]}
              >
                <Icon type={options.icon} color={ringColor} size={30} />
              </View>
            ) : null}

            <Text style={styles.title}>{options.title}</Text>
            {options.message ? (
              <Text style={styles.message}>{options.message}</Text>
            ) : null}

            <View style={styles.actions}>
              <Button
                label={options.confirmLabel ?? (isInfo ? 'Got it' : 'Confirm')}
                variant={destructive ? 'danger' : 'primary'}
                onPress={() => settle(true)}
              />
              {!isInfo ? (
                <Button
                  label={options.cancelLabel ?? 'Cancel'}
                  variant="ghost"
                  onPress={() => settle(false)}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </ConfirmContext.Provider>
  );
}

/** Imperative confirm - `await confirm({ title, message, ... })`. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: display.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
});
