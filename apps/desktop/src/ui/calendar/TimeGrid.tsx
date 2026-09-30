import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useApp } from "@/application/context";
import { selectCalendarMap, selectCalendars, selectDefaultEventCalendar, selectVisibleEvents } from "@/application/selectors";
import { isBarEvent, layoutAllDayEvents, layoutTimedEvents, type TimedPlacement } from "@/domain/eventLayout";
import type { CalendarEvent, IsoDate, Reminder } from "@/domain/model";
import { timedRemindersOn } from "@/domain/reminderGroups";
import {
  addDays,
  atClockTime,
  clockMinutes,
  dayOfMonth,
  formatClock,
  formatHourLabel,
  formatTime,
  formatTimeRange,
  formatWeekdayShort,
  localMidnight,
  minutesSinceMidnight,
  snapMinutes,
  toIsoDate,
  weekdayIndex,
} from "@/domain/time";
import { Checkbox } from "../common/Checkbox";
import { colorVars } from "./eventColors";
import { useDragMove } from "./useDragMove";
import styles from "./TimeGrid.module.css";

const HOUR_HEIGHT = 60;
const GUTTER_WIDTH = 56;
const DEFAULT_SCROLL_HOUR = 8;

interface TimeGridProps {
  days: IsoDate[];
}

