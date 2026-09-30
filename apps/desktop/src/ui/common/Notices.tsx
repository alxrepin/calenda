import { useEffect } from "react";
import { useApp } from "@/application/context";
import { Icon } from "./Icon";
import styles from "./Notices.module.css";

export function Notices() {
  const notices = useApp((s) => s.notices);
  const dismiss = useApp((s) => s.dismissNotice);

  useEffect(() => {
    if (notices.length === 0) return;
    const latest = notices[notices.length - 1]!;
    const t = setTimeout(() => dismiss(latest.id), 6000);
    return () => clearTimeout(t);
  }, [notices, dismiss]);

  if (notices.length === 0) return null;
  return (
    <div className={styles.stack} role="status" aria-live="polite">
      {notices.map((n) => (
        <div key={n.id} className={styles.notice} data-tone={n.tone}>
          <span>{n.message}</span>
          <button type="button" className={styles.close} aria-label="Dismiss" onClick={() => dismiss(n.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
