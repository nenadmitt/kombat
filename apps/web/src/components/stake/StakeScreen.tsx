"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowSquareOut,
  ArrowUUpLeft,
  ArrowUpRight,
  CaretDown,
  Copy,
  CurrencyCircleDollar,
  Diamond,
  DiamondsFour,
  FileCode,
  Info,
  LinkSimple,
  LockSimple,
  Percent,
  SealCheck,
  ShareNetwork,
  ShieldCheck,
  UsersThree,
  Wallet,
} from "@phosphor-icons/react";
import { LogoMark } from "@/components/Logo";
import { shortAddress } from "@/lib/chain";
import { useWallet } from "@/lib/useWallet";
import { StakeForm } from "./StakeForm";
import styles from "./StakeScreen.module.css";

export type StakeTab = "stake" | "withdraw" | "invite";

const WALLET = "0x36e8…A1c7";
const CONTRACT = "0x9C4e1aB7f0D2c8e5A6b31F94dE07c25B8aF6390D";

export function StakeScreen({ initialTab }: { initialTab: StakeTab }) {
  const [tab, setTab] = useState<StakeTab>(initialTab);
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

      <div className={styles.grid}>
        <div>
          <Link href="/" className={styles.backLink}>
            <ArrowLeft size={13} weight="bold" />
            Back to Kombat
          </Link>
          <h1 className={styles.title}>
            {tab === "invite"
              ? "Invite players, earn on every match"
              : tab === "withdraw"
                ? "Withdraw from your stake pot"
                : "Add funds to your stake pot"}
          </h1>
          <p className={styles.lead}>
            {tab === "invite"
              ? "Share your code. When someone you invited plays a staked match, 0.1% of the platform fee lands straight in your stake pot - for as long as they keep playing."
              : tab === "withdraw"
                ? "Move unlocked balance from your pot back to your wallet. Funds locked in an open match free up the moment it settles."
                : "Send tokens from your wallet to the Kombat match contract. They arrive as in-game credit within one block and stay withdrawable at any time."}
          </p>

          <div className={styles.tabs}>
            <button
              type="button"
              className={`${styles.tab} ${tab === "stake" ? styles.tabActive : ""}`}
              onClick={() => setTab("stake")}
            >
              <ShieldCheck size={15} weight={tab === "stake" ? "fill" : "regular"} />
              Stake
            </button>
            <button
              type="button"
              className={`${styles.tab} ${tab === "withdraw" ? styles.tabActive : ""}`}
              onClick={() => setTab("withdraw")}
            >
              <ArrowUUpLeft size={15} />
              Withdraw
            </button>
            <button
              type="button"
              className={`${styles.tab} ${tab === "invite" ? styles.tabActive : ""}`}
              onClick={() => setTab("invite")}
            >
              <UsersThree size={15} weight={tab === "invite" ? "fill" : "regular"} />
              Invite &amp; earn
            </button>
          </div>

          {tab === "invite" ? (
            <InvitePanel />
          ) : tab === "stake" ? (
            <StakeForm wallet={wallet} />
          ) : (
            <WithdrawPanel />
          )}
        </div>

        <aside className={styles.side}>
          <div className={styles.potCard}>
            <div className={styles.potCardGlow} />
            <div className={styles.potCardHead}>
              <ShieldCheck size={14} weight="fill" />
              <span>YOUR STAKE POT</span>
            </div>
            <div className={styles.potTotal}>
              {tab === "invite" ? (
                <>
                  <span className={styles.potTotalMajor}>$609</span>
                  <span className={styles.potTotalMinor}>.20</span>
                </>
              ) : (
                <>
                  <span className={styles.potTotalMajor}>$561</span>
                  <span className={styles.potTotalMinor}>.00</span>
                </>
              )}
            </div>
            {tab === "invite" && (
              <div className={styles.potReferralNote}>
                <ArrowUpRight size={12} weight="fill" />
                $48.20 of it earned from referrals
              </div>
            )}
            <div className={styles.potRows}>
              <div className={`${styles.potRow} ${styles.potRowRule}`}>
                <span className={`${styles.tokenIcon} ${styles.tokenKombat}`}>
                  <Diamond size={14} weight="fill" />
                </span>
                <span className={styles.potRowName}>KOMBAT</span>
                <span className={styles.potRowValue}>990</span>
              </div>
              <div className={styles.potRow}>
                <span className={`${styles.tokenIcon} ${styles.tokenUsdc}`}>
                  <CurrencyCircleDollar size={15} weight="fill" />
                </span>
                <span className={styles.potRowName}>USDC</span>
                <span className={styles.potRowValue}>
                  {tab === "invite" ? "460.70" : "412.50"}
                </span>
              </div>
            </div>
          </div>

          {tab === "invite" && (
            <div className={styles.earningsCard}>
              <div className={styles.earningsHead}>
                <span className={styles.panelKicker}>REFERRAL EARNINGS</span>
                <a href="#" className={styles.earningsRange}>All time</a>
              </div>
              <div className={styles.earningsRows}>
                {[
                  { initial: "M", name: "mira_v", meta: "92 matches · joined 12.7", amount: "+$14.80" },
                  { initial: "D", name: "dex_04", meta: "71 matches · joined 15.7", amount: "+$11.35" },
                  { initial: "K", name: "kato", meta: "58 matches · joined 19.7", amount: "+$8.90" },
                ].map((row) => (
                  <div key={row.name} className={styles.earningsRow}>
                    <span className={styles.earningsAvatar}>{row.initial}</span>
                    <div className={styles.earningsWho}>
                      <div className={styles.earningsName}>{row.name}</div>
                      <div className={styles.earningsMeta}>{row.meta}</div>
                    </div>
                    <span className={styles.earningsAmount}>{row.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.testModeCard}>
            <div className={styles.testModeHead}>
              <LockSimple size={14} weight="fill" />
              <span>TEST MODE</span>
            </div>
            <p className={styles.testModeBody}>
              {tab === "invite"
                ? "Referral payouts run on Sepolia during the closed test. Codes and totals carry over at launch."
                : "Staking runs on Ethereum Sepolia during the closed test - nothing you send is real money."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function WithdrawPanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelKicker}>FROM YOUR STAKE POT</div>
        <div className={styles.walletTag}>
          <Wallet size={13} weight="fill" className={styles.greenIcon} />
          <span className={styles.walletTagAddress}>{WALLET}</span>
          <Copy size={13} className={styles.mutedIcon} />
        </div>
      </div>

      <div className={styles.amountBox}>
        <div className={styles.amountBoxHead}>
          <span className={styles.amountLabel}>AMOUNT TO WITHDRAW</span>
          <span className={styles.balanceNote}>
            Unlocked balance{" "}
            <span className={styles.balanceValue}>412.50 USDC</span>
          </span>
        </div>
        <div className={styles.amountRow}>
          <div className={styles.amountValueWrap}>
            <span className={styles.amountValue}>250.00</span>
            <span className={styles.caret} />
          </div>
          <div className={styles.tokenSelect}>
            <span className={`${styles.tokenIcon} ${styles.tokenUsdc}`}>
              <CurrencyCircleDollar size={14} weight="fill" />
            </span>
            <span className={styles.tokenSelectName}>USDC</span>
            <CaretDown size={12} weight="bold" className={styles.chipCaret} />
          </div>
        </div>
        <div className={styles.usdNote}>≈ $250.00 USD</div>
        <div className={styles.percentRow}>
          <button type="button" className={styles.percentBtn}>25%</button>
          <button type="button" className={`${styles.percentBtn} ${styles.percentBtnActive}`}>
            50%
          </button>
          <button type="button" className={styles.percentBtn}>75%</button>
          <button type="button" className={styles.percentBtn}>MAX</button>
        </div>
      </div>

      <div className={styles.flowDivider}>
        <span className={styles.flowLine} />
        <span className={styles.flowArrow}>
          <ArrowDown size={16} weight="bold" />
        </span>
        <span className={`${styles.flowLine} ${styles.flowLineEnd}`} />
      </div>

      <div className={styles.destBox}>
        <div className={styles.panelKickerSm}>TO · YOUR WALLET</div>
        <div className={styles.destRow}>
          <span className={styles.destIcon}>
            <Wallet size={18} weight="bold" />
          </span>
          <span className={styles.destAddress}>{WALLET}</span>
          <span className={styles.destActions}>
            <span className={`${styles.iconBtn} ${styles.iconBtnGreen}`}>
              <Copy size={14} weight="bold" />
            </span>
            <span className={styles.iconBtn}>
              <ArrowSquareOut size={14} weight="bold" />
            </span>
          </span>
        </div>
      </div>

      <div className={styles.feeBox}>
        <div className={styles.feeLine}>
          <span className={styles.feeLineLabel}>Network fee</span>
          <span className={styles.feeLineValue}>~$0.12</span>
        </div>
        <div className={styles.feeLine}>
          <span className={styles.feeLineLabel}>Kombat withdrawal fee</span>
          <span className={styles.feeLineValue}>None</span>
        </div>
        <div className={styles.feeRule} />
        <div className={styles.feeTotal}>
          <span className={styles.feeTotalLabel}>SENT TO WALLET</span>
          <span className={styles.feeTotalValue}>250.00 USDC</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn}>
          <ArrowUUpLeft size={17} weight="bold" />
          Withdraw 250 USDC
        </button>
        <button type="button" className={styles.cancelBtn}>Cancel</button>
      </div>
      <div className={styles.infoNote}>
        <Info size={14} className={styles.infoIcon} />
        <span>
          One signature to withdraw. Balance locked in an open match frees up
          when it settles.
        </span>
      </div>
    </div>
  );
}

function InvitePanel() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.panelKicker}>YOUR REFERRAL CODE</div>
        <span className={styles.feeBadge}>
          <Percent size={11} weight="fill" />
          0.1% OF FEES
        </span>
      </div>

      <div className={styles.codeRow}>
        <div className={styles.codeBox}>
          <span className={styles.codeValue}>ARTHY_REF</span>
          <Copy size={19} className={styles.mutedIcon} />
        </div>
        <button type="button" className={styles.shareBtn}>
          <ShareNetwork size={16} weight="bold" />
          Share link
        </button>
      </div>
      <div className={styles.linkRow}>
        <LinkSimple size={16} className={styles.mutedIcon} />
        <span className={styles.linkValue}>kombat.gg/join?ref=ARTHY_REF</span>
        <button type="button" className={styles.copyChip}>Copy</button>
      </div>

      <div className={styles.inviteStats}>
        <div className={styles.inviteStat}>
          <div className={styles.inviteStatValue}>14</div>
          <div className={styles.inviteStatLabel}>PLAYERS JOINED</div>
        </div>
        <div className={styles.inviteStat}>
          <div className={styles.inviteStatValue}>386</div>
          <div className={styles.inviteStatLabel}>THEIR MATCHES</div>
        </div>
        <div className={`${styles.inviteStat} ${styles.inviteStatHot}`}>
          <div className={`${styles.inviteStatValue} ${styles.amberText}`}>
            $48.20
          </div>
          <div className={styles.inviteStatLabel}>EARNED TO POT</div>
        </div>
      </div>

      <div className={styles.feeSplit}>
        <div className={styles.panelKickerSm}>WHERE A 5% PLATFORM FEE GOES</div>
        <div className={styles.feeSplitRows}>
          <div className={styles.feeSplitRow}>
            <span className={styles.feeSplitLabel}>YOU · 0.1%</span>
            <span className={styles.feeSplitBar}>
              <span
                className={`${styles.feeSplitFill} ${styles.fillYou}`}
                style={{ width: "12%" }}
              />
            </span>
          </div>
          <div className={styles.feeSplitRow}>
            <span className={styles.feeSplitLabel}>PRIZE FLOOR</span>
            <span className={styles.feeSplitBar}>
              <span
                className={`${styles.feeSplitFill} ${styles.fillPrize}`}
                style={{ width: "34%" }}
              />
            </span>
          </div>
          <div className={styles.feeSplitRow}>
            <span className={styles.feeSplitLabel}>PLATFORM</span>
            <span className={styles.feeSplitBar}>
              <span
                className={`${styles.feeSplitFill} ${styles.fillPlatform}`}
                style={{ width: "54%" }}
              />
            </span>
          </div>
        </div>
        <div className={styles.infoNote}>
          <Info size={14} className={styles.infoIcon} />
          <span>
            Your share is credited per settled match - no claim step, nothing
            to withdraw first.
          </span>
        </div>
      </div>
    </div>
  );
}
