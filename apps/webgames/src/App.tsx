import { STAKE_POT_EVENTS, type StakePotBalances } from '@gaming-platform/core';
import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { DemoPage, MatchPage } from './pages/MatchPage';
import { WelcomeBonusModal } from './components/WelcomeBonusModal';
import { GamesPage } from './pages/GamesPage';
import { HistoryPage } from './pages/HistoryPage';
import { LobbyPage } from './pages/LobbyPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfilePage } from './pages/ProfilePage';
import { SignInPage } from './pages/SignInPage';
import { WalletPage } from './pages/WalletPage';
import { apiClient } from './lib/api';
import { sessionStorage } from './lib/session-storage';
import { usePotStore } from './store/pot.store';
import { useSessionStore } from './store/session.store';
import { useWebsocketStore } from './store/websocket.store';

export function App() {
  const restore = useSessionStore(s => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  return (
    <Routes>
      <Route path="/signin" element={<SignInPage />} />
      <Route
        path="/onboarding"
        element={
          <RequireSession skipOnboardingCheck>
            <OnboardingPage />
          </RequireSession>
        }
      />
      <Route
        element={
          <RequireSession>
            <LiveData />
            <WelcomeBonusGate />
            <AppShell />
          </RequireSession>
        }
      >
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/game/:gameType/:roomId" element={<MatchPage />} />
        <Route path="/demo/:gameType" element={<DemoPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/lobby" replace />} />
    </Routes>
  );
}

/** Pot balances arrive as full snapshots on the user's own socket room. */
function LiveData() {
  const refresh = usePotStore(s => s.refresh);
  const apply = usePotStore(s => s.apply);
  const on = useWebsocketStore(s => s.on);
  const status = useWebsocketStore(s => s.status);

  useEffect(() => {
    void refresh();
  }, [refresh, status]);

  useEffect(
    () =>
      on(STAKE_POT_EVENTS.balance, payload =>
        apply(payload as StakePotBalances),
      ),
    [on, apply, status],
  );

  return null;
}

/**
 * Offers the one-time welcome bonus on the first authenticated landing. The
 * outcome is remembered locally; the server's 409 is the real backstop, so a
 * cleared browser at worst re-offers something that immediately settles.
 */
function WelcomeBonusGate() {
  const userId = useSessionStore(s => s.user?.id);
  const [offer, setOffer] = useState<{ amount: string; symbol: string } | null>(
    null,
  );

  useEffect(() => {
    if (!userId || sessionStorage.readWelcomeBonus(userId)) return;
    let cancelled = false;
    apiClient
      .getWelcomeBonus()
      .then(bonus => {
        if (!cancelled && bonus.available) {
          setOffer({ amount: bonus.amount, symbol: bonus.symbol });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!offer || !userId) return null;

  return (
    <WelcomeBonusModal
      amount={offer.amount}
      symbol={offer.symbol}
      onClaimed={() => sessionStorage.writeWelcomeBonus(userId, 'claimed')}
      onDismissed={() => sessionStorage.writeWelcomeBonus(userId, 'dismissed')}
      onClose={() => setOffer(null)}
    />
  );
}

function RequireSession({
  children,
  skipOnboardingCheck = false,
}: {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
}) {
  const { user, hasSession, loading } = useSessionStore();
  const location = useLocation();

  if (loading) return <FullScreenSpinner />;
  if (!hasSession || !user) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  if (!user.username && !skipOnboardingCheck) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function FullScreenSpinner() {
  return (
    <div className="solo">
      <span className="spinner" />
    </div>
  );
}
