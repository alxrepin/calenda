import { useMemo, useState, type FormEvent } from "react";
import { useApp } from "@/application/context";
import { selectCalendars, selectDefaultEventCalendar } from "@/application/selectors";
import type { CalendarEvent, EventDraft } from "@/domain/model";
import { addDays, atClockTime, toClockTime, toIsoDate } from "@/domain/time";
import { Icon } from "../common/Icon";
import fields from "../common/fields.module.css";

interface EventEditorProps {
  mode: "create" | "edit";
  event?: CalendarEvent;
  draft: EventDraft;
  /** Lets the host keep the typed title when switching between event and task. */
  onTitleChange?: (title: string) => void;
}

interface FormState {
  calendarId: string;
  title: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  notes: string;
  url: string;
}

function fromDraft(draft: EventDraft, fallbackCalendar: string, today: string): FormState {
  const base = {
    calendarId: draft.calendarId || fallbackCalendar,
    title: draft.title,
    location: draft.location ?? "",
    notes: draft.notes ?? "",
    url: draft.url ?? "",
  };
  if (draft.time.kind === "timed") {
    return {
      ...base,
      allDay: false,
      startDate: toIsoDate(draft.time.start),
      startTime: toClockTime(draft.time.start),
      endDate: toIsoDate(draft.time.end),
      endTime: toClockTime(draft.time.end),
    };
  }
  const first = draft.time.first || today;
  const last = draft.time.last || first;
  return { ...base, allDay: true, startDate: first, startTime: "09:00", endDate: last, endTime: "10:00" };
}

function toDraft(form: FormState): EventDraft | string {
  if (!form.title.trim()) return "Give the event a title.";
  if (!form.calendarId) return "Pick a calendar.";
  const common = { calendarId: form.calendarId, title: form.title, location: form.location, notes: form.notes, url: form.url };
  if (form.allDay) {
    if (form.endDate < form.startDate) return "The event cannot end before it starts.";
    return { ...common, time: { kind: "allDay", first: form.startDate, last: form.endDate } };
  }
  const start = atClockTime(form.startDate, form.startTime);
  const end = atClockTime(form.endDate, form.endTime);
  if (end <= start) return "The event cannot end before it starts.";
  return { ...common, time: { kind: "timed", start, end } };
}

export function EventEditor({ mode, event, draft, onTitleChange }: EventEditorProps) {
  const calendars = useApp(selectCalendars);
  const defaultCalendar = useApp(selectDefaultEventCalendar);
  const today = useApp((s) => s.today);
  const closeEditor = useApp((s) => s.closeEditor);
  const createEvent = useApp((s) => s.createEvent);
  const updateEvent = useApp((s) => s.updateEvent);
  const deleteEvent = useApp((s) => s.deleteEvent);
  const writable = useMemo(() => calendars.filter((c) => c.kind === "events" && !c.readOnly), [calendars]);
  const [form, setForm] = useState<FormState>(() => fromDraft(draft, defaultCalendar?.id ?? "", today));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const onStartDate = (value: string) => {
    // Keep the end on or after the start, preserving the day distance.
    const span = Math.max(0, Math.round((new Date(form.endDate).getTime() - new Date(form.startDate).getTime()) / 86_400_000));
    setForm((f) => ({ ...f, startDate: value, endDate: addDays(value, span) }));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = toDraft(form);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setBusy(true);
    const saved = mode === "edit" && event ? await updateEvent(event.id, result, "thisOccurrence") : await createEvent(result);
    setBusy(false);
    if (!saved) setError("Could not save. See the message in the corner.");
  };

  const calendar = writable.find((c) => c.id === form.calendarId);

  return (
      <form className={fields.form} onSubmit={submit}>
        <input className={fields.titleInput} placeholder="New event" value={form.title} onChange={(e) => { set("title", e.target.value); onTitleChange?.(e.target.value); }} autoFocus aria-label="Title" />

        <div className={fields.row}>
          <span className={fields.label}>
            <Icon name="calendar" size={13} /> Calendar
          </span>
          <div className={fields.control}>
            <span className={fields.swatch} style={{ background: calendar?.color ?? "#8e8e93" }} />
            <select className={fields.select} value={form.calendarId} onChange={(e) => set("calendarId", e.target.value)} aria-label="Calendar">
              {writable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={fields.row}>
          <span className={fields.label}>
            <Icon name="clock" size={13} /> Starts
          </span>
          <div className={fields.control}>
            <input type="date" className={fields.input} value={form.startDate} onChange={(e) => onStartDate(e.target.value)} aria-label="Start date" required />
            {!form.allDay && <input type="time" className={fields.input} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} aria-label="Start time" required />}
            <label className={fields.toggle}>
              <input type="checkbox" checked={form.allDay} onChange={(e) => set("allDay", e.target.checked)} /> All-day
            </label>
          </div>
        </div>

        <div className={fields.row}>
          <span className={fields.label}>Ends</span>
          <div className={fields.control}>
            <input type="date" className={fields.input} value={form.endDate} min={form.startDate} onChange={(e) => set("endDate", e.target.value)} aria-label="End date" required />
            {!form.allDay && <input type="time" className={fields.input} value={form.endTime} onChange={(e) => set("endTime", e.target.value)} aria-label="End time" required />}
          </div>
        </div>

        <div className={fields.row}>
          <span className={fields.label}>
            <Icon name="location" size={13} /> Location
          </span>
          <input className={fields.input} value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Add a location" aria-label="Location" />
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

        {event?.isRecurring && <div className={fields.toggle}>Changes apply to this occurrence only.</div>}
        {error && <div style={{ color: "var(--danger)", fontSize: "var(--fs-sm)" }}>{error}</div>}

        <div className={fields.footer}>
          {mode === "edit" && event && (
            <button type="button" className={[fields.btn, fields.danger].join(" ")} onClick={() => void deleteEvent(event.id)}>
              Delete
            </button>
          )}
          <span className={fields.spacer} />
          <button type="button" className={fields.btn} onClick={closeEditor}>
            Cancel
          </button>
          <button type="submit" className={[fields.btn, fields.primary].join(" ")} disabled={busy}>
            {mode === "edit" ? "Save" : "Add event"}
          </button>
        </div>
      </form>
  );
}
