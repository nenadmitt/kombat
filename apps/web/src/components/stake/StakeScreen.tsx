"use client";

import Link from "next/link";
import { ArrowLeft, LockSimple } from "@phosphor-icons/react";
import { LogoLockup } from "@/components/Logo";
import { shortAddress } from "@/lib/chain";
import { useWallet } from "@/lib/useWallet";
import styles from "./StakeScreen.module.css";

export function StakeScreen() {
  const wallet = useWallet();

  const connectLabel = wallet.connecting
    ? "Connecting…"
    : wallet.hasWallet
      ? "Connect wallet"
      : "No wallet found";

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <LogoLockup size={30} />
        </Link>
        {wallet.account ? (
          <div className={styles.navChips}>
            <span className={styles.walletChip}>
              <span className={styles.walletDot} />
              <span className={styles.walletAddress}>
                {shortAddress(wallet.account)}
              </span>
            </span>
            <button
              type="button"
              className={styles.disconnectBtn}
              onClick={wallet.disconnect}
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.connectBtn}
            onClick={() => void wallet.connect()}
            disabled={wallet.connecting || !wallet.hasWallet}
          >
            {connectLabel}
          </button>
        )}
      </header>

      <div className={styles.soonWrap}>
        <Link href="/" className={styles.backLink}>
          <ArrowLeft size={13} weight="bold" />
          Back to Kombat
        </Link>

        <div className={styles.soonCard}>
          <span className={styles.soonBadge}>
            <LockSimple size={11} weight="fill" />
            COMING SOON
          </span>
          <h1 className={styles.title}>Staking from the web is on the way</h1>
          <p className={styles.lead}>
            Connect a wallet to get ready. Adding funds to your stake pot from
            this page ships shortly - until then, stake from inside the Kombat
            app.
          </p>

          {wallet.account ? (
            <div className={styles.soonWallet}>
              <span className={styles.panelKickerSm}>Connected wallet</span>
              <div className={styles.soonWalletRow}>
                <span className={styles.walletDot} />
                <span className={styles.soonWalletAddress}>
                  {wallet.account}
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void wallet.connect()}
              disabled={wallet.connecting || !wallet.hasWallet}
            >
              {connectLabel}
            </button>
          )}

          {wallet.error ? (
            <div className={styles.formError}>
              <span>{wallet.error}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
