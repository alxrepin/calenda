import { useMemo } from "react";
import { useApp } from "@/application/context";
import { selectCalendars } from "@/application/selectors";
import { filterCounts, type SidebarFilter } from "@/domain/filters";
import type { Calendar } from "@/domain/model";
import { Checkbox } from "../common/Checkbox";
import { Icon, type IconName } from "../common/Icon";
import { MiniMonth } from "./MiniMonth";
import styles from "./Sidebar.module.css";

const FILTERS: { key: SidebarFilter; label: string; icon: IconName; accent?: boolean; flag?: boolean }[] = [
  { key: "all", label: "All", icon: "grid", accent: true },
  { key: "events", label: "Events", icon: "calendar" },
  { key: "reminders", label: "Reminders", icon: "bell" },
  { key: "highPriority", label: "High priority", icon: "flag", flag: true },
  { key: "myTasks", label: "My tasks", icon: "checkCircle" },
];

export function Sidebar() {
  const calendars = useApp(selectCalendars);
  const hidden = useApp((s) => s.workspace?.preferences.hiddenCalendars ?? []);
  const toggleCalendar = useApp((s) => s.toggleCalendar);
  const filter = useApp((s) => s.filter);
  const setFilter = useApp((s) => s.setFilter);
  const events = useApp((s) => s.events);
  const reminders = useApp((s) => s.reminders);
  const openEditor = useApp((s) => s.openEditor);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const counts = useMemo(() => filterCounts(events, reminders), [events, reminders]);

  const eventCalendars = calendars.filter((c) => c.kind === "events");
  const lists = calendars.filter((c) => c.kind === "reminders");

  const row = (c: Calendar) => (
    <label key={c.id} className={styles.row}>
      <Checkbox checked={!hiddenSet.has(c.id)} color={c.color} label={`Show ${c.title}`} onChange={() => void toggleCalendar(c.id)} />
      <span className={styles.dot} style={{ background: c.color }} />
      <span className={styles.rowLabel} data-muted={hiddenSet.has(c.id)}>
        {c.title}
      </span>
    </label>
  );

  return (
    <aside className={styles.sidebar} data-tauri-drag-region>
      <div className={styles.scroll}>
        <MiniMonth />

        <section className={styles.section} aria-label="Calendars">
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Calendars</span>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="New event"
              title="New event"
              onClick={() => openEditor({ kind: "event", mode: "create", draft: { calendarId: "", title: "", time: { kind: "allDay", first: "", last: "" } } })}
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
          {eventCalendars.map(row)}
        </section>

        <section className={styles.section} aria-label="Reminder lists">
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Lists</span>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="New reminder"
              title="New reminder"
              onClick={() => openEditor({ kind: "reminder", mode: "create", draft: { listId: "", title: "" } })}
            >
              <Icon name="plus" size={14} />
            </button>
          </div>
          {lists.map(row)}
        </section>

        <section className={styles.section} aria-label="Filters">
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Filters</span>
          </div>
          {FILTERS.map((f) => (
            <button key={f.key} type="button" className={styles.row} aria-current={filter === f.key} onClick={() => setFilter(f.key)}>
              <span className={styles.filterIcon} data-accent={f.accent} data-flag={f.flag}>
                <Icon name={f.icon} size={13} strokeWidth={f.accent ? 2 : 1.8} />
              </span>
              <span className={styles.rowLabel}>{f.label}</span>
              <span className={styles.count}>{counts[f.key]}</span>
            </button>
          ))}
        </section>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.iconBtn} aria-label="Settings" title="Settings">
          <Icon name="gear" size={16} />
        </button>
        <button type="button" className={styles.iconBtn} aria-label="Help" title="Help">
          <Icon name="help" size={16} />
        </button>
      </div>
    </aside>
  );
}
