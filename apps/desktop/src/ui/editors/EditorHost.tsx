import { useRef } from "react";
import { useApp } from "@/application/context";
import { Modal } from "../common/Modal";
import { Segmented } from "../common/Segmented";
import { EventEditor } from "./EventEditor";
import { ReminderEditor } from "./ReminderEditor";
import styles from "./EditorHost.module.css";

/**
 * The single editing dialog. In create mode it carries a switch between an
 * event (blocks time) and a task (something to do); the title typed so far
 * survives the switch.
 */
export function EditorHost() {
  const editor = useApp((s) => s.editor);
  const closeEditor = useApp((s) => s.closeEditor);
  const openCreate = useApp((s) => s.openCreate);
  const typedTitle = useRef("");
  if (!editor) return null;

  const creating = editor.mode === "create";
  const title = creating ? (editor.kind === "event" ? "New event" : "New task") : editor.kind === "event" ? "Edit event" : "Edit task";

  return (
    <Modal title={title} onClose={closeEditor}>
      {creating && (
        <div className={styles.kindSwitch}>
          <Segmented
            value={editor.kind}
            options={[
              { value: "event", label: "Event" },
              { value: "reminder", label: "Task" },
            ]}
            onChange={(kind) => openCreate(kind, typedTitle.current || editor.draft.title)}
            stretch
            ariaLabel="What to add"
          />
        </div>
      )}
      {editor.kind === "event" ? (
        <EventEditor key={editor.mode === "edit" ? editor.event.id : "new"} mode={editor.mode} event={editor.mode === "edit" ? editor.event : undefined} draft={editor.draft} onTitleChange={(t) => (typedTitle.current = t)} />
      ) : (
        <ReminderEditor key={editor.mode === "edit" ? editor.reminder.id : "new"} mode={editor.mode} reminder={editor.mode === "edit" ? editor.reminder : undefined} draft={editor.draft} onTitleChange={(t) => (typedTitle.current = t)} />
      )}
    </Modal>
  );
}
