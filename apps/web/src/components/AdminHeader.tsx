"use client";

import Link from "next/link";
import { ArrowClockwise, SignOut } from "@phosphor-icons/react";

import { LogoLockup } from "@/components/Logo";
import styles from "./AdminHeader.module.css";

const TABS = [
  { key: "stats", href: "/admin/stats", label: "Stats" },
  { key: "signups", href: "/admin", label: "Signups" },
] as const;

export function AdminHeader({
  active,
  onRefresh,
  onSignOut,
}: {
  active: (typeof TABS)[number]["key"];
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  return (
    <>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <LogoLockup size={26} />
        </Link>
        <div className={styles.navActions}>
          <button type="button" className={styles.navBtn} onClick={onRefresh}>
            <ArrowClockwise size={14} weight="bold" />
            Refresh
          </button>
          <button type="button" className={styles.navBtn} onClick={onSignOut}>
            <SignOut size={14} weight="bold" />
            Sign out
          </button>
        </div>
      </header>
      <nav className={styles.tabs}>
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`${styles.tab} ${
              tab.key === active ? styles.tabActive : ""
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
