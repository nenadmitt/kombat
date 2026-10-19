"use client";

import { useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import {
  ArrowCounterClockwise,
  CheckCircle,
  Trash,
} from "@phosphor-icons/react";

import { AdminHeader } from "@/components/AdminHeader";
import {
  ADMIN_TOKEN_STORAGE_KEY,
  readAdminTokenFromUrl,
} from "@/lib/admin-token";
import styles from "./page.module.css";

type Signup = {
  id: string;
  username: string | null;
  email: string;
  country: string | null;
  createdAt: string;
  invitedAt: string | null;
};

type State =
  | { status: "checking" }
  | { status: "denied" }
  | { status: "error"; message: string }
  | { status: "ready"; signups: Signup[] };

export default function AdminPage() {
  const [state, setState] = useState<State>({ status: "checking" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();

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
      setSelected((prev) => {
        const alive = new Set(body.signups.map((s) => s.id));
        return new Set([...prev].filter((id) => alive.has(id)));
      });
    } catch {
      setState({ status: "error", message: "Could not reach the server." });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    method: "DELETE" | "PATCH",
    ids: string[],
    invited?: boolean,
  ) => {
    const token = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    if (!token || ids.length === 0) return;
    setBusy(true);
    setActionError(undefined);
    try {
      const response = await fetch("/api/admin/tester-signups", {
        method,
        headers: {
          "x-admin-token": token,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          method === "PATCH" ? { ids, invited } : { ids },
        ),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        setActionError(body.error ?? "That did not work.");
        return;
      }
      await load();
    } catch {
      setActionError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (ids: string[]) => {
    const what =
      ids.length === 1
        ? "Delete this signup?"
        : `Delete ${ids.length} signups?`;
    if (!window.confirm(`${what} This cannot be undone.`)) return;
    await act("DELETE", ids);
  };

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

  const signups = state.status === "ready" ? state.signups : [];
  const allSelected =
    signups.length > 0 && signups.every((s) => selected.has(s.id));
  const selectedIds = [...selected];
  const waitingSelected = signups.filter(
    (s) => selected.has(s.id) && !s.invitedAt,
  );
  const invitedSelected = signups.filter(
    (s) => selected.has(s.id) && s.invitedAt,
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(signups.map((s) => s.id)));

  return (
    <div className={styles.page}>
      <AdminHeader
        active="signups"
        onRefresh={() => void load()}
        onSignOut={signOut}
      />

      <main className={styles.main}>
        <h1 className={styles.title}>Tester signups</h1>

        {state.status === "error" ? (
          <div className={styles.errorBox}>{state.message}</div>
        ) : (
          <>
            <p className={styles.count}>
              {signups.length} {signups.length === 1 ? "request" : "requests"}
              {signups.some((s) => s.invitedAt) && (
                <>
                  {" · "}
                  {signups.filter((s) => s.invitedAt).length} invited
                </>
              )}
            </p>

            {actionError && <div className={styles.errorBox}>{actionError}</div>}

            {selected.size > 0 && (
              <div className={styles.bulkBar}>
                <span className={styles.bulkCount}>
                  {selected.size} selected
                </span>
                {waitingSelected.length > 0 && (
                  <button
                    type="button"
                    className={styles.bulkBtn}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        "PATCH",
                        waitingSelected.map((s) => s.id),
                        true,
                      )
                    }
                  >
                    <CheckCircle size={14} weight="fill" />
                    Mark {waitingSelected.length} invited
                  </button>
                )}
                {invitedSelected.length > 0 && (
                  <button
                    type="button"
                    className={styles.bulkBtn}
                    disabled={busy}
                    onClick={() =>
                      void act(
                        "PATCH",
                        invitedSelected.map((s) => s.id),
                        false,
                      )
                    }
                  >
                    <ArrowCounterClockwise size={14} weight="bold" />
                    Undo {invitedSelected.length}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.bulkDanger}
                  disabled={busy}
                  onClick={() => void remove(selectedIds)}
                >
                  <Trash size={14} weight="bold" />
                  Delete {selected.size}
                </button>
              </div>
            )}

            {signups.length === 0 ? (
              <div className={styles.empty}>No one has signed up yet.</div>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.checkCell}>
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          aria-label="Select every signup"
                        />
                      </th>
                      <th>Username</th>
                      <th>Email</th>
                      <th>Country</th>
                      <th>Signed up</th>
                      <th>Status</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {signups.map((signup) => (
                      <tr
                        key={signup.id}
                        className={
                          selected.has(signup.id) ? styles.rowSelected : undefined
                        }
                      >
                        <td className={styles.checkCell}>
                          <input
                            type="checkbox"
                            checked={selected.has(signup.id)}
                            onChange={() => toggle(signup.id)}
                            aria-label={`Select ${signup.email}`}
                          />
                        </td>
                        <td className={styles.username}>
                          {signup.username ?? (
                            <span className={styles.unknown}>-</span>
                          )}
                        </td>
                        <td className={styles.email}>{signup.email}</td>
                        <td>
                          {signup.country ?? (
                            <span className={styles.unknown}>Unknown</span>
                          )}
                        </td>
                        <td className={styles.date}>
                          {new Date(signup.createdAt).toLocaleString()}
                        </td>
                        <td>
                          {signup.invitedAt ? (
                            <span
                              className={styles.invitedTag}
                              title={new Date(
                                signup.invitedAt,
                              ).toLocaleString()}
                            >
                              <CheckCircle size={12} weight="fill" />
                              Invited
                            </span>
                          ) : (
                            <span className={styles.waitingTag}>Waiting</span>
                          )}
                        </td>
                        <td className={styles.rowActions}>
                          <button
                            type="button"
                            className={styles.rowBtn}
                            disabled={busy}
                            onClick={() =>
                              void act("PATCH", [signup.id], !signup.invitedAt)
                            }
                          >
                            {signup.invitedAt ? "Undo" : "Mark invited"}
                          </button>
                          <button
                            type="button"
                            className={styles.rowDanger}
                            disabled={busy}
                            aria-label={`Delete ${signup.email}`}
                            onClick={() => void remove([signup.id])}
                          >
                            <Trash size={14} weight="bold" />
                          </button>
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
