"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Plus } from "@phosphor-icons/react";
import { GameIcon } from "@/components/GameIcon";
import { GameArt } from "@/components/GameArt";
import { DEMO_APP_URL } from "@/lib/links";
import styles from "./GamesCarousel.module.css";

type Game = {
  name: string;
  icon: ReactNode;
  badge?: { label: string; tone: "amber" | "green" };
  category: string;
  description: string;
  matchLength: string;
  screenshots?: [string, string];
  /** Looping gameplay recordings; when set, play inside the art cards with the
   *  screenshots as posters. See public/recordings/README.md. */
  videos?: [string | undefined, string | undefined];
};

const GAMES: Game[] = [
  {
    name: "Salvo",
    icon: <GameIcon game="salvo" />,
    badge: { label: "NEW", tone: "green" },
    category: "ARTILLERY · 1V1",
    description:
      "Turn-based tank duel across broken terrain. Set your angle and power, allow for the wind, and try to land a shell before they range in on you.",
    matchLength: "~5 min",
    screenshots: [
      "/screenshots/salvo-aim.png",
      "/screenshots/salvo-hit.png",
    ],
  },
  {
    name: "Battleships",
    icon: <GameIcon game="battleships" />,
    badge: { label: "MOST PLAYED", tone: "amber" },
    category: "STRATEGY · 1V1",
    description:
      "Place your fleet and mines on a 10×10 grid, then hunt theirs one shot at a time. If they hit one of your mines, the blast takes out a 3×3 patch of their own fleet and ends their turn.",
    matchLength: "~6 min",
    screenshots: [
      "/screenshots/naval-deploy.png",
      "/screenshots/naval-fleet.png",
    ],
  },
  {
    name: "Ludo Royale",
    icon: <GameIcon game="ludo" />,
    category: "BOARD · UP TO 4",
    description:
      "The board game you already know. Get all four pawns home to win, and land on a rival to knock them back to the start.",
    matchLength: "~9 min",
    screenshots: [
      "/screenshots/ludo-race.png",
      "/screenshots/ludo-turn.png",
    ],
  },
  {
    name: "Triple Cut",
    icon: <GameIcon game="tripleCut" />,
    category: "DUEL · 1V1",
    description:
      "Best of five, one call each round. The quickest game on Kombat and the easiest one to start with.",
    matchLength: "~2 min",
    screenshots: [
      "/screenshots/triplecut-pick.png",
      "/screenshots/triplecut-reveal.png",
    ],
  },
  {
    name: "Chroma Clash",
    icon: <GameIcon game="chroma" />,
    category: "CARDS · UP TO 4",
    description:
      "Match the colour or the number on the pile to shed a card. First player to empty their hand wins, so watch what everyone else is holding.",
    matchLength: "~4 min",
    screenshots: [
      "/screenshots/chroma-hand.png",
      "/screenshots/chroma-play.png",
    ],
  },
];

export function GamesCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const scrollToCard = (index: number) => {
    const track = trackRef.current;
    if (!track) return;
    const card = track.children[0]?.children[index] as HTMLElement | undefined;
    card?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  };

  const step = (dir: 1 | -1) => {
    const next = Math.min(GAMES.length, Math.max(0, active + dir));
    scrollToCard(next);
  };

  const onScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const row = track.children[0] as HTMLElement;
    const cards = Array.from(row.children) as HTMLElement[];
    const x = track.scrollLeft;
    let nearest = 0;
    let best = Infinity;
    cards.forEach((card, i) => {
      const d = Math.abs(card.offsetLeft - 60 - x);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    setActive(nearest);
  };

  return (
    <section id="games" className={styles.arena}>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>The arena</div>
          <h2 className={styles.title}>Pick your game.</h2>
          <p className={styles.lead}>
            New games ship during the closed test, and testers vote on what
            gets built next.
          </p>
        </div>
        <div className={styles.headSide}>
          <div className={styles.arrows}>
            <button
              type="button"
              aria-label="Previous game"
              className={styles.arrowBtn}
              onClick={() => step(-1)}
            >
              <ArrowLeft size={16} weight="bold" />
            </button>
            <button
              type="button"
              aria-label="Next game"
              className={`${styles.arrowBtn} ${styles.arrowBtnPrimary}`}
              onClick={() => step(1)}
            >
              <ArrowRight size={16} weight="bold" />
            </button>
          </div>
        </div>
      </div>

      <div className={styles.track} ref={trackRef} onScroll={onScroll}>
        <div className={styles.row}>
          {GAMES.map((game) => (
            <article key={game.name} className={styles.card}>
              <div>
                <div className={styles.cardHead}>
                  <span className={styles.gameIcon}>{game.icon}</span>
                  <div>
                    <div className={styles.nameRow}>
                      <span className={styles.gameName}>{game.name}</span>
                      {game.badge && (
                        <span
                          className={`${styles.badge} ${
                            game.badge.tone === "amber"
                              ? styles.badgeAmber
                              : styles.badgeGreen
                          }`}
                        >
                          {game.badge.label}
                        </span>
                      )}
                    </div>
                    <div className={styles.category}>{game.category}</div>
                  </div>
                </div>
                <p className={styles.description}>{game.description}</p>
                <div className={styles.matchStat}>
                  <div className={styles.matchStatValue}>
                    {game.matchLength}
                  </div>
                  <div className={styles.matchStatLabel}>A MATCH</div>
                </div>
                <div className={styles.cardActions}>
                  <button type="button" className={styles.howBtn}>
                    How it plays
                  </button>
                </div>
              </div>
              <div className={styles.art}>
                <div className={styles.artGlow} />
                <GameArt
                  width={188}
                  height={409}
                  src={game.screenshots?.[0]}
                  video={game.videos?.[0]}
                  alt={`${game.name} gameplay`}
                  placeholder={`${game.name} screenshot soon`}
                  className={styles.artBack}
                />
                <GameArt
                  width={224}
                  height={487}
                  src={game.screenshots?.[1]}
                  video={game.videos?.[1]}
                  alt={`${game.name} gameplay`}
                  placeholder={`${game.name} screenshot soon`}
                  className={styles.artFront}
                />
              </div>
            </article>
          ))}

          <article className={`${styles.card} ${styles.moreCard}`}>
            <span className={styles.moreIcon}>
              <Plus size={28} weight="bold" />
            </span>
            <div className={styles.moreTitle}>
              More games
              <br />
              in the works
            </div>
            <p className={styles.moreBody}>
              We add a new game every few weeks during the closed test. Testers
              get a say in which one comes next.
            </p>
            <a href={DEMO_APP_URL} className={styles.moreLink}>
              Play what&apos;s live now
            </a>
          </article>
        </div>
      </div>

      <div className={styles.dots}>
        {[...GAMES.map((g) => g.name), "more"].map((key, i) => (
          <button
            type="button"
            key={key}
            aria-label={`Go to slide ${i + 1}`}
            className={`${styles.dot} ${i === active ? styles.dotActive : ""}`}
            onClick={() => scrollToCard(i)}
          />
        ))}
      </div>
    </section>
  );
}
