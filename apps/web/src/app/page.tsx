import Link from "next/link";
import {
  Crosshair,
  Percent,
  ShieldCheck,
  Trophy,
  CheckCircle,
  DiscordLogo,
  TelegramLogo,
  ArrowUpRight,
} from "@phosphor-icons/react/dist/ssr";
import { PotIcon } from "@/components/BrandIcon";
import { LogoLockup } from "@/components/Logo";
import { ReferralCodeRow } from "@/components/ReferralCodeRow";
import { PhoneFrame } from "@/components/PhoneFrame";
import { GamesCarousel } from "@/components/GamesCarousel";
import { ApplyForm, HeroInviteForm } from "@/components/InviteForms";
import { PotIllustration } from "@/components/PotIllustration";
import { Footer } from "@/components/Footer";
import { DISCORD_URL, TELEGRAM_URL } from "@/lib/links";
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
          <Link href="/stake" className={styles.navStake}>
            <PotIcon size={17} />
            Stake
          </Link>
          <a href="#apply" className={styles.navCta}>
            Apply for access
          </a>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>
            Play a real
            <br />
            opponent.
            <br />
            <span className={styles.heroTitleAccent}>Free or staked.</span>
          </h1>
          <p className={styles.heroLead}>
            The quickest game is over in two minutes, a full game of
            Battleships takes about six. Open a room for nothing, or put a
            stake on it and the winner takes the pot.
          </p>
          <HeroInviteForm />
          <div className={styles.heroStats}>
            <div>
              <div className={styles.heroStatValue}>50+</div>
              <div className={styles.heroStatLabel}>Testers already</div>
            </div>
            <div>
              <div className={styles.heroStatValue}>2 min</div>
              <div className={styles.heroStatLabel}>Shortest match</div>
            </div>
            <div>
              <div className={`${styles.heroStatValue} ${styles.amber}`}>
                Free
              </div>
              <div className={styles.heroStatLabel}>Or play for a stake</div>
            </div>
          </div>
        </div>
        <div className={styles.heroPhones}>
          <PhoneFrame
            variant="back"
            width={210}
            height={422}
            src="/screenshots/ludo-turn.png"
            alt="Ludo Royale board in the Kombat app"
            className={styles.heroPhoneLeft}
          />
          <PhoneFrame
            variant="back"
            width={210}
            height={422}
            src="/screenshots/salvo-hit.png"
            alt="Salvo artillery duel in the Kombat app"
            className={styles.heroPhoneRight}
          />
          <PhoneFrame
            variant="front"
            width={262}
            height={526}
            src="/screenshots/naval-fleet.png"
            alt="Battleships fleet grid in the Kombat app"
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
              Send KOMBAT, USDC, USDT or DAI to the match contract once. Your
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
            If you do want to play for something, your pot is a balance held in
            the match contract. Fund it once from any wallet and staked matches
            start straight away, with no transaction to sign between rounds.
          </p>
          <div className={styles.checkList}>
            <div className={styles.checkItem}>
              <CheckCircle size={18} weight="fill" className={styles.amber} />
              Stake KOMBAT, USDC, USDT or DAI
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
            <div className={styles.panelKicker}>Your referral code · Example</div>
            <span className={styles.feeBadge}>
              <Percent size={11} weight="fill" />
              0.1% OF FEES
            </span>
          </div>
          <ReferralCodeRow />
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
            Share your code. When someone you invited plays a staked match,
            0.1% of the platform fee goes to your pot, for as long as they
            keep playing.
          </p>
          <div className={styles.checkList}>
            <div className={styles.checkItem}>
              <CheckCircle size={18} weight="fill" className={styles.amber} />
              Credited automatically on every settled match
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

      <section id="community" className={styles.community}>
        <h2 className={styles.sectionTitle}>Found a bug? Got an idea?</h2>
        <p className={styles.sectionLead}>
          Report a bug, suggest a feature, or get involved some other way. The
          group chats are where the team actually is, and we read everything.
        </p>
        <div className={styles.communityGrid}>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.communityCard}
          >
            <span className={styles.communityIcon}>
              <DiscordLogo size={24} weight="fill" />
            </span>
            <span className={styles.communityCardTitle}>Discord</span>
            <p className={styles.communityCardBody}>
              Bug reports, feature requests, and the build channel where new
              games show up before they ship.
            </p>
            <span className={styles.communityCardCta}>
              Join the server
              <ArrowUpRight size={15} weight="bold" />
            </span>
          </a>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
            className={styles.communityCard}
          >
            <span
              className={`${styles.communityIcon} ${styles.communityIconAmber}`}
            >
              <TelegramLogo size={24} weight="fill" />
            </span>
            <span className={styles.communityCardTitle}>Telegram</span>
            <p className={styles.communityCardBody}>
              Quicker back and forth - match questions, tester invites, and
              whatever is breaking right now.
            </p>
            <span className={styles.communityCardCta}>
              Join the group
              <ArrowUpRight size={15} weight="bold" />
            </span>
          </a>
        </div>
      </section>

      <section id="apply" className={styles.apply}>
        <div className={styles.applyCard}>
          <div className={styles.applyGrid}>
            <div>
              <div className={styles.testBadge}>TEST MODE</div>
              <h2 className={styles.applyTitle}>Kombat is in closed testing.</h2>
              <p className={styles.sectionLead}>
                We&apos;re adding testers in small batches on Ethereum Sepolia.
                Leave your email and we&apos;ll send an invite with test funds.
                Nothing you stake during the test is real money.
              </p>
              <p className={styles.applyContact}>
                Stuck on something? Ask in the{" "}
                <a
                  href={DISCORD_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.applyLink}
                >
                  Discord
                </a>{" "}
                or{" "}
                <a
                  href={TELEGRAM_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.applyLink}
                >
                  Telegram group
                </a>
                .
              </p>
            </div>
            <ApplyForm />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
