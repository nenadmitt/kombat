import Image from "next/image";
import { GameArtVideo } from "./GameArtVideo";
import styles from "./GameArt.module.css";

type GameArtProps = {
  src?: string;
  video?: string;
  alt: string;
  width: number;
  height: number;
  placeholder?: string;
  className?: string;
};

export function GameArt({
  src,
  video,
  alt,
  width,
  height,
  placeholder,
  className,
}: GameArtProps) {
  return (
    <div
      className={[styles.card, className ?? ""].join(" ")}
      style={
        {
          // The default width only: an inline `--art-w` would outrank the media queries that shrink the card.
          "--art-w-base": `${width}px`,
          "--art-ratio": `${width} / ${height}`,
        } as React.CSSProperties
      }
    >
      {video ? (
        <GameArtVideo src={video} poster={src} />
      ) : src ? (
        // 1.5x the slot at high quality: a dense game UI at the default 75 is mushy on retina.
        <Image
          src={src}
          alt={alt}
          fill
          sizes={`${Math.round(width * 1.5)}px`}
          quality={92}
          className={styles.img}
        />
      ) : (
        <div className={styles.placeholder}>
          <span className={styles.placeholderLabel}>{placeholder ?? alt}</span>
        </div>
      )}
    </div>
  );
}
