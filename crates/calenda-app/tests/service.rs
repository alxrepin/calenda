use std::sync::Arc;

use calenda_app::{AgendaService, InMemoryPreferences};
use calenda_domain::{
    CalendarKind, DateSpan, DomainError, EventDraft, EventTime, RecurrenceScope, TimeRange,
};
use calenda_provider_mock::MockProvider;
use chrono::{Duration, Local, NaiveDate, TimeZone, Utc};

fn anchor() -> NaiveDate {
    NaiveDate::from_ymd_opt(2026, 9, 30).unwrap()
}

fn service() -> (AgendaService, Arc<MockProvider>) {
    let provider = Arc::new(MockProvider::seeded(anchor()));
    let service = AgendaService::new(provider.clone(), Arc::new(InMemoryPreferences::default()));
    (service, provider)
}

fn week_range() -> TimeRange {
    let start = Local.from_local_datetime(&anchor().pred_opt().unwrap().pred_opt().unwrap().and_hms_opt(0, 0, 0).unwrap()).unwrap();
    TimeRange::new(start.with_timezone(&Utc), (start + Duration::days(7)).with_timezone(&Utc)).unwrap()
}

#[test]
fn workspace_reports_full_access_and_calendars() {
    let (service, _) = service();
    let ws = service.workspace().unwrap();
    assert!(ws.event_access.can_read());
    assert!(ws.reminder_access.can_read());
    assert!(ws.calendars.len() > 5);
    assert_eq!(ws.visible_calendars().count(), ws.calendars.len());
}

#[test]
fn hiding_a_calendar_filters_its_events() {
    let (service, _) = service();
    let before = service.events(week_range()).unwrap();
    let work = service
        .workspace()
        .unwrap()
        .calendars
        .into_iter()
        .find(|c| c.title == "Work" && c.kind == CalendarKind::Events)
        .unwrap();
    let work_events = before.iter().filter(|e| e.calendar_id == work.id).count();
    assert!(work_events > 0);

    let prefs = service.set_calendar_visible(&work.id, false).unwrap();
    assert!(prefs.hidden_calendars.contains(&work.id));

    let after = service.events(week_range()).unwrap();
    assert_eq!(after.len(), before.len() - work_events);
    assert!(after.iter().all(|e| e.calendar_id != work.id));

    let ws = service.workspace().unwrap();
    assert_eq!(ws.visible_calendars().count(), ws.calendars.len() - 1);
}

#[test]
fn move_event_keeps_duration() {
    let (service, _) = service();
    let event = service
        .events(week_range())
        .unwrap()
        .into_iter()
        .find(|e| e.title == "Team sync")
        .unwrap();
    let EventTime::Timed(original) = &event.time else { panic!("timed") };
    let new_start = original.start() + Duration::days(1) + Duration::hours(3);
    let moved = service.move_event(&event, new_start, anchor()).unwrap();
    let EventTime::Timed(after) = &moved.time else { panic!("timed") };
    assert_eq!(after.start(), new_start);
    assert_eq!(after.duration(), original.duration());
}

#[test]
fn read_only_calendars_are_guarded_before_reaching_the_provider() {
    let (service, _) = service();
    let birthdays = service
        .workspace()
        .unwrap()
        .calendars
        .into_iter()
        .find(|c| c.read_only)
        .unwrap();
    let err = service
        .create_event(EventDraft {
            calendar_id: birthdays.id,
            title: "x".into(),
            time: EventTime::AllDay(DateSpan::single(anchor())),
            location: None,
            notes: None,
            url: None,
        })
        .unwrap_err();
    assert_eq!(err, DomainError::ReadOnly { entity: "calendar" });
}

#[test]
fn blank_titles_are_rejected() {
    let (service, _) = service();
    let personal = service
        .workspace()
        .unwrap()
        .calendars
        .into_iter()
        .find(|c| c.title == "Personal" && c.kind == CalendarKind::Events)
        .unwrap();
    let err = service
        .update_event(
            &"evt-1".into(),
            EventDraft {
                calendar_id: personal.id,
                title: "   ".into(),
                time: EventTime::AllDay(DateSpan::single(anchor())),
                location: None,
                notes: None,
                url: None,
            },
            RecurrenceScope::ThisOccurrence,
        )
        .unwrap_err();
    assert!(matches!(err, DomainError::Invalid(_)));
}

#[test]
fn search_spans_events_and_reminders() {
    let (service, _) = service();
    let now = Local.from_local_datetime(&anchor().and_hms_opt(12, 0, 0).unwrap()).unwrap().with_timezone(&Utc);
    let results = service.search("client", now).unwrap();
    assert!(results.events.iter().any(|e| e.title == "Call with client"));
    assert!(results.reminders.iter().any(|r| r.title == "Call with client"));
    assert!(service.search("   ", now).unwrap().events.is_empty());
}

#[test]
fn reminders_exclude_stale_completed_items_and_hidden_lists() {
    let (service, _) = service();
    let now = Utc::now();
    let all = service.reminders(now, Duration::days(1)).unwrap();
    assert!(all.iter().any(|r| r.is_completed()));
    let work_list = service
        .workspace()
        .unwrap()
        .calendars
        .into_iter()
        .find(|c| c.title == "Work" && c.kind == CalendarKind::Reminders)
        .unwrap();
    service.set_calendar_visible(&work_list.id, false).unwrap();
    let filtered = service.reminders(now, Duration::days(1)).unwrap();
    assert!(filtered.iter().all(|r| r.list_id != work_list.id));
    assert!(filtered.len() < all.len());
}
