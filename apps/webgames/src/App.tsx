import {
  GameRoomStatus,
  STAKE_POT_EVENTS,
  type StakePotBalances,
} from '@gaming-platform/core';
import { useEffect, useRef, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { EmbeddedWalletGate } from './components/EmbeddedWalletGate';
import { DemoPage, MatchPage } from './pages/MatchPage';
import { ResumeMatchModal } from './components/ResumeMatchModal';
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
import { useActiveRoomStore } from './store/active-room.store';
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
            <EmbeddedWalletGate />
            <WelcomeBonusGate />
            <ResumeMatchGate />
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
 * A match left running follows the player around the app until they rejoin or
 * forfeit it, the same prompt the mobile app shows. Suppressed on that match's
 * own route, which is where Rejoin sends them.
 */
function ResumeMatchGate() {
  const room = useActiveRoomStore(s => s.room);
  const refresh = useActiveRoomStore(s => s.refresh);
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Leaving a board is the moment the answer changes: the match either ended
  // there or is still live and worth prompting about.
  const onBoard = location.pathname.startsWith('/game/');
  const wasOnBoard = useRef(onBoard);
  useEffect(() => {
    if (wasOnBoard.current && !onBoard) void refresh();
    wasOnBoard.current = onBoard;
  }, [onBoard, refresh]);

  if (!room || room.status !== GameRoomStatus.InProgress) return null;

  const matchPath = `/game/${room.gameType}/${room.id}`;
  if (location.pathname === matchPath || dismissedId === room.id) return null;

  return (
    <ResumeMatchModal
      room={room}
      onRejoin={() => navigate(matchPath)}
      onDismiss={() => setDismissedId(room.id)}
    />
  );
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
  const { user, hasSession, loading, hasWallet, walletPromptDismissed } =
    useSessionStore();
  const location = useLocation();

  if (loading) return <FullScreenSpinner />;
  if (!hasSession || !user) {
    return <Navigate to="/signin" replace state={{ from: location.pathname }} />;
  }
  if (!user.username && !skipOnboardingCheck) {
    return <Navigate to="/onboarding" replace />;
  }
  // An email account is meant to end up with its custodial wallet, so a
  // walletless one is routed back through onboarding on every entry. Backing
  // out is allowed (free games work either way); it returns next page load.
  // hasWallet null means unknown - never wall the app on a failed fetch.
  if (
    !skipOnboardingCheck &&
    user.email &&
    hasWallet === false &&
    !walletPromptDismissed
  ) {
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
