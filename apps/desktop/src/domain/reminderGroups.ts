/**
 * How reminders are bucketed in the tasks panel.
 */
import { isCompleted, type Priority, type Reminder, type IsoDate } from "./model";
import { clockMinutes, compareIsoDate } from "./time";

export type ReminderGroupKey = "overdue" | "today" | "upcoming" | "noDate" | "completed";

export interface ReminderGroup {
  key: ReminderGroupKey;
  title: string;
  reminders: Reminder[];
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2, none: 3 };

export function groupKeyFor(reminder: Reminder, today: IsoDate): ReminderGroupKey {
  if (isCompleted(reminder)) return "completed";
  if (!reminder.due) return "noDate";
  const cmp = compareIsoDate(reminder.due.date, today);
  if (cmp < 0) return "overdue";
  if (cmp === 0) return "today";
  return "upcoming";
}

/** Due date, then due time (timed before untimed on the same day), then priority, then title. */
export function compareReminders(a: Reminder, b: Reminder): number {
  if (a.due && b.due) {
    const byDate = compareIsoDate(a.due.date, b.due.date);
    if (byDate !== 0) return byDate;
    if (a.due.time && b.due.time) {
      const byTime = clockMinutes(a.due.time) - clockMinutes(b.due.time);
      if (byTime !== 0) return byTime;
    } else if (a.due.time !== b.due.time) {
      return a.due.time ? -1 : 1;
    }
  } else if (Boolean(a.due) !== Boolean(b.due)) {
    return a.due ? -1 : 1;
  }
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  return a.title.localeCompare(b.title);
}

const GROUP_ORDER: ReminderGroupKey[] = ["overdue", "today", "upcoming", "noDate", "completed"];
const GROUP_TITLES: Record<ReminderGroupKey, string> = {
  overdue: "Overdue",
  today: "Today",
  upcoming: "Upcoming",
  noDate: "No date",
  completed: "Completed",
};

/** Groups in display order; empty groups are omitted except Today, which is always shown. */
export function groupReminders(reminders: Reminder[], today: IsoDate): ReminderGroup[] {
  const buckets = new Map<ReminderGroupKey, Reminder[]>(GROUP_ORDER.map((k) => [k, []]));
  for (const r of reminders) buckets.get(groupKeyFor(r, today))!.push(r);
  return GROUP_ORDER.map((key) => {
    const list = buckets.get(key)!;
    if (key === "completed") {
      list.sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
    } else {
      list.sort(compareReminders);
    }
    return { key, title: GROUP_TITLES[key], reminders: list };
  }).filter((g) => g.key === "today" || g.reminders.length > 0);
}

/** Reminders due on a given day with a clock time, for optional display in the grid. */
export function timedRemindersOn(reminders: Reminder[], day: IsoDate): Reminder[] {
  return reminders
    .filter((r) => r.due?.date === day && r.due.time !== null)
    .sort(compareReminders);
}
