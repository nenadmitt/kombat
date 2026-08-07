import {
  ClockCounterClockwise,
  DiamondsFour,
  GameController,
  House,
  User,
  Wallet,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { NavLink, Outlet } from 'react-router-dom';

import { BrandLockup } from './BrandMark';
import { useAccount } from 'wagmi';

import { CHAIN_NAME } from '../lib/chain';
import { initialOf, shortAddress } from '../lib/format';
import { useSessionStore } from '../store/session.store';
import { PotCard } from './PotCard';

const NAV: { to: string; label: string; icon: Icon }[] = [
  { to: '/lobby', label: 'Lobby', icon: House },
  { to: '/games', label: 'Games', icon: GameController },
  { to: '/wallet', label: 'Wallet', icon: Wallet },
  { to: '/history', label: 'History', icon: ClockCounterClockwise },
  { to: '/profile', label: 'Profile', icon: User },
];

export function AppShell() {
  const user = useSessionStore(s => s.user);
  const { address } = useAccount();
  const handle = user?.ensName ?? user?.username ?? null;

  return (
    <div className="shell">
      <nav className="rail">
        <div className="rail-brand">
          <BrandLockup />
        </div>

        <div className="rail-nav">
          {NAV.map(({ to, label, icon: Glyph }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? 'rail-link is-active' : 'rail-link'
              }
            >
              <Glyph size={18} />
              {label}
            </NavLink>
          ))}
        </div>

        <div className="rail-foot">
          <PotCard />
        </div>
      </nav>

      <div className="main">
        <header className="topbar">
          {/* Only shown on mobile, where the rail's own brand is hidden. */}
          <div className="topbar-brand">
            <BrandLockup size={24} />
          </div>
          <div className="topbar-actions">
            <span className="chip">
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'var(--chain-tint)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <DiamondsFour size={10} weight="fill" color="var(--chain)" />
              </span>
              {CHAIN_NAME}
            </span>

            {handle ? (
              <span className="chip chip-lime topbar-handle">
                <span className="dot" />
                {handle}
              </span>
            ) : address ? (
              <span className="chip">
                <span className="dot" />
                {shortAddress(address)}
              </span>
            ) : null}

            <NavLink
              to="/profile"
              className="avatar"
              style={{ width: 38, height: 38, fontSize: 15 }}
            >
              {initialOf(user?.username ?? address)}
            </NavLink>
        </div>
        </header>

        <Outlet />
      </div>
    </div>
  );
}
