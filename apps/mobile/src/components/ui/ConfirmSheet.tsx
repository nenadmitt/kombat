import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Icon, { type IconName } from '../Icon';
import { colors, radius, spacing } from '../../theme/colors';
import { display, type } from '../../theme/typography';
import BottomSheet from './BottomSheet';
import Button from './Button';

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  icon?: IconName;
  mode?: 'confirm' | 'info';
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(null);
  const pendingValueRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve only once fully off screen: presenting another Modal while this one animates out wedges iOS touches.
  // onDismiss is the iOS signal; the timer is the Android fallback.
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
