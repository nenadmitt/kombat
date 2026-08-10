import { LogoMark } from "@/components/Logo";
import styles from "./HeroCollage.module.css";

const GREEN_CELLS = new Set([11, 12, 13, 14, 37, 47, 57]);
const RED_CELLS = new Set([23, 68]);
const PALE_CELLS = new Set([8, 45, 81, 92]);

const CELLS = Array.from({ length: 100 }, (_, i) => {
  if (GREEN_CELLS.has(i)) return styles.cellGreen;
  if (RED_CELLS.has(i)) return styles.cellRed;
  if (PALE_CELLS.has(i)) return styles.cellPale;
  return styles.cell;
});

const CARD_FACE =
  "M50 34 C74 34 86 48 86 68 C86 92 70 108 48 108 C26 108 14 92 14 70 C14 48 26 34 50 34 Z";

function PlayCard({ value, color }: { value: string; color: string }) {
  return (
    <svg viewBox="0 0 100 142" fill="none">
      <rect x="1" y="1" width="98" height="140" rx="15" fill={color} />
      <path d={CARD_FACE} fill="#fff" />
      <text
        x="50"
        y="86"
        textAnchor="middle"
        fontFamily="Inter,sans-serif"
        fontSize="46"
        fontWeight="800"
        fill={color}
      >
        {value}
      </text>
      <text
        x="15"
        y="27"
        fontFamily="Inter,sans-serif"
        fontSize="17"
        fontWeight="700"
        fill="#fff"
      >
        {value}
      </text>
    </svg>
  );
}

function Pawn({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none">
      <circle
        cx="24"
        cy="24"
        r="23"
        stroke={color}
        strokeWidth="2"
        opacity="0.55"
        fill="none"
      />
      <circle cx="24" cy="15" r="6.4" fill={color} />
      <path d="M13 36 C13 25 35 25 35 36 Z" fill={color} />
      <rect x="11" y="34" width="26" height="5" rx="2.5" fill={color} />
    </svg>
  );
}

