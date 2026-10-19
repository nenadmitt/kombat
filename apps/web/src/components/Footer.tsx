"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DiscordLogo, TelegramLogo, X } from "@phosphor-icons/react";

import { LogoLockup } from "@/components/Logo";
import { DISCORD_URL, TELEGRAM_URL } from "@/lib/links";
import styles from "./Footer.module.css";

type Placeholder = {
  label: string;
  body: string;
};

const PLACEHOLDERS: Placeholder[] = [
  {
    label: "Terms of Service",
    body: "We are writing these for the open test. Until they are published, the closed test runs on testnet coins with no cash value, and we can end it or reset balances at any time.",
  },
  {
    label: "Privacy Policy",
    body: "Being written for the open test. Today we store the email you sign up with and your wallet address, we do not sell either, and you can ask us to delete both.",
  },
  {
    label: "Responsible Play",
    body: "Going up before any match is playable for real money. The closed test uses testnet coins that cost nothing and are worth nothing, so nobody can lose money here.",
  },
];

export function Footer() {
  const [open, setOpen] = useState<Placeholder | null>(null);

  return (
    <footer className={styles.footer}>
      <div className={styles.brand}>
        <LogoLockup size={20} color="var(--text-55)" />
      </div>

      <nav className={styles.links} aria-label="Footer">
        {PLACEHOLDERS.map(item => (
          <button
            key={item.label}
            type="button"
            className={styles.link}
            onClick={() => setOpen(item)}
          >
            {item.label}
          </button>
        ))}
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          className={styles.link}
        >
          Support
        </a>
      </nav>

      <div className={styles.socials}>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noreferrer"
          className={styles.social}
        >
          <DiscordLogo size={18} weight="fill" />
          Discord
        </a>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noreferrer"
          className={styles.social}
        >
          <TelegramLogo size={18} weight="fill" />
          Telegram
        </a>
      </div>

      {open && <ComingSoon item={open} onClose={() => setOpen(null)} />}
    </footer>
  );
}

function ComingSoon({
  item,
  onClose,
}: {
  item: Placeholder;
  onClose: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = card.current?.querySelectorAll<HTMLElement>(
        "button, a[href]",
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      onKeyDown={onKeyDown}
      role="presentation"
    >
      <div
        ref={card}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coming-soon-title"
        onClick={event => event.stopPropagation()}
      >
        <button
          ref={closeBtn}
          type="button"
          className={styles.close}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={16} weight="bold" />
        </button>

        <p className={styles.status}>Not published yet</p>
        <h2 id="coming-soon-title" className={styles.title}>
          {item.label}
        </h2>
        <p className={styles.body}>{item.body}</p>

        <div className={styles.cardActions}>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.cardLink}
          >
            <DiscordLogo size={16} weight="fill" />
            Ask us on Discord
          </a>
        </div>
      </div>
    </div>
  );
}
