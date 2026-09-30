//! Drives the real command handlers through Tauri's IPC test harness with the
//! mock provider, so the wire format is checked end to end without a webview.

use std::sync::Arc;

use calenda_app::{AgendaService, InMemoryPreferences};
use calenda_desktop_lib::AppState;
use calenda_provider_mock::MockProvider;
use serde_json::{json, Value};
use tauri::test::{get_ipc_response, mock_builder, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

struct Harness {
    _app: tauri::App<tauri::test::MockRuntime>,
    webview: WebviewWindow<tauri::test::MockRuntime>,
}

/// A real app context (config + capabilities) on the mock runtime, so the
/// ACL is exercised exactly as in production.
fn app() -> Harness {
    let anchor = chrono::NaiveDate::from_ymd_opt(2026, 9, 30).unwrap();
    let provider = Arc::new(MockProvider::seeded(anchor));
    let service = Arc::new(AgendaService::new(
        provider,
        Arc::new(InMemoryPreferences::default()),
    ));
    let subscription = service.subscribe(Box::new(|| {}));
    let app = mock_builder()
        .invoke_handler(calenda_desktop_lib::command_handler())
        .build(tauri::generate_context!())
        .expect("build mock app");
    app.manage(AppState::new(service, subscription));
    let webview = WebviewWindowBuilder::new(&app, "main", WebviewUrl::default())
        .build()
        .expect("webview");
    Harness { _app: app, webview }
}

fn invoke(h: &Harness, cmd: &str, body: Value) -> Result<Value, Value> {
    get_ipc_response(
        &h.webview,
        InvokeRequest {
            cmd: cmd.into(),
            callback: tauri::ipc::CallbackFn(0),
            error: tauri::ipc::CallbackFn(1),
            // The custom-protocol origin counts as local content, exactly like the real webview.
            url: "tauri://localhost".parse().unwrap(),
            body: tauri::ipc::InvokeBody::Json(body),
            headers: Default::default(),
            invoke_key: INVOKE_KEY.to_string(),
        },
    )
    .map(|r| r.deserialize::<Value>().unwrap())
}

#[test]
fn workspace_and_events_round_trip_over_ipc() {
    let app = app();

    let ws = invoke(&app, "load_workspace", json!({})).unwrap();
    assert_eq!(ws["eventAccess"], "full");
    assert_eq!(ws["providerName"], "Mock");
    let calendars = ws["calendars"].as_array().unwrap();
    assert!(calendars.iter().any(|c| c["kind"] == "events"));
    assert!(calendars.iter().any(|c| c["kind"] == "reminders"));
    assert!(calendars
        .iter()
        .all(|c| c["color"].as_str().unwrap().starts_with('#')));

    let events = invoke(
        &app,
        "list_events",
        json!({ "start": "2026-09-28T00:00:00Z", "end": "2026-10-05T00:00:00Z" }),
    )
    .unwrap();
    let events = events.as_array().unwrap();
    assert!(events.len() >= 12, "got {} events", events.len());
    let vacation = events.iter().find(|e| e["id"] == "evt-vacation").unwrap();
    assert_eq!(vacation["time"]["kind"], "allDay");
    assert_eq!(vacation["time"]["first"], "2026-09-28");
    let timed = events
        .iter()
        .find(|e| e["time"]["kind"] == "timed")
        .unwrap();
    assert!(timed["time"]["start"].as_str().unwrap().ends_with('Z'));
}

#[test]
fn reminders_can_be_created_completed_and_deleted() {
    let app = app();
    let ws = invoke(&app, "load_workspace", json!({})).unwrap();
    let list = ws["calendars"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["kind"] == "reminders")
        .unwrap();
    let list_id = list["id"].as_str().unwrap();

    let created = invoke(
        &app,
        "create_reminder",
        json!({ "draft": { "listId": list_id, "title": "  Water plants ", "due": { "date": "2026-10-01", "time": "18:30" }, "priority": "high" } }),
    )
    .unwrap();
    assert_eq!(created["title"], "Water plants");
    assert_eq!(created["due"]["time"], "18:30");
    assert_eq!(created["priority"], "high");
    assert!(created["completedAt"].is_null());
    let id = created["id"].as_str().unwrap();

    let done = invoke(
        &app,
        "set_reminder_completed",
        json!({ "id": id, "completed": true }),
    )
    .unwrap();
    assert!(done["completedAt"].is_string());

    let listed = invoke(
        &app,
        "list_reminders",
        json!({ "completedWindowHours": 24 }),
    )
    .unwrap();
    assert!(listed.as_array().unwrap().iter().any(|r| r["id"] == id));

    invoke(&app, "delete_reminder", json!({ "id": id })).unwrap();
    let listed = invoke(&app, "list_reminders", json!({})).unwrap();
    assert!(!listed.as_array().unwrap().iter().any(|r| r["id"] == id));
}

#[test]
fn errors_are_structured() {
    let app = app();
    let ws = invoke(&app, "load_workspace", json!({})).unwrap();
    let ro = ws["calendars"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["readOnly"] == true)
        .unwrap();
    let err = invoke(
        &app,
        "create_event",
        json!({ "draft": { "calendarId": ro["id"], "title": "Nope", "time": { "kind": "allDay", "first": "2026-09-30", "last": "2026-09-30" } } }),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "readOnly");

    let err = invoke(
        &app,
        "create_event",
        json!({ "draft": { "calendarId": "cal-personal", "title": "Bad", "time": { "kind": "timed", "start": "2026-09-30T11:00:00Z", "end": "2026-09-30T10:00:00Z" } } }),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "invalid");

    let err = invoke(
        &app,
        "delete_event",
        json!({ "id": "missing", "scope": "thisOccurrence" }),
    )
    .unwrap_err();
    assert_eq!(err["kind"], "notFound");
}

#[test]
fn move_event_keeps_duration_and_hides_toggled_calendars() {
    let app = app();
    let events = invoke(
        &app,
        "list_events",
        json!({ "start": "2026-09-28T00:00:00Z", "end": "2026-10-05T00:00:00Z" }),
    )
    .unwrap();
    let event = events
        .as_array()
        .unwrap()
        .iter()
        .find(|e| e["title"] == "Team sync")
        .unwrap()
        .clone();

    let moved = invoke(
        &app,
        "move_event",
        json!({ "event": event, "newStart": "2026-10-01T13:00:00Z", "newDay": "2026-10-01" }),
    )
    .unwrap();
    assert_eq!(moved["time"]["start"], "2026-10-01T13:00:00Z");
    assert_eq!(moved["time"]["end"], "2026-10-01T14:00:00Z");

    let prefs = invoke(
        &app,
        "set_calendar_visible",
        json!({ "calendarId": event["calendarId"], "visible": false }),
    )
    .unwrap();
    assert!(prefs["hiddenCalendars"]
        .as_array()
        .unwrap()
        .contains(&event["calendarId"]));
    let events = invoke(
        &app,
        "list_events",
        json!({ "start": "2026-09-28T00:00:00Z", "end": "2026-10-05T00:00:00Z" }),
    )
    .unwrap();
    assert!(events
        .as_array()
        .unwrap()
        .iter()
        .all(|e| e["calendarId"] != event["calendarId"]));

    let results = invoke(&app, "search", json!({ "text": "berlin" })).unwrap();
    assert!(results["reminders"]
        .as_array()
        .unwrap()
        .iter()
        .any(|r| r["title"] == "Book flight to Berlin"));
}