export function HeroCollage() {
  return (
    <div className={styles.stage}>
      <div className={styles.scene} aria-hidden="true">
        <div className={styles.grid}>
          {CELLS.map((cell, i) => (
            <span key={i} className={cell} />
          ))}
        </div>
        <div className={styles.vignette} />

        <svg
          viewBox="0 0 500 580"
          preserveAspectRatio="none"
          fill="none"
          className={styles.terrain}
        >
          <path
            d="M-10,470 C60,436 118,486 176,462 C246,432 292,376 344,398 C404,424 452,462 512,442 L512,580 L-10,580 Z"
            fill="#16220f"
          />
          <path
            d="M-10,470 C60,436 118,486 176,462 C246,432 292,376 344,398 C404,424 452,462 512,442"
            stroke="var(--green)"
            strokeWidth="3"
          />
          <path
            d="M64,452 Q250,150 424,420"
            stroke="var(--amber)"
            strokeWidth="2.5"
            strokeDasharray="3 12"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>

        <div className={styles.logoTile}>
          <LogoMark size={80} />
        </div>

        <span className={`${styles.card} ${styles.cardGreen}`}>
          <PlayCard value="8" color="#2fd07b" />
        </span>
        <span className={`${styles.card} ${styles.cardRed}`}>
          <PlayCard value="5" color="#ff5a6e" />
        </span>
        <span className={`${styles.card} ${styles.cardBlue}`}>
          <PlayCard value="4" color="#5b8def" />
        </span>

        <span className={`${styles.tile} ${styles.starTile}`}>
          <svg viewBox="0 0 40 40" fill="none" className={styles.tileArt}>
            <path
              d="M20 0 C22 12 28 18 40 20 C28 22 22 28 20 40 C18 28 12 22 0 20 C12 18 18 12 20 0 Z"
              fill="var(--amber)"
            />
          </svg>
        </span>
        <span className={`${styles.tile} ${styles.hitTile}`}>
          <svg viewBox="0 0 40 40" fill="none" className={styles.tileArt}>
            <rect width="40" height="40" rx="9" fill="#ff5a6e" opacity="0.9" />
            <path
              d="M13 13 L27 27 M27 13 L13 27"
              stroke="#fff"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </svg>
        </span>

        <span className={`${styles.piece} ${styles.diceFour}`}>
          <svg viewBox="0 0 118 34" fill="none">
            <path
              d="M11 0 H92 L117 17 L92 34 H11 A11 11 0 0 1 11 0 Z"
              fill="var(--green)"
            />
            <circle cx="18" cy="17" r="3.6" fill="rgba(255,255,255,.75)" />
            <circle cx="40" cy="17" r="3.6" fill="rgba(255,255,255,.75)" />
            <circle cx="62" cy="17" r="3.6" fill="rgba(255,255,255,.75)" />
            <circle cx="84" cy="17" r="3.6" fill="rgba(255,255,255,.75)" />
          </svg>
        </span>
        <span className={`${styles.piece} ${styles.diceThree}`}>
          <svg viewBox="0 0 96 34" fill="none">
            <path
              d="M11 0 H70 L95 17 L70 34 H11 A11 11 0 0 1 11 0 Z"
              fill="#6c5cf5"
            />
            <circle cx="18" cy="17" r="3.6" fill="rgba(255,255,255,.75)" />
            <circle cx="40" cy="17" r="3.6" fill="rgba(255,255,255,.75)" />
            <circle cx="62" cy="17" r="3.6" fill="rgba(255,255,255,.75)" />
          </svg>
        </span>

        <span className={`${styles.tile} ${styles.pawnRedTile}`}>
          <span className={styles.pawnArt}>
            <Pawn color="#ff5a6e" />
          </span>
        </span>
        <span className={`${styles.tile} ${styles.pawnBlueTile}`}>
          <span className={styles.pawnArt}>
            <Pawn color="#5b8def" />
          </span>
        </span>

        <span className={`${styles.piece} ${styles.spinner}`}>
          <svg viewBox="0 0 60 60" fill="none">
            <path d="M0 0 H60 L30 30 Z" fill="#2fd07b" />
            <path d="M60 0 V60 L30 30 Z" fill="var(--amber)" />
            <path d="M60 60 H0 L30 30 Z" fill="#5b8def" />
            <path d="M0 60 V0 L30 30 Z" fill="#ff5a6e" />
            <path
              d="M30 18 L34 27 L44 28 L36 34 L39 44 L30 38 L21 44 L24 34 L16 28 L26 27 Z"
              fill="#fff"
            />
          </svg>
        </span>

        <span className={`${styles.piece} ${styles.gavel}`}>
          <svg viewBox="0 0 68 49" fill="none">
            <rect
              x="30"
              y="4"
              width="30"
              height="7"
              rx="3.5"
              fill="var(--green)"
              transform="rotate(-34 30 10)"
            />
            <path d="M6 30 C6 20 40 20 40 30 Z" fill="var(--green)" />
            <rect
              x="2"
              y="29"
              width="46"
              height="13"
              rx="6.5"
              fill="var(--green)"
            />
          </svg>
        </span>

        <span className={`${styles.piece} ${styles.target}`}>
          <svg viewBox="0 0 60 60" fill="none">
            <circle
              cx="30"
              cy="30"
              r="28"
              stroke="var(--green)"
              strokeWidth="2"
              opacity="0.55"
              fill="none"
            />
            <circle
              cx="30"
              cy="30"
              r="19"
              stroke="var(--amber)"
              strokeWidth="2"
              opacity="0.7"
              fill="none"
            />
            <circle cx="30" cy="30" r="10" fill="var(--amber)" opacity="0.85" />
            <circle cx="30" cy="30" r="4.5" fill="#fff6db" />
          </svg>
        </span>
      </div>

    </div>
  );
}
