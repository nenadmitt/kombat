"use client";

import { useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowClockwise, SignOut } from "@phosphor-icons/react";

import { LogoMark } from "@/components/Logo";
import {
  ADMIN_TOKEN_STORAGE_KEY,
  readAdminTokenFromUrl,
} from "@/lib/admin-token";
import styles from "./page.module.css";

type Signup = {
  id: string;
  username: string;
  email: string;
  country: string | null;
  createdAt: string;
};

type State =
  | { status: "checking" }
  | { status: "denied" }
  | { status: "error"; message: string }
  | { status: "ready"; signups: Signup[] };

export default function AdminPage() {
  const [state, setState] = useState<State>({ status: "checking" });

  const load = useCallback(async () => {
    const token =
      readAdminTokenFromUrl() ??
      window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);

    if (!token) {
      setState({ status: "denied" });
      return;
    }

    try {
      const response = await fetch("/api/admin/tester-signups", {
        headers: { "x-admin-token": token },
        cache: "no-store",
      });

      if (response.status === 404) {
        window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
        setState({ status: "denied" });
        return;
      }
      if (!response.ok) {
        setState({ status: "error", message: "Could not load signups." });
        return;
      }

      window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
      const body = (await response.json()) as { signups: Signup[] };
      setState({ status: "ready", signups: body.signups });
    } catch {
      setState({ status: "error", message: "Could not reach the server." });
    }
  }, []);

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
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <LogoMark size={28} />
          <span className={styles.brandName}>KOMBAT</span>
        </Link>
        <div className={styles.navActions}>
          <button type="button" className={styles.navBtn} onClick={() => void load()}>
            <ArrowClockwise size={14} weight="bold" />
            Refresh
          </button>
          <button type="button" className={styles.navBtn} onClick={signOut}>
            <SignOut size={14} weight="bold" />
            Sign out
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.kicker}>ADMIN</div>
        <h1 className={styles.title}>Tester signups</h1>

        {state.status === "error" ? (
          <div className={styles.errorBox}>{state.message}</div>
        ) : (
          <>
            <p className={styles.count}>
              {state.signups.length}{" "}
              {state.signups.length === 1 ? "request" : "requests"}
            </p>

            {state.signups.length === 0 ? (
              <div className={styles.empty}>No one has signed up yet.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Country</th>
                      <th>Signed up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.signups.map((signup) => (
                      <tr key={signup.id}>
                        <td className={styles.username}>{signup.username}</td>
                        <td className={styles.email}>{signup.email}</td>
                        <td>
                          {signup.country ?? (
                            <span className={styles.unknown}>Unknown</span>
                          )}
                        </td>
                        <td className={styles.date}>
                          {new Date(signup.createdAt).toLocaleString()}
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
