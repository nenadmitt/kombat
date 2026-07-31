"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  CheckCircle,
  EnvelopeSimple,
  WarningCircle,
} from "@phosphor-icons/react";

import { onInviteRequested, requestInvite } from "@/lib/invite-bus";
import styles from "./InviteForms.module.css";

export function HeroInviteForm() {
  return (
    <div className={styles.heroForm}>
      <button
        type="button"
        className={styles.heroSubmit}
        onClick={() =>
          document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" })
        }
      >
        Request an invite
      </button>
    </div>
  );
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "done"; alreadyRegistered: boolean };

export function ApplyForm() {
  const [email, setEmail] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(
    () =>
      onInviteRequested((incoming) => {
        if (incoming) setEmail(incoming);
        emailRef.current?.focus({ preventScroll: true });
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
        body: JSON.stringify({ email }),
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
      <div className={styles.kicker}>Apply for access</div>

      <label className={styles.cardField}>
        <EnvelopeSimple size={17} className={styles.fieldIcon} />
        <input
          ref={emailRef}
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
