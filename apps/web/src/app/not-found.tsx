import Link from "next/link";

import { LogoMark } from "@/components/Logo";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.wrap}>
      <div className={styles.brand}>
        <LogoMark size={28} />
        <span className={styles.brandName}>KOMBAT</span>
      </div>
      <div className={styles.code}>404</div>
      <h1 className={styles.title}>This page does not exist.</h1>
      <p className={styles.body}>
        The link may be broken, or the page may have moved.
      </p>
      <Link href="/" className={styles.link}>
        Back to Kombat
      </Link>
    </div>
  );
}
