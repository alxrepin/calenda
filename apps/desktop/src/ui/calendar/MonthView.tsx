import { useMemo } from "react";
import { useApp } from "@/application/context";
import { selectCalendarMap, selectCalendars, selectDefaultEventCalendar, selectVisibleEvents } from "@/application/selectors";
import { eventsOnDay, isBarEvent, layoutAllDayEvents } from "@/domain/eventLayout";
import type { CalendarEvent, IsoDate } from "@/domain/model";
import { dayOfMonth, formatTime, formatWeekdayLetter, monthGrid, sameMonth, weekdayIndex } from "@/domain/time";
import { colorVars } from "./eventColors";
import styles from "./MonthView.module.css";

const BAR_HEIGHT = 20;
const MAX_ROWS_PER_CELL = 4;

export function MonthView() {
  const anchor = useApp((s) => s.anchor);
  const today = useApp((s) => s.today);
  const events = useApp(selectVisibleEvents);
  const calendars = useApp(selectCalendars);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const selectDate = useApp((s) => s.selectDate);
  const setView = useApp((s) => s.setView);
  const openEditor = useApp((s) => s.openEditor);
  const defaultCalendar = useApp(selectDefaultEventCalendar);
  const byId = useMemo(() => selectCalendarMap(calendars), [calendars]);
  const weeks = useMemo(() => monthGrid(anchor), [anchor]);

  const openDay = (day: IsoDate) => {
    selectDate(day);
    setView("day");
  };
  const createOn = (day: IsoDate) => {
    if (!defaultCalendar) return;
    openEditor({ kind: "event", mode: "create", draft: { calendarId: defaultCalendar.id, title: "", time: { kind: "allDay", first: day, last: day } } });
  };
  const isSelected = (e: CalendarEvent) => selection?.kind === "event" && selection.id === e.id;

  return (
    <div className={styles.month}>
      <div className={styles.weekHeader}>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={styles.weekday} data-weekend={i >= 5}>
            {formatWeekdayLetter(i)}
          </div>
        ))}
      </div>
      <div className={styles.weeks}>
        {weeks.map((days) => {
          const bars = layoutAllDayEvents(events, days);
          const lanes = bars.reduce((m, b) => Math.max(m, b.lane + 1), 0);
          return (
            <div key={days[0]} className={styles.week}>
              {days.map((day) => {
                const timed = eventsOnDay(events, day).filter((e) => !isBarEvent(e));
                const room = Math.max(0, MAX_ROWS_PER_CELL - lanes);
                const shown = timed.slice(0, room);
                const hiddenCount = timed.length - shown.length;
                return (
                  <div
                    key={day}
                    className={styles.cell}
                    data-outside={!sameMonth(day, anchor)}
                    data-today={day === today}
                    data-selected={day === anchor && day !== today}
                    data-weekend={weekdayIndex(day) >= 5}
                    onDoubleClick={(e) => e.target === e.currentTarget && createOn(day)}
                    onClick={(e) => e.target === e.currentTarget && selectDate(day)}
                  >
                    <button type="button" className={styles.dayBtn} onClick={() => openDay(day)} aria-label={`Open ${day}`}>
                      {dayOfMonth(day)}
                    </button>
                    <div className={styles.barSpace} style={{ height: lanes * BAR_HEIGHT }} />
                    {shown.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        className={styles.item}
                        style={colorVars(byId.get(e.calendarId)?.color ?? "#8e8e93")}
                        data-selected={isSelected(e)}
                        onClick={() => select({ kind: "event", id: e.id })}
                        onDoubleClick={() => openEditor({ kind: "event", mode: "edit", event: e, draft: e })}
                        title={e.title}
                      >
                        <span className={styles.itemDot} />
                        {e.time.kind === "timed" && <span className={styles.itemTime}>{formatTime(e.time.start)}</span>}
                        <span className={styles.itemTitle}>{e.title}</span>
                      </button>
                    ))}
                    {hiddenCount > 0 && (
                      <button type="button" className={styles.more} onClick={() => openDay(day)}>
                        +{hiddenCount} more
                      </button>
                    )}
                  </div>
                );
              })}
              {bars.map((b) => (
                <button
                  key={b.event.id}
                  type="button"
                  className={styles.bar}
                  style={{
                    ...colorVars(byId.get(b.event.calendarId)?.color ?? "#8e8e93"),
                    left: `calc(${(b.startCol / 7) * 100}%)`,
                    width: `calc(${(b.span / 7) * 100}% - 4px)`,
                    top: 30 + b.lane * BAR_HEIGHT,
                  }}
                  data-selected={isSelected(b.event)}
                  onClick={() => select({ kind: "event", id: b.event.id })}
                  onDoubleClick={() => openEditor({ kind: "event", mode: "edit", event: b.event, draft: b.event })}
                  title={b.event.title}
                >
                  {b.event.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
