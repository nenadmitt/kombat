"use client";

import Link from "next/link";
import {
  ArrowLeft,
  CaretDown,
  DiamondsFour,
  LockSimple,
  Wallet,
} from "@phosphor-icons/react";
import { LogoMark } from "@/components/Logo";
import { shortAddress } from "@/lib/chain";
import { useWallet } from "@/lib/useWallet";
import styles from "./StakeScreen.module.css";

export function StakeScreen() {
  const wallet = useWallet();

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <Link href="/" className={styles.brand}>
          <LogoMark size={34} />
          <span className={styles.brandName}>KOMBAT</span>
        </Link>
        <div className={styles.navChips}>
          <button
            type="button"
            className={`${styles.networkChip} ${
              wallet.wrongNetwork ? styles.networkChipWarn : ""
            }`}
            onClick={() => void wallet.switchNetwork()}
          >
            <span className={styles.networkIcon}>
              <DiamondsFour size={11} weight="fill" />
            </span>
            <span className={styles.chipLabel}>
              {wallet.wrongNetwork ? "Wrong network" : "Ethereum Sepolia"}
            </span>
            <CaretDown size={11} weight="bold" className={styles.chipCaret} />
          </button>
          {wallet.account ? (
            <span className={styles.walletChip}>
              <span className={styles.walletDot} />
              <span className={styles.walletAddress}>
                {shortAddress(wallet.account)}
              </span>
            </span>
          ) : (
            <button
              type="button"
              className={styles.connectBtn}
              onClick={() => void wallet.connect()}
              disabled={wallet.connecting || !wallet.hasWallet}
            >
              <Wallet size={13} weight="fill" />
              {wallet.connecting
                ? "Connecting…"
                : wallet.hasWallet
                  ? "Connect wallet"
                  : "No wallet found"}
            </button>
          )}
        </div>
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
            Connect a wallet here to check you are on Ethereum Sepolia. Adding
            funds to your stake pot from this page ships shortly - until then,
            stake from inside the Kombat app.
          </p>

          {wallet.account ? (
            <div className={styles.soonWallet}>
              <span className={styles.panelKickerSm}>CONNECTED WALLET</span>
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
              <Wallet size={17} weight="bold" />
              {wallet.hasWallet ? "Connect wallet" : "No wallet found"}
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
