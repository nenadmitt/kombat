import Link from "next/link";

import { LogoLockup } from "@/components/Logo";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <div className={styles.wrap}>
      <div className={styles.brand}>
        <LogoLockup size={26} />
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
