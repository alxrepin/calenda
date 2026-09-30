import { useMemo, useState } from "react";
import { useApp } from "@/application/context";
import { addMonths, formatMonthTitle, formatWeekdayLetter, monthGrid, sameMonth, dayOfMonth, startOfMonth } from "@/domain/time";
import { eventDateSpan } from "@/domain/eventLayout";
import { Icon } from "../common/Icon";
import styles from "./MiniMonth.module.css";

export function MiniMonth() {
  const anchor = useApp((s) => s.anchor);
  const today = useApp((s) => s.today);
  const events = useApp((s) => s.events);
  const selectDate = useApp((s) => s.selectDate);
  const [shown, setShown] = useState(() => startOfMonth(anchor));
  const [followed, setFollowed] = useState(anchor);

  // Follow the main view when it moves, without fighting the user's browsing.
  if (followed !== anchor) {
    setFollowed(anchor);
    setShown(startOfMonth(anchor));
  }

  const grid = useMemo(() => monthGrid(shown), [shown]);
  const busy = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) {
      const { first, last } = eventDateSpan(e);
      set.add(first);
      if (last !== first) set.add(last);
    }
    return set;
  }, [events]);

  return (
    <div className={styles.wrap} aria-label="Month overview">
      <div className={styles.head}>
        <span className={styles.title}>{formatMonthTitle(shown)}</span>
        <span className={styles.nav}>
          <button type="button" className={styles.navBtn} aria-label="Previous month" onClick={() => setShown(addMonths(shown, -1))}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <button type="button" className={styles.navBtn} aria-label="Next month" onClick={() => setShown(addMonths(shown, 1))}>
            <Icon name="chevronRight" size={14} />
          </button>
        </span>
      </div>
      <div className={styles.grid} role="grid">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={styles.weekday} role="columnheader">
            {formatWeekdayLetter(i)}
          </div>
        ))}
        {grid.flat().map((date) => (
          <button
            key={date}
            type="button"
            role="gridcell"
            className={styles.day}
            data-outside={!sameMonth(date, shown)}
            data-selected={date === anchor}
            data-today={date === today}
            data-busy={busy.has(date)}
            aria-label={date}
            aria-selected={date === anchor}
            onClick={() => selectDate(date)}
          >
            {dayOfMonth(date)}
          </button>
        ))}
      </div>
    </div>
  );
}
