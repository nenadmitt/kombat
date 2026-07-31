import Image from "next/image";
import styles from "./PhoneFrame.module.css";

type PhoneFrameProps = {
  src?: string;
  alt: string;
  width: number;
  height: number;
  variant?: "front" | "back";
  placeholder?: string;
  className?: string;
};

export function PhoneFrame({
  src,
  alt,
  width,
  height,
  variant = "front",
  placeholder,
  className,
}: PhoneFrameProps) {
  const pad = variant === "front" ? 9 : 8;
  const outerRadius = variant === "front" ? 40 : 34;
  return (
    <div
      className={[
        styles.shell,
        variant === "front" ? styles.front : styles.back,
        className ?? "",
      ].join(" ")}
      style={
        {
          // The default width, not the width: an inline `--phone-w` would
          // outrank the media queries that shrink the phone. The screen then
          // follows by ratio rather than a fixed height.
          "--phone-w-base": `${width}px`,
          "--phone-ratio": `${width - pad * 2} / ${height}`,
          padding: pad,
          borderRadius: outerRadius,
        } as React.CSSProperties
      }
    >
      <div
        className={styles.screen}
        style={{ borderRadius: outerRadius - 7 }}
      >
        {src ? (
          // 1.5x the slot and a high quality: a dense game UI at the default
          // 75 is visibly mushy on a retina screen.
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
    </div>
  );
}
