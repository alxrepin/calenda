import type { CSSProperties, ReactNode } from "react";
import styles from "./Chip.module.css";

export function Chip({ color, children, title }: { color: string; children: ReactNode; title?: string }) {
  return (
    <span className={styles.chip} style={{ "--c": color } as CSSProperties} title={title}>
      {children}
    </span>
  );
}
