"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notFound, useRouter } from "next/navigation";

import { AdminHeader } from "@/components/AdminHeader";
import { adminFetch } from "@/lib/admin-client";
import type { StatsOverview, UserStatsRow } from "@/lib/admin-stats.types";
import { ADMIN_TOKEN_STORAGE_KEY } from "@/lib/admin-token";
import styles from "./stats.module.css";

type State =
  | { status: "checking" }
  | { status: "denied" }
  | { status: "error"; message: string }
  | { status: "ready"; overview: StatsOverview; users: UserStatsRow[] };

export default function AdminStatsPage() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "checking" });
  const [query, setQuery] = useState("");
  const [who, setWho] = useState<"real" | "bots" | "all">("real");

  const load = useCallback(async () => {
    const [overview, users] = await Promise.all([
      adminFetch<StatsOverview>("/api/admin/stats"),
      adminFetch<{ users: UserStatsRow[] }>("/api/admin/stats/users"),
    ]);

    if (overview.status === "denied" || users.status === "denied") {
      setState({ status: "denied" });
      return;
    }
    if (overview.status === "error") {
      setState({ status: "error", message: overview.message });
      return;
    }
    if (users.status === "error") {
      setState({ status: "error", message: users.message });
      return;
    }
    setState({
      status: "ready",
      overview: overview.data,
      users: users.data.users,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (state.status !== "ready") return [];
    const needle = query.trim().toLowerCase();
    return state.users.filter((user) => {
      if (who === "real" && user.isBot) return false;
      if (who === "bots" && !user.isBot) return false;
      if (!needle) return true;
      return [user.username, user.email, user.id].some((field) =>
        field?.toLowerCase().includes(needle),
      );
    });
  }, [state, query, who]);

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
        <h1 className={styles.title}>Platform stats</h1>

        {state.status === "error" ? (
          <div className={styles.errorBox}>{state.message}</div>
        ) : (
          <>
            <Overview overview={state.overview} />

            <h2 className={styles.sectionTitle}>Users</h2>
            <div className={styles.toolbar}>
              <input
                className={styles.search}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by username, email or id"
                aria-label="Filter users"
              />
              <div className={styles.segmented} role="group" aria-label="Show">
                {(
                  [
                    ["real", "Players"],
                    ["bots", "Bots"],
                    ["all", "All"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={
                      who === value ? styles.segmentOn : styles.segment
                    }
                    onClick={() => setWho(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className={styles.empty}>No users match that.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Platform</th>
                      <th className={styles.numeric}>Games</th>
                      <th className={styles.numeric}>Staked</th>
                      <th className={styles.numeric}>Free</th>
                      <th>Joined</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((user) => (
                      <tr
                        key={user.id}
                        className={styles.rowLink}
                        onClick={() => router.push(`/admin/stats/${user.id}`)}
                      >
                        <td className={styles.username}>
                          {user.username ?? <span className={styles.unknown}>-</span>}
                          {user.isBot && (
                            <span className={styles.pillAmber}>BOT</span>
                          )}
                        </td>
                        <td className={styles.email}>
                          {user.email ?? (
                            <span className={styles.unknown}>wallet only</span>
                          )}
                        </td>
                        <td>
                          {user.platformLabel ? (
                            <span className={styles.pill}>{user.platformLabel}</span>
                          ) : (
                            <span className={styles.unknown}>-</span>
                          )}
                        </td>
                        <td className={styles.numeric}>{user.games}</td>
                        <td className={styles.numeric}>{user.staked}</td>
                        <td className={styles.numeric}>{user.free}</td>
                        <td className={styles.date}>
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td>
                          {user.isBot ? (
                            <span className={styles.pillMuted}>Bot</span>
                          ) : user.online ? (
                            <span className={styles.pillGreen}>
                              <span className={styles.onlineDot} />
                              Online
                            </span>
                          ) : (
                            <span className={styles.pillMuted}>Offline</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Overview({ overview }: { overview: StatsOverview }) {
  const { users, games } = overview;
  const stakedShare = games.played ? (games.staked / games.played) * 100 : 0;
  const mobile = users.byPlatform?.find((row) => row.label === "mobile")?.users;
  const web = users.byPlatform?.find((row) => row.label === "web")?.users;

  return (
    <>
      <div className={styles.cards}>
        <div className={styles.card}>
          <div className={styles.cardLabel}>Players</div>
          <div className={styles.cardValue}>{users.total}</div>
          <div className={styles.cardNote}>
            {users.byPlatform
              ? `${mobile ?? 0} mobile · ${web ?? 0} web`
              : "Signup platform not recorded yet"}
            {users.bots > 0 && ` · ${users.bots} bots not counted`}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Online now</div>
          <div className={`${styles.cardValue} ${styles.cardValueGreen}`}>
            {users.online}
          </div>
          <div className={styles.cardNote}>Real players on this API instance</div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Games played</div>
          <div className={styles.cardValue}>{games.played}</div>
          <div className={styles.cardNote}>
            {games.inProgress} running · {games.pending} waiting ·{" "}
            {games.voided} voided - not counted
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardLabel}>Staked games</div>
          <div className={`${styles.cardValue} ${styles.cardValueAmber}`}>
            {games.staked}
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
              {games.staked} staked
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendDot} />
              {games.free} free
            </span>
          </div>
        </div>
      </div>

      {games.byType.length > 0 && (
        <>
          <h2 className={styles.sectionTitle}>Games by type</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Game</th>
                  <th className={styles.numeric}>Total</th>
                  <th className={styles.numeric}>Staked</th>
                  <th className={styles.numeric}>Free</th>
                </tr>
              </thead>
              <tbody>
                {games.byType.map((row) => (
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
    </>
  );
}
