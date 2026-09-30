import { useMemo, useState, type FormEvent } from "react";
import { useApp } from "@/application/context";
import { selectCalendarMap, selectCalendars, selectDefaultReminderList, selectVisibleReminders } from "@/application/selectors";
import type { Reminder } from "@/domain/model";
import { groupReminders, type ReminderGroup } from "@/domain/reminderGroups";
import { formatClock, formatRelativeDay, formatShortDate } from "@/domain/time";
import { Checkbox } from "../common/Checkbox";
import { Chip } from "../common/Chip";
import { Icon } from "../common/Icon";
import { Segmented } from "../common/Segmented";
import { DetailsPane } from "./DetailsPane";
import styles from "./TasksPanel.module.css";

export function TasksPanel() {
  const tab = useApp((s) => s.rightTab);
  const setTab = useApp((s) => s.setRightTab);
  return (
    <aside className={styles.panel} aria-label="Tasks and details">
      <div className={styles.tabs}>
        <Segmented
          value={tab}
          options={[
            { value: "tasks", label: "Tasks" },
            { value: "details", label: "Details" },
          ]}
          onChange={setTab}
          stretch
          ariaLabel="Panel"
        />
      </div>
      {tab === "tasks" ? <TaskList /> : <DetailsPane />}
    </aside>
  );
}

function TaskList() {
  const reminders = useApp(selectVisibleReminders);
  const today = useApp((s) => s.today);
  const calendars = useApp(selectCalendars);
  const defaultList = useApp(selectDefaultReminderList);
  const createReminder = useApp((s) => s.createReminder);
  const showInGrid = useApp((s) => s.workspace?.preferences.showRemindersInGrid ?? false);
  const setShowInGrid = useApp((s) => s.setShowRemindersInGrid);
  const byId = useMemo(() => selectCalendarMap(calendars), [calendars]);
  const groups = useMemo(() => groupReminders(reminders, today), [reminders, today]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [quick, setQuick] = useState("");

  const submitQuick = async (e: FormEvent) => {
    e.preventDefault();
    if (!quick.trim() || !defaultList) return;
    const created = await createReminder({ listId: defaultList.id, title: quick, due: { date: today, time: null } });
    if (created) setQuick("");
  };

  return (
    <div className={styles.scroll}>
      <form className={styles.quickAdd} onSubmit={submitQuick}>
        <Icon name="plus" size={14} />
        <input
          className={styles.quickInput}
          placeholder={defaultList ? `New reminder in ${defaultList.title}…` : "No writable list"}
          value={quick}
          onChange={(e) => setQuick(e.target.value)}
          aria-label="New reminder title"
          disabled={!defaultList}
        />
      </form>
      {groups.map((g) => (
        <Group
          key={g.key}
          group={g}
          today={today}
          collapsed={!!collapsed[g.key]}
          onToggle={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
          listTitle={(id) => byId.get(id)?.title ?? ""}
          listColor={(id) => byId.get(id)?.color ?? "#8e8e93"}
        />
      ))}
      <label className={styles.option}>
        <Checkbox checked={showInGrid} label="Show timed reminders in the calendar grid" onChange={(v) => void setShowInGrid(v)} />
        Show timed reminders in the grid
      </label>
    </div>
  );
}

interface GroupProps {
  group: ReminderGroup;
  today: string;
  collapsed: boolean;
  onToggle: () => void;
  listTitle: (id: string) => string;
  listColor: (id: string) => string;
}

function Group({ group, today, collapsed, onToggle, listTitle, listColor }: GroupProps) {
  const subtitle = group.key === "today" ? formatShortDate(today) : null;
  return (
    <section className={styles.group} aria-label={group.title}>
      <button type="button" className={styles.groupHead} onClick={onToggle} aria-expanded={!collapsed}>
        <span className={styles.groupTitle} data-overdue={group.key === "overdue"}>
          {group.title}
        </span>
        <span className={styles.groupSub}>{subtitle}</span>
        <span className={styles.groupCount}>{group.reminders.length}</span>
        <span className={styles.chevron}>
          <Icon name={collapsed ? "chevronDown" : "chevronUp"} size={14} />
        </span>
      </button>
      {!collapsed && (
        <div className={styles.list}>
          {group.reminders.length === 0 && <div className={styles.empty}>Nothing due today.</div>}
          {group.reminders.map((r) => (
            <TaskRow key={r.id} reminder={r} today={today} showDate={group.key !== "today"} listTitle={listTitle(r.listId)} color={listColor(r.listId)} />
          ))}
        </div>
      )}
    </section>
  );
}

interface TaskRowProps {
  reminder: Reminder;
  today: string;
  showDate: boolean;
  listTitle: string;
  color: string;
}

function TaskRow({ reminder, today, showDate, listTitle, color }: TaskRowProps) {
  const toggle = useApp((s) => s.toggleReminder);
  const select = useApp((s) => s.select);
  const openEditor = useApp((s) => s.openEditor);
  const selected = useApp((s) => s.selection?.kind === "reminder" && s.selection.id === reminder.id);
  const done = reminder.completedAt !== null;
  const overdue = !done && !!reminder.due && reminder.due.date < today;

  return (
    <div
      className={styles.row}
      data-selected={selected}
      data-done={done}
      role="button"
      tabIndex={0}
      onClick={() => select({ kind: "reminder", id: reminder.id })}
      onDoubleClick={() => openEditor({ kind: "reminder", mode: "edit", reminder, draft: reminder })}
      onKeyDown={(e) => {
        if (e.key === "Enter") openEditor({ kind: "reminder", mode: "edit", reminder, draft: reminder });
        if (e.key === " ") {
          e.preventDefault();
          void toggle(reminder.id);
        }
      }}
    >
      <Checkbox round className={styles.check} checked={done} label={done ? `Reopen ${reminder.title}` : `Complete ${reminder.title}`} onChange={() => void toggle(reminder.id)} />
      <div className={styles.body}>
        <span className={styles.title}>{reminder.title}</span>
        <div className={styles.meta}>
          {reminder.priority !== "none" && (
            <span className={styles.flag} data-level={reminder.priority} title={`${reminder.priority} priority`}>
              <Icon name="flag" size={12} strokeWidth={2} />
            </span>
          )}
          {reminder.due && (showDate || reminder.due.time) && (
            <span className={styles.metaItem} data-overdue={overdue}>
              <Icon name={reminder.due.time && !showDate ? "clock" : "calendar"} size={12} />
              {showDate ? formatRelativeDay(reminder.due.date, today) : ""}
              {reminder.due.time ? `${showDate ? " " : ""}${formatClock(reminder.due.time)}` : ""}
            </span>
          )}
          {reminder.isRecurring && (
            <span className={styles.metaItem} title="Repeats">
              <Icon name="repeat" size={12} />
            </span>
          )}
          {listTitle && <Chip color={color}>{listTitle}</Chip>}
        </div>
      </div>
      <span className={styles.grip} aria-hidden="true">
        <Icon name="grip" size={14} />
      </span>
    </div>
  );
}
