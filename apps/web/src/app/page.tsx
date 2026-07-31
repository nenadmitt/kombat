import Link from "next/link";
import {
  Crosshair,
  Percent,
  Copy,
  ShieldCheck,
  Trophy,
  CheckCircle,
} from "@phosphor-icons/react/dist/ssr";
import { LogoLockup } from "@/components/Logo";
import { PhoneFrame } from "@/components/PhoneFrame";
import { GamesCarousel } from "@/components/GamesCarousel";
import { ApplyForm, HeroInviteForm } from "@/components/InviteForms";
import { PotIllustration } from "@/components/PotIllustration";
import styles from "./page.module.css";

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={styles.brand}>
          <LogoLockup size={30} />
        </div>
        <nav className={styles.navLinks}>
          <a href="#games" className={styles.navLink}>Games</a>
          <a href="#how" className={styles.navLink}>How it works</a>
          <a href="#pot" className={styles.navLink}>Stake pot</a>
          <a href="#invite" className={styles.navLink}>Invite &amp; earn</a>
          <a href="#apply" className={styles.navCta}>
            Apply for access
          </a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>
            Play.
            <br />
            Compete.
            <br />
            <span className={styles.heroTitleAccent}>Win.</span>
          </h1>
          <p className={styles.heroLead}>
            Skill games for real stakes. Stake once into your pot, match
            against a real opponent, and the winner takes it. No house, no
            bots.
          </p>
          <HeroInviteForm />
          <div className={styles.heroStats}>
            <div>
              <div className={styles.heroStatValue}>5</div>
              <div className={styles.heroStatLabel}>Games live · more soon</div>
            </div>
            <div>
              <div className={styles.heroStatValue}>50+</div>
              <div className={styles.heroStatLabel}>Testers already</div>
            </div>
            <div>
              <div className={`${styles.heroStatValue} ${styles.amber}`}>4</div>
              <div className={styles.heroStatLabel}>Stakeable tokens</div>
            </div>
          </div>
        </div>
        <div className={styles.heroPhones}>
          <PhoneFrame
            variant="back"
            width={236}
            height={476}
            src="/screenshots/ludo-2.png"
            alt="Ludo Royale board in the Kombat app"
            className={styles.heroPhoneBack}
          />
          <PhoneFrame
            variant="front"
            width={262}
            height={526}
            src="/screenshots/salvo-2.png"
            alt="Salvo artillery duel in the Kombat app"
            className={styles.heroPhoneFront}
          />
        </div>
      </section>

      <section id="how" className={styles.how}>
        <h2 className={styles.sectionTitle}>
          Three steps between your wallet and the pot.
        </h2>
        <div className={styles.howGrid}>
          <div className={styles.howCard}>
            <div className={styles.howCardTop}>
              <span className={`${styles.howIcon} ${styles.howIconAmber}`}>
                <ShieldCheck size={20} weight="bold" />
              </span>
              <span className={styles.howIndex}>01</span>
            </div>
            <div className={styles.howCardTitle}>Stake into your pot</div>
            <p className={styles.howCardBody}>
              Send KOMBAT, USDC, USDT or ETH to the match contract once. Your
              balance becomes in-game credit - no signing per match.
            </p>
          </div>
          <div className={styles.howCard}>
            <div className={styles.howCardTop}>
              <span className={styles.howIcon}>
                <Crosshair size={20} weight="bold" />
              </span>
              <span className={styles.howIndex}>02</span>
            </div>
            <div className={styles.howCardTitle}>Match an opponent</div>
            <p className={styles.howCardBody}>
              Open a room at your stake or join one from the lobby. Both sides
              lock the same amount before the first move.
            </p>
          </div>
          <div className={styles.howCard}>
            <div className={styles.howCardTop}>
              <span className={styles.howIcon}>
                <Trophy size={20} weight="bold" />
              </span>
              <span className={styles.howIndex}>03</span>
            </div>
            <div className={styles.howCardTitle}>Winner takes the pot</div>
            <p className={styles.howCardBody}>
              The pot settles to the winner&apos;s stake balance the moment the
              match ends, minus a 5% platform fee. Withdraw any time.
            </p>
          </div>
        </div>
      </section>

      <GamesCarousel />

      <section id="pot" className={styles.pot}>
        <div>
          <h2 className={styles.sectionTitle}>Sign once. Play all night.</h2>
          <p className={styles.sectionLead}>
            Your pot is a balance held in the match contract. Fund it from any
            wallet, and every match after that is instant - no transaction, no
            gas, no waiting on a confirmation between rounds.
          </p>
          <div className={styles.checkList}>
            <div className={styles.checkItem}>
              <CheckCircle size={18} weight="fill" className={styles.amber} />
              Stake KOMBAT, USDC, USDT or ETH
            </div>
            <div className={styles.checkItem}>
              <CheckCircle size={18} weight="fill" className={styles.amber} />
              Winnings land in your pot the instant a match ends
            </div>
            <div className={styles.checkItem}>
              <CheckCircle size={18} weight="fill" className={styles.amber} />
              Withdraw the unlocked balance whenever you like
            </div>
          </div>
          <Link href="/stake" className={styles.amberCta}>
            Open the stake page
          </Link>
        </div>
        <div className={styles.potArt}>
          <div className={styles.potArtGlow} />
          <PotIllustration />
        </div>
      </section>

      <section id="invite" className={styles.invite}>
        <div className={styles.referralCard}>
          <div className={styles.referralHead}>
            <div className={styles.panelKicker}>Your referral code</div>
            <span className={styles.feeBadge}>
              <Percent size={11} weight="fill" />
              0.1% OF FEES
            </span>
          </div>
          <div className={styles.referralCodeRow}>
            <div className={styles.referralCode}>
              <span>ARTHY_REF</span>
              <Copy size={19} className={styles.copyIcon} />
            </div>
            <button type="button" className={styles.shareBtn}>
              Share
            </button>
          </div>
          <div className={styles.referralStats}>
            <div className={styles.referralStat}>
              <div className={styles.referralStatValue}>14</div>
              <div className={styles.referralStatLabel}>Players joined</div>
            </div>
            <div className={styles.referralStat}>
              <div className={styles.referralStatValue}>386</div>
              <div className={styles.referralStatLabel}>Their matches</div>
            </div>
            <div className={`${styles.referralStat} ${styles.referralStatHot}`}>
              <div className={`${styles.referralStatValue} ${styles.amber}`}>
                $48.20
              </div>
              <div className={styles.referralStatLabel}>Earned to pot</div>
            </div>
          </div>
          <div className={styles.feeSplit}>
            <div className={styles.panelKickerSm}>
              Where a 5% platform fee goes
            </div>
            <div className={styles.feeRows}>
              <div className={styles.feeRow}>
                <span className={styles.feeRowLabel}>You · 0.1%</span>
                <span className={styles.feeBar}>
                  <span
                    className={`${styles.feeBarFill} ${styles.feeBarYou}`}
                    style={{ width: "12%" }}
                  />
                </span>
              </div>
              <div className={styles.feeRow}>
                <span className={styles.feeRowLabel}>Prize floor</span>
                <span className={styles.feeBar}>
                  <span
                    className={`${styles.feeBarFill} ${styles.feeBarPrize}`}
                    style={{ width: "34%" }}
                  />
                </span>
              </div>
              <div className={styles.feeRow}>
                <span className={styles.feeRowLabel}>Platform</span>
                <span className={styles.feeBar}>
                  <span
                    className={`${styles.feeBarFill} ${styles.feeBarPlatform}`}
                    style={{ width: "54%" }}
                  />
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.inviteCopy}>
          <h2 className={styles.sectionTitle}>
            Invite players, earn on every match
          </h2>
          <p className={styles.sectionLead}>
            Share your code and 0.1% of the platform fee from every staked
            match your invites play lands straight in your stake pot - for as
            long as they keep playing.
          </p>
          <div className={styles.checkList}>
            <div className={styles.checkItem}>
              <CheckCircle size={18} weight="fill" className={styles.amber} />
              Credited per settled match - no claim step
            </div>
            <div className={styles.checkItem}>
              <CheckCircle size={18} weight="fill" className={styles.amber} />
              Paid into your pot, ready to stake again
            </div>
            <div className={styles.checkItem}>
              <CheckCircle size={18} weight="fill" className={styles.amber} />
              Codes and totals carry over at launch
            </div>
          </div>
          <Link href="/stake?tab=invite" className={styles.amberCta}>
            See your referral page
          </Link>
        </div>
      </section>

      <section id="apply" className={styles.apply}>
        <div className={styles.applyGrid}>
          <div>
            <div className={styles.testBadge}>TEST MODE</div>
            <h2 className={styles.applyTitle}>Kombat is in closed testing.</h2>
            <p className={styles.sectionLead}>
              We&apos;re onboarding testers in small batches on Ethereum
              Sepolia. Leave your email and we&apos;ll send an invite with test
              funds - nothing you stake during the test is real money.
            </p>
          </div>
          <ApplyForm />
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.brand}>
          <LogoLockup size={20} color="var(--text-55)" />
        </div>
        <div className={styles.footerLinks}>
          <a href="#" className={styles.footerLink}>Contract</a>
          <a href="#" className={styles.footerLink}>Discord</a>
          <a href="#" className={styles.footerLink}>Terms</a>
          <span>Test mode · Sepolia</span>
        </div>
      </footer>
    </div>
  );
}
