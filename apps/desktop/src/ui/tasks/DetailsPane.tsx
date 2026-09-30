import { useMemo } from "react";
import { useApp } from "@/application/context";
import { selectCalendarMap, selectCalendars, selectSelectedEvent, selectSelectedReminder } from "@/application/selectors";
import { formatClock, formatRelativeDay, formatShortDate, formatTimeRange, toIsoDate } from "@/domain/time";
import { openExternal } from "@/infrastructure/openExternal";
import { Checkbox } from "../common/Checkbox";
import { Chip } from "../common/Chip";
import { Icon, type IconName } from "../common/Icon";
import { colorVars } from "../calendar/eventColors";
import styles from "./DetailsPane.module.css";

export function DetailsPane() {
  const event = useApp(selectSelectedEvent);
  const reminder = useApp(selectSelectedReminder);
  const calendars = useApp(selectCalendars);
  const today = useApp((s) => s.today);
  const openEditor = useApp((s) => s.openEditor);
  const deleteEvent = useApp((s) => s.deleteEvent);
  const deleteReminder = useApp((s) => s.deleteReminder);
  const toggleReminder = useApp((s) => s.toggleReminder);
  const byId = useMemo(() => selectCalendarMap(calendars), [calendars]);

  if (!event && !reminder) {
    return (
      <div className={styles.pane}>
        <div className={styles.empty}>Select an event or a task to see its details.</div>
      </div>
    );
  }

  const Row = ({ icon, children }: { icon: IconName; children: React.ReactNode }) => (
    <div className={styles.row}>
      <span className={styles.rowIcon}>
        <Icon name={icon} size={14} />
      </span>
      <div>{children}</div>
    </div>
  );

  if (event) {
    const calendar = byId.get(event.calendarId);
    const when =
      event.time.kind === "timed"
        ? `${formatShortDate(toIsoDate(event.time.start))} · ${formatTimeRange(event.time.start, event.time.end, false)}`
        : event.time.first === event.time.last
          ? `${formatShortDate(event.time.first)} · All day`
          : `${formatShortDate(event.time.first)} – ${formatShortDate(event.time.last)}`;
    return (
      <div className={styles.pane}>
        <div className={styles.head}>
          <span className={styles.swatch} style={colorVars(calendar?.color ?? "#8e8e93")} />
          <h2 className={styles.title}>{event.title}</h2>
        </div>
        <div className={styles.rows}>
          <Row icon="clock">{when}</Row>
          {calendar && (
            <Row icon="calendar">
              <Chip color={calendar.color}>{calendar.title}</Chip>
              {event.readOnly && <span className={styles.tag}> · read-only</span>}
            </Row>
          )}
          {event.isRecurring && (
            <Row icon="repeat">
              <span className={styles.muted}>Repeats</span>
            </Row>
          )}
          {event.location && <Row icon="location">{event.location}</Row>}
          {event.url && (
            <Row icon="link">
              <a className={styles.link} href={event.url} onClick={(e) => (e.preventDefault(), void openExternal(event.url!))}>
                {event.url}
              </a>
            </Row>
          )}
          {event.notes && (
            <Row icon="notes">
              <div className={styles.notes}>{event.notes}</div>
            </Row>
          )}
        </div>
        {!event.readOnly && (
          <div className={styles.actions}>
            <button type="button" className={styles.btn} onClick={() => openEditor({ kind: "event", mode: "edit", event, draft: event })}>
              Edit
            </button>
            <button type="button" className={[styles.btn, styles.danger].join(" ")} onClick={() => void deleteEvent(event.id)}>
              <Icon name="trash" size={13} /> Delete
            </button>
          </div>
        )}
      </div>
    );
  }

  if (reminder) {
    const list = byId.get(reminder.listId);
    const done = reminder.completedAt !== null;
    return (
      <div className={styles.pane}>
        <div className={styles.head}>
          <Checkbox round checked={done} label={done ? "Reopen" : "Complete"} onChange={() => void toggleReminder(reminder.id)} />
          <h2 className={styles.title} data-done={done}>
            {reminder.title}
          </h2>
        </div>
        <div className={styles.rows}>
          {reminder.due && (
            <Row icon="calendar">
              {formatRelativeDay(reminder.due.date, today)}
              {reminder.due.time ? ` · ${formatClock(reminder.due.time)}` : ""}
            </Row>
          )}
          {list && (
            <Row icon="list">
              <Chip color={list.color}>{list.title}</Chip>
            </Row>
          )}
          {reminder.priority !== "none" && (
            <Row icon="flag">
              <span style={{ textTransform: "capitalize" }}>{reminder.priority} priority</span>
            </Row>
          )}
          {reminder.isRecurring && (
            <Row icon="repeat">
              <span className={styles.muted}>Repeats</span>
            </Row>
          )}
          {reminder.url && (
            <Row icon="link">
              <a className={styles.link} href={reminder.url} onClick={(e) => (e.preventDefault(), void openExternal(reminder.url!))}>
                {reminder.url}
              </a>
            </Row>
          )}
          {reminder.notes && (
            <Row icon="notes">
              <div className={styles.notes}>{reminder.notes}</div>
            </Row>
          )}
          {done && reminder.completedAt && (
            <Row icon="check">
              <span className={styles.muted}>Completed {formatRelativeDay(toIsoDate(reminder.completedAt), today)}</span>
            </Row>
          )}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.btn} onClick={() => openEditor({ kind: "reminder", mode: "edit", reminder, draft: reminder })}>
            Edit
          </button>
          <button type="button" className={[styles.btn, styles.danger].join(" ")} onClick={() => void deleteReminder(reminder.id)}>
            <Icon name="trash" size={13} /> Delete
          </button>
        </div>
      </div>
    );
  }
  return null;
}
