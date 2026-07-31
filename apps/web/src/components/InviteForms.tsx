"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  CheckCircle,
  EnvelopeSimple,
  LockSimple,
  User,
  WarningCircle,
} from "@phosphor-icons/react";

import { onInviteRequested, requestInvite } from "@/lib/invite-bus";
import styles from "./InviteForms.module.css";

export function HeroInviteForm() {
  const [email, setEmail] = useState("");

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    requestInvite(email);
    document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <form className={styles.heroForm} onSubmit={handleSubmit}>
      <div className={styles.heroFormRow}>
        <label className={styles.field}>
          <EnvelopeSimple size={17} className={styles.fieldIcon} />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@email.com"
            aria-label="Email address"
            className={styles.input}
          />
        </label>
        <button type="submit" className={styles.heroSubmit}>
          Request an invite
        </button>
      </div>
      <div className={styles.heroNote}>
        <LockSimple size={13} />
        Test mode on Ethereum Sepolia — no real funds at risk.
      </div>
    </form>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "done"; alreadyRegistered: boolean };

export function ApplyForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(
    () =>
      onInviteRequested((incoming) => {
        if (incoming) setEmail(incoming);
        usernameRef.current?.focus({ preventScroll: true });
      }),
    [],
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (status.kind === "submitting") return;
    setStatus({ kind: "submitting" });

    try {
      const response = await fetch("/api/tester-signups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, email }),
      });
      const body = (await response.json()) as {
        error?: string;
        alreadyRegistered?: boolean;
      };

      if (!response.ok) {
        setStatus({
          kind: "error",
          message: body.error ?? "Something went wrong. Try again.",
        });
        return;
      }
      setStatus({
        kind: "done",
        alreadyRegistered: Boolean(body.alreadyRegistered),
      });
    } catch {
      setStatus({
        kind: "error",
        message: "Could not reach the server. Try again.",
      });
    }
  };

  if (status.kind === "done") {
    return (
      <div className={styles.card}>
        <div className={styles.successIcon}>
          <CheckCircle size={26} weight="fill" />
        </div>
        <div className={styles.successTitle}>
          {status.alreadyRegistered ? "You're already on the list" : "You're on the list"}
        </div>
        <p className={styles.successBody}>
          {status.alreadyRegistered
            ? "That email already has a pending request. We'll email you once your invite is ready."
            : "We'll email you once your invite is ready. Nothing else to do."}
        </p>
      </div>
    );
  }

  const submitting = status.kind === "submitting";

  return (
    <form className={styles.card} onSubmit={handleSubmit}>
      <div className={styles.kicker}>APPLY FOR ACCESS</div>

      <label className={styles.cardField}>
        <User size={17} className={styles.fieldIcon} />
        <input
          ref={usernameRef}
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="Pick a username"
          aria-label="Username"
          maxLength={32}
          required
          className={styles.input}
        />
      </label>

      <label className={styles.cardField}>
        <EnvelopeSimple size={17} className={styles.fieldIcon} />
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@email.com"
          aria-label="Email address"
          required
          className={styles.input}
        />
      </label>

      {status.kind === "error" && (
        <div className={styles.error}>
          <WarningCircle size={15} weight="fill" />
          {status.message}
        </div>
      )}

      <button type="submit" className={styles.submit} disabled={submitting}>
        {submitting ? "Sending…" : "Request an invite"}
      </button>
      <div className={styles.note}>
        We email once, when your invite is ready. No newsletter.
      </div>
    </form>
  );
}
