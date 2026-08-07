import { emptyPlayerStats, type PlayerStats } from '@gaming-platform/core';
import { SignOut } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useAccount, useDisconnect } from 'wagmi';

import {
  AchievementsCard,
  InviteCard,
  ProfileCard,
} from '../components/ProfileCards';
import { apiClient } from '../lib/api';
import { shortAddress } from '../lib/format';
import { useSessionStore } from '../store/session.store';

export function ProfilePage() {
  const user = useSessionStore(s => s.user);
  const signOut = useSessionStore(s => s.signOut);
  const { address } = useAccount();
  const { disconnect } = useDisconnect();
  const [stats, setStats] = useState<PlayerStats>(emptyPlayerStats);

  useEffect(() => {
    apiClient.getMyStats().then(setStats).catch(() => undefined);
  }, []);

  if (!user) return null;

  return (
    <div className="page">
      <h1 className="page-title">Profile</h1>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--s-4)',
          maxWidth: 480,
        }}
      >
        <ProfileCard user={user} stats={stats} />
        <AchievementsCard stats={stats} />
        <InviteCard user={user} stats={stats} />

        <div className="card">
          <span className="card-label">SIGNED IN AS</span>
          <div
            className="mono"
            style={{ marginTop: 'var(--s-3)', fontSize: 13 }}
          >
            {address ? shortAddress(address) : 'Wallet disconnected'}
          </div>
          <button
            type="button"
            className="btn btn-surface btn-block"
            style={{ marginTop: 'var(--s-4)' }}
            onClick={() => {
              disconnect();
              void signOut();
            }}
          >
            <SignOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