export function TimeGrid({ days }: TimeGridProps) {
  const events = useApp(selectVisibleEvents);
  const reminders = useApp((s) => s.reminders);
  const showRemindersInGrid = useApp((s) => s.workspace?.preferences.showRemindersInGrid ?? false);
  const calendars = useApp(selectCalendars);
  const today = useApp((s) => s.today);
  const selection = useApp((s) => s.selection);
  const select = useApp((s) => s.select);
  const openEditor = useApp((s) => s.openEditor);
  const moveEvent = useApp((s) => s.moveEvent);
  const toggleReminder = useApp((s) => s.toggleReminder);
  const defaultCalendar = useApp(selectDefaultEventCalendar);
  const byId = useMemo(() => selectCalendarMap(calendars), [calendars]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  const bars = useMemo(() => layoutAllDayEvents(events, days), [events, days]);
  const laneCount = Math.max(1, bars.reduce((m, b) => Math.max(m, b.lane + 1), 0));
  const timedByDay = useMemo(() => {
    const timed = events.filter((e) => !isBarEvent(e));
    return days.map((day) => layoutTimedEvents(timed, day));
  }, [events, days]);
  const remindersByDay = useMemo(
    () => (showRemindersInGrid ? days.map((day) => timedRemindersOn(reminders, day)) : days.map(() => [] as Reminder[])),
    [showRemindersInGrid, reminders, days],
  );

  const onDrop = useCallback(
    (event: CalendarEvent, dayIndex: number, startMinutes: number | undefined, dayShift: number) => {
      const day = days[dayIndex];
      if (!day) return;
      if (event.time.kind === "timed" && startMinutes !== undefined) {
        const newStart = new Date(localMidnight(day).getTime() + startMinutes * 60_000);
        if (newStart.getTime() !== event.time.start.getTime()) void moveEvent(event, newStart, day);
        return;
      }
      if (dayShift === 0) return;
      if (event.time.kind === "timed") {
        // A multi-day timed event dragged as a bar keeps its clock time.
        const newStart = new Date(event.time.start);
        newStart.setDate(newStart.getDate() + dayShift);
        void moveEvent(event, newStart, toIsoDate(newStart));
      } else {
        const newFirst = addDays(event.time.first, dayShift);
        void moveEvent(event, localMidnight(newFirst), newFirst);
      }
    },
    [days, moveEvent],
  );

  const { drag, onPointerDown, onPointerMove, onPointerUp, cancel } = useDragMove({
    columnsRef: canvasRef,
    gutterWidth: GUTTER_WIDTH,
    hourHeight: HOUR_HEIGHT,
    dayCount: days.length,
    onDrop,
  });

  // Initial scroll: around now when today is visible, otherwise the morning.
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const showsToday = days.includes(today);
    const hour = showsToday ? Math.max(0, minutesSinceMidnight(new Date()) / 60 - 2.5) : DEFAULT_SCROLL_HOUR - 0.5;
    body.scrollTop = hour * HOUR_HEIGHT;
    // Only on mount and when the set of days changes identity.
  }, [days.join(",")]);

  const createAt = (day: IsoDate, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !defaultCalendar) return;
    const rect = canvas.getBoundingClientRect();
    const minutes = snapMinutes(((clientY - rect.top) / HOUR_HEIGHT) * 60, 30);
    const start = new Date(localMidnight(day).getTime() + Math.min(minutes, 23 * 60) * 60_000);
    const end = new Date(start.getTime() + 60 * 60_000);
    openEditor({ kind: "event", mode: "create", draft: { calendarId: defaultCalendar.id, title: "", time: { kind: "timed", start, end } } });
  };

  const createAllDay = (day: IsoDate) => {
    if (!defaultCalendar) return;
    openEditor({ kind: "event", mode: "create", draft: { calendarId: defaultCalendar.id, title: "", time: { kind: "allDay", first: day, last: day } } });
  };

  const onBlockPointerUp = (e: ReactPointerEvent, event: CalendarEvent) => {
    const dragged = onPointerUp(e);
    if (!dragged) select({ kind: "event", id: event.id });
  };

  const isSelected = (id: string) => selection?.kind === "event" && selection.id === id;
  const hours = Array.from({ length: 23 }, (_, i) => i + 1);

  return (
    <div className={styles.grid} style={{ "--cols": days.length } as React.CSSProperties}>
      <div className={styles.header}>
        <div />
        {days.map((day) => (
          <div key={day} className={styles.dayHead} data-today={day === today} data-weekend={weekdayIndex(day) >= 5}>
            <span className={styles.weekday}>{formatWeekdayShort(day)}</span>
            <span className={styles.dayNum}>{dayOfMonth(day)}</span>
          </div>
        ))}
      </div>

      <div className={styles.allDay}>
        <div className={styles.gutterLabel}>All-day</div>
        <div className={styles.lanes} style={{ gridTemplateRows: `repeat(${laneCount}, 26px)` }} onPointerMove={onPointerMove} onPointerCancel={cancel}>
          {days.map((day, i) => (
            <div key={day} className={styles.laneCell} style={{ gridColumn: i + 1 }} onDoubleClick={() => createAllDay(day)} />
          ))}
          {bars.map((b) => {
            const color = byId.get(b.event.calendarId)?.color ?? "#8e8e93";
            const ghosted = drag?.event.id === b.event.id;
            const shift = ghosted && drag ? drag.dayShift : 0;
            const startCol = Math.max(0, Math.min(days.length - 1, b.startCol + shift));
            const span = Math.min(b.span, days.length - startCol);
            return (
              <button
                key={b.event.id}
                type="button"
                className={styles.bar}
                style={{ ...colorVars(color), gridColumn: `${startCol + 1} / span ${span}`, gridRow: b.lane + 1 }}
                data-clipped-start={b.clippedStart}
                data-clipped-end={b.clippedEnd}
                data-selected={isSelected(b.event.id)}
                data-dragging={ghosted}
                title={b.event.title}
                onPointerDown={(e) => onPointerDown(e, b.event, 0, 0, true)}
                onPointerUp={(e) => onBlockPointerUp(e, b.event)}
                onDoubleClick={() => openEditor({ kind: "event", mode: "edit", event: b.event, draft: b.event })}
              >
                {b.event.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.body} ref={bodyRef}>
        <div className={styles.canvas} ref={canvasRef} onPointerMove={onPointerMove} onPointerCancel={cancel}>
          <div className={styles.gutter}>
            {hours.map((h) => (
              <span key={h} className={styles.hourLabel} style={{ top: h * HOUR_HEIGHT }}>
                {formatHourLabel(h)}
              </span>
            ))}
          </div>
          {days.map((day, dayIndex) => (
            <div
              key={day}
              className={styles.column}
              data-today={day === today}
              onDoubleClick={(e) => e.target === e.currentTarget && createAt(day, e.clientY)}
              onClick={(e) => e.target === e.currentTarget && select(null)}
            >
              {timedByDay[dayIndex]?.map((p) => (
                <EventBlock
                  key={p.event.id}
                  placement={p}
                  color={byId.get(p.event.calendarId)?.color ?? "#8e8e93"}
                  selected={isSelected(p.event.id)}
                  dragging={drag?.event.id === p.event.id}
                  onPointerDown={(e) => onPointerDown(e, p.event, p.startMinutes, p.endMinutes - p.startMinutes, false)}
                  onPointerUp={(e) => onBlockPointerUp(e, p.event)}
                  onDoubleClick={() => openEditor({ kind: "event", mode: "edit", event: p.event, draft: p.event })}
                />
              ))}
              {remindersByDay[dayIndex]?.map((r) => (
                <div
                  key={r.id}
                  className={styles.reminder}
                  style={{ ...colorVars(byId.get(r.listId)?.color ?? "#8e8e93"), top: (clockMinutes(r.due!.time!) / 60) * HOUR_HEIGHT }}
                  data-done={r.completedAt !== null}
                  onClick={() => select({ kind: "reminder", id: r.id })}
                  title={`${r.title} · ${formatClock(r.due!.time!)}`}
                >
                  <Checkbox round checked={r.completedAt !== null} label={`Complete ${r.title}`} onChange={() => void toggleReminder(r.id)} />
                  <span>{r.title}</span>
                </div>
              ))}
              {drag && drag.dayIndex === dayIndex && drag.startMinutes !== undefined && (
                <div
                  className={styles.ghost}
                  style={{
                    ...colorVars(byId.get(drag.event.calendarId)?.color ?? "#8e8e93"),
                    top: (drag.startMinutes / 60) * HOUR_HEIGHT,
                    height: Math.max(20, (drag.durationMinutes / 60) * HOUR_HEIGHT),
                    left: 2,
                    right: 2,
                  }}
                >
                  {formatTime(atClockTime(day, `${Math.floor(drag.startMinutes / 60)}:${drag.startMinutes % 60}`))}
                </div>
              )}
            </div>
          ))}
          {days.includes(today) && <NowLine dayIndex={days.indexOf(today)} dayCount={days.length} />}
        </div>
      </div>
    </div>
  );
}

interface EventBlockProps {
  placement: TimedPlacement;
  color: string;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onDoubleClick: () => void;
}

function EventBlock({ placement, color, selected, dragging, onPointerDown, onPointerUp, onDoubleClick }: EventBlockProps) {
  const { event, startMinutes, endMinutes, column, columns } = placement;
  const top = (startMinutes / 60) * HOUR_HEIGHT;
  const height = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT;
  const widthPct = 100 / columns;
  const short = height < 34;
  const time = event.time.kind === "timed" ? formatTimeRange(event.time.start, event.time.end) : "";
  return (
    <button
      type="button"
      className={styles.event}
      style={{
        ...colorVars(color),
        top: top + 1,
        height: Math.max(height - 2, 18),
        left: `calc(${column * widthPct}% + 2px)`,
        width: `calc(${widthPct}% - ${column === columns - 1 ? 4 : 3}px)`,
      }}
      data-selected={selected}
      data-dragging={dragging}
      data-readonly={event.readOnly}
      data-short={short}
      title={`${event.title}\n${time}${event.location ? `\n${event.location}` : ""}`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
    >
      <span className={styles.eventTitle}>{event.title}</span>
      <span className={styles.eventMeta}>{time}</span>
      {!short && event.location && <span className={styles.eventMeta}>{event.location}</span>}
    </button>
  );
}

function NowLine({ dayIndex, dayCount }: { dayIndex: number; dayCount: number }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const top = (minutesSinceMidnight(now) / 60) * HOUR_HEIGHT;
  const dotLeft = `calc(var(--gutter-width) + (100% - var(--gutter-width)) * ${dayIndex / dayCount})`;
  return (
    <div className={styles.nowLine} style={{ top }} aria-hidden="true">
      <span className={styles.nowPill}>{formatTime(now)}</span>
      <span className={styles.nowDot} style={{ left: dotLeft }} />
    </div>
  );
}
