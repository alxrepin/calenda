//! Tauri commands. Each one hops to a blocking thread because providers may
//! block (EventKit serialises work on its own thread; a network provider
//! would wait on I/O).

use std::sync::Arc;

use calenda_app::AgendaService;
use calenda_domain::{CalendarId, Event, EventDraft, EventId, ReminderDraft, ReminderId, TimeRange};
use chrono::{Duration, Utc};
use tauri::State;

use crate::dto::{
    self, CommandError, CommandResult, EventDraftDto, EventDto, PreferencesDto, RecurrenceScopeDto,
    ReminderDraftDto, ReminderDto, SearchResultsDto, WorkspaceDto,
};
use crate::AppState;

/// Runs `f` off the async runtime's threads and maps errors to the wire type.
async fn blocking<T, F>(state: &State<'_, AppState>, f: F) -> CommandResult<T>
where
    T: Send + 'static,
    F: FnOnce(Arc<AgendaService>) -> Result<T, CommandError> + Send + 'static,
{
    let service = Arc::clone(&state.service);
    tauri::async_runtime::spawn_blocking(move || f(service))
        .await
        .map_err(|e| CommandError { kind: "shell", message: e.to_string() })?
}

#[tauri::command]
pub async fn load_workspace(state: State<'_, AppState>) -> CommandResult<WorkspaceDto> {
    blocking(&state, |s| Ok(WorkspaceDto::new(s.provider_name(), s.workspace()?))).await
}

#[tauri::command]
pub async fn set_calendar_visible(
    state: State<'_, AppState>,
    calendar_id: String,
    visible: bool,
) -> CommandResult<PreferencesDto> {
    blocking(&state, move |s| Ok(s.set_calendar_visible(&CalendarId::new(calendar_id), visible)?.into())).await
}

#[tauri::command]
pub async fn set_show_reminders_in_grid(state: State<'_, AppState>, show: bool) -> CommandResult<PreferencesDto> {
    blocking(&state, move |s| Ok(s.set_show_reminders_in_grid(show)?.into())).await
}

#[tauri::command]
pub async fn list_events(state: State<'_, AppState>, start: String, end: String) -> CommandResult<Vec<EventDto>> {
    blocking(&state, move |s| {
        let range = TimeRange::new(dto::parse_instant(&start)?, dto::parse_instant(&end)?)?;
        Ok(s.events(range)?.into_iter().map(Into::into).collect())
    })
    .await
}

#[tauri::command]
pub async fn create_event(state: State<'_, AppState>, draft: EventDraftDto) -> CommandResult<EventDto> {
    blocking(&state, move |s| Ok(s.create_event(EventDraft::try_from(draft)?)?.into())).await
}

#[tauri::command]
pub async fn update_event(
    state: State<'_, AppState>,
    id: String,
    draft: EventDraftDto,
    scope: RecurrenceScopeDto,
) -> CommandResult<EventDto> {
    blocking(&state, move |s| {
        Ok(s.update_event(&EventId::new(id), EventDraft::try_from(draft)?, scope.into())?.into())
    })
    .await
}

#[tauri::command]
pub async fn delete_event(state: State<'_, AppState>, id: String, scope: RecurrenceScopeDto) -> CommandResult<()> {
    blocking(&state, move |s| Ok(s.delete_event(&EventId::new(id), scope.into())?)).await
}

#[tauri::command]
pub async fn move_event(
    state: State<'_, AppState>,
    event: EventDto,
    new_start: String,
    new_day: String,
) -> CommandResult<EventDto> {
    blocking(&state, move |s| {
        let event = Event::try_from(event)?;
        Ok(s.move_event(&event, dto::parse_instant(&new_start)?, dto::parse_date(&new_day)?)?.into())
    })
    .await
}

#[tauri::command]
pub async fn list_reminders(state: State<'_, AppState>, completed_window_hours: Option<i64>) -> CommandResult<Vec<ReminderDto>> {
    blocking(&state, move |s| {
        let window = Duration::hours(completed_window_hours.unwrap_or(24));
        Ok(s.reminders(Utc::now(), window)?.into_iter().map(Into::into).collect())
    })
    .await
}

#[tauri::command]
pub async fn create_reminder(state: State<'_, AppState>, draft: ReminderDraftDto) -> CommandResult<ReminderDto> {
    blocking(&state, move |s| Ok(s.create_reminder(ReminderDraft::try_from(draft)?)?.into())).await
}

#[tauri::command]
pub async fn update_reminder(state: State<'_, AppState>, id: String, draft: ReminderDraftDto) -> CommandResult<ReminderDto> {
    blocking(&state, move |s| Ok(s.update_reminder(&ReminderId::new(id), ReminderDraft::try_from(draft)?)?.into())).await
}

#[tauri::command]
pub async fn set_reminder_completed(state: State<'_, AppState>, id: String, completed: bool) -> CommandResult<ReminderDto> {
    blocking(&state, move |s| Ok(s.set_reminder_completed(&ReminderId::new(id), completed)?.into())).await
}

#[tauri::command]
pub async fn delete_reminder(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    blocking(&state, move |s| Ok(s.delete_reminder(&ReminderId::new(id))?)).await
}

#[tauri::command]
pub async fn search(state: State<'_, AppState>, text: String) -> CommandResult<SearchResultsDto> {
    blocking(&state, move |s| Ok(s.search(&text, Utc::now())?.into())).await
}
