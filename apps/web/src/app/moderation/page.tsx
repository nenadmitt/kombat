"use client";

import { useCallback, useEffect, useState } from "react";
import { LockKey } from "@phosphor-icons/react";

import { AdminHeader } from "@/components/AdminHeader";
import {
  ADMIN_TOKEN_STORAGE_KEY,
  readAdminTokenFromUrl,
} from "@/lib/admin-token";
import styles from "./page.module.css";

type State =
  | { status: "checking" }
  | { status: "locked"; error?: string }
  | { status: "ready" };

async function verifyToken(token: string): Promise<boolean> {
  const response = await fetch("/api/moderation/auth", {
    headers: { "x-admin-token": token },
    cache: "no-store",
  });
  return response.ok;
}

export default function ModerationPage() {
  const [state, setState] = useState<State>({ status: "checking" });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const unlock = useCallback(async (token: string, storedError: string) => {
    try {
      if (await verifyToken(token)) {
        window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
        setState({ status: "ready" });
        return;
      }
      window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      setState({ status: "locked", error: storedError });
    } catch {
      setState({ status: "locked", error: "Could not reach the server." });
    }
  }, []);

  useEffect(() => {
    const token =
      readAdminTokenFromUrl() ??
      window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (!token) {
      setState({ status: "locked" });
      return;
    }
    void unlock(token, "Your saved token was rejected. Enter a new one.");
  }, [unlock]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const token = draft.trim();
    if (!token) return;
    setBusy(true);
    await unlock(token, "That token was rejected.");
    setBusy(false);
  };

  const signOut = () => {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setDraft("");
    setState({ status: "locked" });
  };

  if (state.status === "checking") {
    return <div className={styles.blank} />;
  }

  if (state.status === "locked") {
    return (
      <div className={styles.blank}>
        <div className={styles.scrim}>
          <form className={styles.dialog} onSubmit={submit}>
            <span className={styles.dialogIcon}>
              <LockKey size={22} weight="bold" />
            </span>
            <h1 className={styles.dialogTitle}>Moderation</h1>
            <p className={styles.dialogBlurb}>
              Enter the admin token to open the moderation surface. It is
              remembered on this browser.
            </p>
            <input
              className={styles.input}
              type="password"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Admin token"
              autoFocus
              spellCheck={false}
              autoComplete="off"
            />
            {state.error && <p className={styles.error}>{state.error}</p>}
            <button
              type="submit"
              className={styles.submit}
              disabled={busy || draft.trim().length === 0}
            >
              {busy ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <AdminHeader
        active="moderation"
        onRefresh={() => window.location.reload()}
        onSignOut={signOut}
      />
      <main className={styles.main}>
        <h1 className={styles.title}>Moderation</h1>
        <p className={styles.count}>Signed in on this browser.</p>
        <div className={styles.empty}>
          No moderation tools here yet. This surface is authenticated and
          ready for them.
        </div>
      </main>
    </div>
  );
}
