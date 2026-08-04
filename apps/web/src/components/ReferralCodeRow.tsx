"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

import styles from "@/app/page.module.css";

const EXAMPLE_CODE = "KMBT-7F2A9C";

export function ReferralCodeRow() {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(EXAMPLE_CODE);
      setCopied(true);
      if (resetTimer.current) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (permissions, insecure context) - no feedback.
    }
  };

  const share = async () => {
    const payload = {
      title: "Kombat",
      text: `Join me on Kombat with code ${EXAMPLE_CODE}`,
      url: window.location.origin,
    };
    if (navigator.share) {
      await navigator.share(payload).catch(() => undefined);
      return;
    }
    void copy();
  };

  return (
    <div className={styles.referralCodeRow}>
      <button
        type="button"
        className={styles.referralCode}
        onClick={copy}
        aria-label="Copy referral code"
      >
        <span>{EXAMPLE_CODE}</span>
        {copied ? (
          <Check size={19} className={styles.copyIcon} />
        ) : (
          <Copy size={19} className={styles.copyIcon} />
        )}
      </button>
      <button type="button" className={styles.shareBtn} onClick={share}>
        Share
      </button>
    </div>
  );
}
