import { useEffect, useMemo, useRef } from "react";
import { useApp } from "@/application/context";
import { selectCalendarMap, selectCalendars } from "@/application/selectors";
import type { CalendarEvent, Reminder } from "@/domain/model";
import { formatClock, formatRelativeDay, formatShortDate, formatTimeRange, toIsoDate } from "@/domain/time";
import styles from "./SearchResults.module.css";

export function SearchResults({ onClose }: { onClose: () => void }) {
  const results = useApp((s) => s.searchResults);
  const query = useApp((s) => s.searchQuery);
  const today = useApp((s) => s.today);
  const calendars = useApp(selectCalendars);
  const select = useApp((s) => s.select);
  const selectDate = useApp((s) => s.selectDate);
  const byId = useMemo(() => selectCalendarMap(calendars), [calendars]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el && !el.parentElement?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const openEvent = (e: CalendarEvent) => {
    selectDate(e.time.kind === "timed" ? toIsoDate(e.time.start) : e.time.first);
    select({ kind: "event", id: e.id });
    onClose();
  };
  const openReminder = (r: Reminder) => {
    select({ kind: "reminder", id: r.id });
    onClose();
  };

  const when = (e: CalendarEvent) =>
    e.time.kind === "timed"
      ? `${formatShortDate(toIsoDate(e.time.start))} · ${formatTimeRange(e.time.start, e.time.end, false)}`
      : `${formatShortDate(e.time.first)} · All day`;

  if (!query.trim()) return null;
  const empty = results && results.events.length === 0 && results.reminders.length === 0;

  return (
    <div ref={ref} className={styles.panel} role="listbox" aria-label="Search results">
      {!results && <div className={styles.empty}>Searching…</div>}
      {empty && <div className={styles.empty}>Nothing matches “{query.trim()}”.</div>}
      {results && results.events.length > 0 && (
        <>
          <div className={styles.group}>Events</div>
          {results.events.slice(0, 12).map((e) => (
            <button key={e.id} type="button" className={styles.item} role="option" onClick={() => openEvent(e)}>
              <span className={styles.swatch} style={{ background: byId.get(e.calendarId)?.color ?? "#999" }} />
              <span className={styles.text}>
                <span className={styles.title}>{e.title}</span>
                <span className={styles.meta}>
                  {when(e)}
                  {e.location ? ` · ${e.location}` : ""}
                </span>
              </span>
            </button>
          ))}
        </>
      )}
      {results && results.reminders.length > 0 && (
        <>
          <div className={styles.group}>Reminders</div>
          {results.reminders.slice(0, 12).map((r) => (
            <button key={r.id} type="button" className={styles.item} role="option" onClick={() => openReminder(r)}>
              <span className={styles.swatch} style={{ background: byId.get(r.listId)?.color ?? "#999" }} />
              <span className={styles.text}>
                <span className={styles.title} data-done={r.completedAt !== null}>
                  {r.title}
                </span>
                <span className={styles.meta}>
                  {byId.get(r.listId)?.title ?? "Reminder"}
                  {r.due ? ` · ${formatRelativeDay(r.due.date, today)}${r.due.time ? ` ${formatClock(r.due.time)}` : ""}` : ""}
                </span>
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  );
}
