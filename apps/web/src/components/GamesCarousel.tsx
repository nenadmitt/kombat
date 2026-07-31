"use client";

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Crosshair,
  DiceFive,
  Hand,
  Plus,
  Stack,
  Target,
} from "@phosphor-icons/react";
import { PhoneFrame } from "@/components/PhoneFrame";
import styles from "./GamesCarousel.module.css";

type Game = {
  name: string;
  icon: ReactNode;
  badge?: { label: string; tone: "amber" | "green" };
  category: string;
  description: string;
  matchLength: string;
  screenshots?: [string, string];
};

const GAMES: Game[] = [
  {
    name: "Battleships",
    icon: <Crosshair size={31} />,
    badge: { label: "MOST PLAYED", tone: "amber" },
    category: "STRATEGY · 1V1",
    description:
      "Place your fleet on a 10×10 grid, then hunt theirs one salvo at a time. Every shot you take is public information - reading their pattern matters more than luck.",
    matchLength: "~6 min",
    screenshots: [
      "/screenshots/battleship-game-ss1.png",
      "/screenshots/battleship-game-ss.png",
    ],
  },
  {
    name: "Chroma Clash",
    icon: <Stack size={31} />,
    category: "CARDS · 1V1",
    description:
      "A fast colour-chain duel. Play into your opponent's suit to steal the lead, hold a wildcard too long and it turns dead in your hand.",
    matchLength: "~4 min",
  },
  {
    name: "Salvo",
    icon: <Target size={31} />,
    badge: { label: "NEW", tone: "green" },
    category: "ARTILLERY · 1V1",
    description:
      "Turn-based tank duel across broken terrain. Set angle and power, read the wind, and land a shell before they range in on you.",
    matchLength: "~5 min",
  },
  {
    name: "Ludo Royale",
    icon: <DiceFive size={31} />,
    category: "BOARD · 1V1",
    description:
      "The board game you already know, played for a pot. Four tokens home wins it - knock a rival back to start and the whole race resets in your favour.",
    matchLength: "~9 min",
  },
  {
    name: "Triple Cut",
    icon: <Hand size={31} />,
    category: "DUEL · 1V1",
    description:
      "Three rounds, one call each. Fastest game on Kombat and the cheapest way to learn how staking feels before you size up.",
    matchLength: "~2 min",
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
          <div className={styles.kicker}>THE ARENA</div>
          <h2 className={styles.title}>Five games today. More every month.</h2>
          <p className={styles.lead}>
            The roster keeps expanding - new arenas ship through the test and
            testers pick the order.
          </p>
        </div>
        <div className={styles.headSide}>
          <div className={styles.liveNow}>
            <span className={styles.liveDot} />
            50+ testers in the arena
          </div>
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
              <div className={styles.phones}>
                <div className={styles.phonesGlow} />
                <PhoneFrame
                  variant="back"
                  width={212}
                  height={426}
                  src={game.screenshots?.[0]}
                  alt={`${game.name} screen`}
                  placeholder={`${game.name} screenshot soon`}
                  className={styles.phoneBack}
                />
                <PhoneFrame
                  variant="front"
                  width={244}
                  height={492}
                  src={game.screenshots?.[1]}
                  alt={`${game.name} screen`}
                  placeholder={`${game.name} screenshot soon`}
                  className={styles.phoneFront}
                />
              </div>
            </article>
          ))}

          <article className={`${styles.card} ${styles.moreCard}`}>
            <span className={styles.moreIcon}>
              <Plus size={28} weight="bold" />
            </span>
            <div className={styles.moreTitle}>
              More arenas
              <br />
              in the works
            </div>
            <p className={styles.moreBody}>
              We ship a new game every few weeks through the closed test, and
              testers vote on what gets built next.
            </p>
            <a href="#apply" className={styles.moreLink}>
              Join the test to vote
              <ArrowRight size={14} weight="bold" />
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
