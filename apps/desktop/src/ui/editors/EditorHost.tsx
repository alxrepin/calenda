import { useApp } from "@/application/context";
import { EventEditor } from "./EventEditor";
import { ReminderEditor } from "./ReminderEditor";

/** Renders whichever editor the store says is open. */
export function EditorHost() {
  const editor = useApp((s) => s.editor);
  if (!editor) return null;
  if (editor.kind === "event") {
    // Keyed so switching between records resets local form state.
    return <EventEditor key={editor.mode === "edit" ? editor.event.id : "new"} mode={editor.mode} event={editor.mode === "edit" ? editor.event : undefined} draft={editor.draft} />;
  }
  return <ReminderEditor key={editor.mode === "edit" ? editor.reminder.id : "new"} mode={editor.mode} reminder={editor.mode === "edit" ? editor.reminder : undefined} draft={editor.draft} />;
}
