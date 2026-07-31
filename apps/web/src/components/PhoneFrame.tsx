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
      style={{ width, padding: pad, borderRadius: outerRadius }}
    >
      <div
        className={styles.screen}
        style={{ height, borderRadius: outerRadius - 7 }}
      >
        {src ? (
          <Image src={src} alt={alt} fill sizes={`${width}px`} className={styles.img} />
        ) : (
          <div className={styles.placeholder}>
            <span className={styles.placeholderLabel}>{placeholder ?? alt}</span>
          </div>
        )}
      </div>
    </div>
  );
}
