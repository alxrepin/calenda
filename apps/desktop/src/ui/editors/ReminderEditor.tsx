import { useMemo, useState, type FormEvent } from "react";
import { useApp } from "@/application/context";
import { selectCalendars, selectDefaultReminderList } from "@/application/selectors";
import type { Priority, Reminder, ReminderDraft } from "@/domain/model";
import { Icon } from "../common/Icon";
import fields from "../common/fields.module.css";

interface ReminderEditorProps {
  mode: "create" | "edit";
  reminder?: Reminder;
  draft: ReminderDraft;
  onTitleChange?: (title: string) => void;
}

interface FormState {
  listId: string;
  title: string;
  hasDate: boolean;
  date: string;
  hasTime: boolean;
  time: string;
  priority: Priority;
  notes: string;
  url: string;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export function ReminderEditor({ mode, reminder, draft, onTitleChange }: ReminderEditorProps) {
  const calendars = useApp(selectCalendars);
  const defaultList = useApp(selectDefaultReminderList);
  const today = useApp((s) => s.today);
  const closeEditor = useApp((s) => s.closeEditor);
  const createReminder = useApp((s) => s.createReminder);
  const updateReminder = useApp((s) => s.updateReminder);
  const deleteReminder = useApp((s) => s.deleteReminder);
  const lists = useMemo(() => calendars.filter((c) => c.kind === "reminders" && !c.readOnly), [calendars]);
  const [form, setForm] = useState<FormState>(() => ({
    listId: draft.listId || defaultList?.id || "",
    title: draft.title,
    hasDate: !!draft.due,
    date: draft.due?.date ?? today,
    hasTime: !!draft.due?.time,
    time: draft.due?.time ?? "09:00",
    priority: draft.priority ?? "none",
    notes: draft.notes ?? "",
    url: draft.url ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return setError("Give the task a title.");
    if (!form.listId) return setError("Pick a list.");
    const out: ReminderDraft = {
      listId: form.listId,
      title: form.title,
      notes: form.notes,
      url: form.url,
      priority: form.priority,
      due: form.hasDate ? { date: form.date, time: form.hasTime ? form.time : null } : null,
    };
    setBusy(true);
    const saved = mode === "edit" && reminder ? await updateReminder(reminder.id, out) : await createReminder(out);
    setBusy(false);
    if (!saved) setError("Could not save. See the message in the corner.");
  };

  const list = lists.find((c) => c.id === form.listId);

  return (
      <form className={fields.form} onSubmit={submit}>
        <input className={fields.titleInput} placeholder="New task" value={form.title} onChange={(e) => { set("title", e.target.value); onTitleChange?.(e.target.value); }} autoFocus aria-label="Title" />

        <div className={fields.row}>
          <span className={fields.label}>
            <Icon name="list" size={13} /> List
          </span>
          <div className={fields.control}>
            <span className={fields.swatch} style={{ background: list?.color ?? "#8e8e93" }} />
            <select className={fields.select} value={form.listId} onChange={(e) => set("listId", e.target.value)} aria-label="List">
              {lists.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={fields.row}>
          <span className={fields.label}>
            <Icon name="calendar" size={13} /> Due
          </span>
          <div className={fields.control}>
            <label className={fields.toggle}>
              <input type="checkbox" checked={form.hasDate} onChange={(e) => set("hasDate", e.target.checked)} /> Date
            </label>
            {form.hasDate && <input type="date" className={fields.input} value={form.date} onChange={(e) => set("date", e.target.value)} aria-label="Due date" />}
            {form.hasDate && (
              <label className={fields.toggle}>
                <input type="checkbox" checked={form.hasTime} onChange={(e) => set("hasTime", e.target.checked)} /> Time
              </label>
            )}
            {form.hasDate && form.hasTime && <input type="time" className={fields.input} value={form.time} onChange={(e) => set("time", e.target.value)} aria-label="Due time" />}
          </div>
        </div>

        <div className={fields.row}>
          <span className={fields.label}>
            <Icon name="flag" size={13} /> Priority
          </span>
          <div className={fields.priorityGroup} role="group" aria-label="Priority">
            {PRIORITIES.map((p) => (
              <button key={p.value} type="button" className={fields.priorityBtn} aria-pressed={form.priority === p.value} onClick={() => set("priority", p.value)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className={fields.row}>
          <span className={fields.label}>
            <Icon name="link" size={13} /> URL
          </span>
          <input className={fields.input} value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" aria-label="URL" inputMode="url" />
        </div>

        <div className={fields.row}>
          <span className={fields.label}>
            <Icon name="notes" size={13} /> Notes
          </span>
          <textarea className={fields.textarea} value={form.notes} onChange={(e) => set("notes", e.target.value)} aria-label="Notes" />
        </div>

        {error && <div style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{error}</div>}

        <div className={fields.footer}>
          {mode === "edit" && reminder && (
            <button type="button" className={[fields.btn, fields.danger].join(" ")} onClick={() => void deleteReminder(reminder.id)}>
              Delete
            </button>
          )}
          <span className={fields.spacer} />
          <button type="button" className={fields.btn} onClick={closeEditor}>
            Cancel
          </button>
          <button type="submit" className={[fields.btn, fields.primary].join(" ")} disabled={busy}>
            {mode === "edit" ? "Save" : "Add task"}
          </button>
        </div>
      </form>
  );
}
