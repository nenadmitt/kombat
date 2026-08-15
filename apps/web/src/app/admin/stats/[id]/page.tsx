"use client";

import { use, useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";

import { AdminHeader } from "@/components/AdminHeader";
import { adminFetch } from "@/lib/admin-client";
import type { UserStats } from "@/lib/admin-stats.types";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin-token";
import styles from "../stats.module.css";

type State =
  | { status: "checking" }
  | { status: "denied" }
  | { status: "error"; message: string }
  | { status: "ready"; user: UserStats };

export default function AdminUserStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [state, setState] = useState<State>({ status: "checking" });

  const load = useCallback(async () => {
    const result = await adminFetch<UserStats>(`/api/admin/stats/users/${id}`);
    if (result.status === "denied") {
      setState({ status: "denied" });
      return;
    }
    if (result.status === "error") {
      setState({ status: "error", message: result.message });
      return;
    }
    setState({ status: "ready", user: result.data });
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (state.status === "denied") {
    notFound();
  }

  if (state.status === "checking") {
    return <div className={styles.blank} />;
  }

  const signOut = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setState({ status: "denied" });
  };

  return (
    <div className={styles.page}>
      <AdminHeader active="stats" onRefresh={() => void load()} onSignOut={signOut} />

      <main className={styles.main}>
        <Link href="/admin/stats" className={styles.backLink}>
          <ArrowLeft size={14} weight="bold" />
          All users
        </Link>

        {state.status === "error" ? (
          <div className={styles.errorBox}>{state.message}</div>
        ) : (
          <UserDetail user={state.user} />
        )}
      </main>
    </div>
  );
}

function UserDetail({ user }: { user: UserStats }) {
  const { totals } = user;
  const stakedShare = totals.played ? (totals.staked / totals.played) * 100 : 0;

  return (
    <>
      <h1 className={styles.title}>{user.username ?? "Unnamed player"}</h1>
      <div className={styles.detailHead}>
        {user.isBot ? (
          <span className={styles.pillAmber}>BOT</span>
        ) : user.online ? (
          <span className={styles.pillGreen}>
            <span className={styles.onlineDot} />
            Online
          </span>
        ) : (
          <span className={styles.pillMuted}>Offline</span>
        )}
        {user.platformLabel ? (
          <span className={styles.pill}>Signed up on {user.platformLabel}</span>
        ) : (
          <span className={styles.pillMuted}>Signup platform not recorded</span>
        )}
        <span className={styles.email}>{user.email ?? "wallet only"}</span>
      </div>

      <div className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Games played</div>
          <div className={styles.cardValue}>{totals.played}</div>
          <div className={styles.cardNote}>
            {totals.voided} voided and {totals.pending + totals.inProgress}{" "}
            unfinished not counted
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Staked games</div>
          <div className={`${styles.cardValue} ${styles.cardValueAmber}`}>
            {totals.staked}
          </div>
          <div className={styles.splitBar}>
            <div
              className={styles.splitFillAlt}
              style={{ width: `${stakedShare}%` }}
            />
            <div
              className={styles.splitFill}
              style={{ width: `${100 - stakedShare}%` }}
            />
          </div>
          <div className={styles.splitLegend}>
            <span className={styles.legendItem}>
              <span className={`${styles.legendDot} ${styles.legendDotAlt}`} />
              {totals.staked} staked
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} />
              {totals.free} free
            </span>
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Wins</div>
          <div className={`${styles.cardValue} ${styles.cardValueGreen}`}>
            {totals.wins}
          </div>
          <div className={styles.cardNote}>
            {totals.losses} lost · of {totals.played} played
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Live now</div>
          <div className={styles.cardValue}>{totals.inProgress}</div>
          <div className={styles.cardNote}>{totals.pending} waiting to start</div>
        </div>
      </div>

      {user.byType.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>By game</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Game</th>
                  <th className={styles.numeric}>Played</th>
                  <th className={styles.numeric}>Staked</th>
                  <th className={styles.numeric}>Free</th>
                </tr>
              </thead>
              <tbody>
                {user.byType.map((row) => (
                  <tr key={row.gameType}>
                    <td className={styles.username}>{row.gameTypeLabel}</td>
                    <td className={styles.numeric}>{row.total}</td>
                    <td className={styles.numeric}>{row.staked}</td>
                    <td className={styles.numeric}>{row.total - row.staked}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2 className={styles.sectionTitle}>Account</h2>
      <div className={styles.metaGrid}>
        <MetaRow label="User id" value={<span className={styles.mono}>{user.id}</span>} />
        <MetaRow
          label="Joined"
          value={new Date(user.createdAt).toLocaleString()}
        />
        <MetaRow label="ENS name" value={user.ensName} />
        <MetaRow label="Referral code" value={user.referralCode} />
        <MetaRow
          label="Referred by"
          value={
            user.referredByUserId ? (
              <Link href={`/admin/stats/${user.referredByUserId}`}>
                {user.referredByUserId}
              </Link>
            ) : null
          }
        />
      </div>
    </>
  );
}

function MetaRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className={styles.metaRow}>
      <span className={styles.metaKey}>{label}</span>
      <span className={styles.metaValue}>
        {value ?? <span className={styles.unknown}>-</span>}
      </span>
    </div>
  );
}
