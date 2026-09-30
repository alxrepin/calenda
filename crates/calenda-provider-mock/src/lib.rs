//! An in-memory `CalendarProvider`.
//!
//! Used when running on a platform without a native provider (development on
//! Linux, tests) and as the reference implementation of the ports' contract.

mod seed;

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, RwLock};

use calenda_domain::{
    AccessGateway, AccessStatus, Calendar, CalendarKind, CalendarProvider, CalendarStore,
    ChangeListener, ChangeNotifier, CompletionFilter, DomainError, DomainResult, Event,
    EventDraft, EventId, EventQuery, EventRepository, EventTime, RecurrenceScope, Reminder,
    ReminderDraft, ReminderId, ReminderQuery, ReminderRepository, Source, Subscription,
};
use chrono::{DateTime, Local, NaiveDate, TimeZone, Utc};

pub use seed::seed_for;

#[derive(Default)]
struct State {
    sources: Vec<Source>,
    calendars: Vec<Calendar>,
    events: BTreeMap<EventId, Event>,
    reminders: BTreeMap<ReminderId, Reminder>,
}

type Listeners = Arc<Mutex<Vec<(u64, ChangeListener)>>>;

pub struct MockProvider {
    state: RwLock<State>,
    listeners: Listeners,
    next_listener: Mutex<u64>,
    event_access: AccessStatus,
    reminder_access: AccessStatus,
}

impl MockProvider {
    pub fn empty() -> Self {
        Self {
            state: RwLock::new(State::default()),
            listeners: Arc::default(),
            next_listener: Mutex::new(0),
            event_access: AccessStatus::Full,
            reminder_access: AccessStatus::Full,
        }
    }

    /// A provider pre-filled with data resembling a real week around `anchor`.
    pub fn seeded(anchor: NaiveDate) -> Self {
        let provider = Self::empty();
        seed::seed_for(&provider, anchor);
        provider
    }

    pub fn with_sources_and_calendars(self, sources: Vec<Source>, calendars: Vec<Calendar>) -> Self {
        {
            let mut state = self.state.write().unwrap();
            state.sources = sources;
            state.calendars = calendars;
        }
        self
    }

    pub fn insert_event(&self, event: Event) {
        self.state.write().unwrap().events.insert(event.id.clone(), event);
    }

    pub fn insert_reminder(&self, reminder: Reminder) {
        self.state.write().unwrap().reminders.insert(reminder.id.clone(), reminder);
    }

    fn notify(&self) {
        let listeners = self.listeners.lock().unwrap();
        for (_, listener) in listeners.iter() {
            listener();
        }
    }

    fn calendar(&self, state: &State, id: &calenda_domain::CalendarId) -> DomainResult<Calendar> {
        state
            .calendars
            .iter()
            .find(|c| &c.id == id)
            .cloned()
            .ok_or_else(|| DomainError::NotFound { entity: "calendar", id: id.to_string() })
    }

    fn new_id() -> String {
        uuid::Uuid::new_v4().to_string()
    }
}

impl AccessGateway for MockProvider {
    fn event_access(&self) -> AccessStatus {
        self.event_access
    }

    fn reminder_access(&self) -> AccessStatus {
        self.reminder_access
    }

    fn request_event_access(&self) -> DomainResult<AccessStatus> {
        Ok(self.event_access)
    }

    fn request_reminder_access(&self) -> DomainResult<AccessStatus> {
        Ok(self.reminder_access)
    }
}

impl CalendarStore for MockProvider {
    fn sources(&self) -> DomainResult<Vec<Source>> {
        Ok(self.state.read().unwrap().sources.clone())
    }

    fn calendars(&self) -> DomainResult<Vec<Calendar>> {
        Ok(self.state.read().unwrap().calendars.clone())
    }
}

/// The civil-date window a UTC range covers in the machine's local zone, which
/// is the zone all-day events are interpreted in.
fn dates_covered(range: &calenda_domain::TimeRange) -> (NaiveDate, NaiveDate) {
    let first = range.start().with_timezone(&Local).date_naive();
    // `end` is exclusive: an end exactly at midnight does not touch that day.
    let last_instant = (range.end() - chrono::Duration::nanoseconds(1)).with_timezone(&Local);
    (first, last_instant.date_naive())
}

impl EventRepository for MockProvider {
    fn events(&self, query: &EventQuery) -> DomainResult<Vec<Event>> {
        let state = self.state.read().unwrap();
        let (first, last) = dates_covered(&query.range);
        let mut found: Vec<Event> = state
            .events
            .values()
            .filter(|e| match &query.calendars {
                Some(ids) => ids.contains(&e.calendar_id),
                None => true,
            })
            .filter(|e| match &e.time {
                EventTime::Timed(t) => t.overlaps(&query.range),
                EventTime::AllDay(span) => span.first() <= last && first <= span.last(),
            })
            .cloned()
            .collect();
        found.sort_by_key(|e| sort_key(&e.time));
        Ok(found)
    }

    fn create_event(&self, draft: EventDraft) -> DomainResult<Event> {
        let event = {
            let mut state = self.state.write().unwrap();
            let calendar = self.calendar(&state, &draft.calendar_id)?;
            if calendar.read_only {
                return Err(DomainError::ReadOnly { entity: "calendar" });
            }
            let event = Event {
                id: EventId::new(Self::new_id()),
                calendar_id: draft.calendar_id,
                title: draft.title,
                time: draft.time,
                location: draft.location,
                notes: draft.notes,
                url: draft.url,
                is_recurring: false,
                read_only: false,
            };
            state.events.insert(event.id.clone(), event.clone());
            event
        };
        self.notify();
        Ok(event)
    }

    fn update_event(&self, id: &EventId, draft: EventDraft, _scope: RecurrenceScope) -> DomainResult<Event> {
        let event = {
            let mut state = self.state.write().unwrap();
            let calendar = self.calendar(&state, &draft.calendar_id)?;
            if calendar.read_only {
                return Err(DomainError::ReadOnly { entity: "calendar" });
            }
            let existing = state
                .events
                .get_mut(id)
                .ok_or_else(|| DomainError::NotFound { entity: "event", id: id.to_string() })?;
            if existing.read_only {
                return Err(DomainError::ReadOnly { entity: "event" });
            }
            existing.calendar_id = draft.calendar_id;
            existing.title = draft.title;
            existing.time = draft.time;
            existing.location = draft.location;
            existing.notes = draft.notes;
            existing.url = draft.url;
            existing.clone()
        };
        self.notify();
        Ok(event)
    }

    fn delete_event(&self, id: &EventId, _scope: RecurrenceScope) -> DomainResult<()> {
        {
            let mut state = self.state.write().unwrap();
            let existing = state
                .events
                .get(id)
                .ok_or_else(|| DomainError::NotFound { entity: "event", id: id.to_string() })?;
            if existing.read_only {
                return Err(DomainError::ReadOnly { entity: "event" });
            }
            state.events.remove(id);
        }
        self.notify();
        Ok(())
    }
}

fn sort_key(time: &EventTime) -> (u8, DateTime<Utc>) {
    match time {
        EventTime::AllDay(span) => (0, Utc.from_utc_datetime(&span.first().and_hms_opt(0, 0, 0).unwrap())),
        EventTime::Timed(range) => (1, range.start()),
    }
}

impl ReminderRepository for MockProvider {
    fn reminders(&self, query: &ReminderQuery) -> DomainResult<Vec<Reminder>> {
        let state = self.state.read().unwrap();
        let mut found: Vec<Reminder> = state
            .reminders
            .values()
            .filter(|r| match &query.lists {
                Some(ids) => ids.contains(&r.list_id),
                None => true,
            })
            .filter(|r| match (query.completion, r.completed_at) {
                (_, None) => true,
                (CompletionFilter::IncompleteOnly, Some(_)) => false,
                (CompletionFilter::CompletedSince(since), Some(at)) => at >= since,
                (CompletionFilter::All, Some(_)) => true,
            })
            .cloned()
            .collect();
        found.sort_by(|a, b| a.due.map(|d| (d.date, d.time)).cmp(&b.due.map(|d| (d.date, d.time))));
        Ok(found)
    }

    fn create_reminder(&self, draft: ReminderDraft) -> DomainResult<Reminder> {
        let reminder = {
            let mut state = self.state.write().unwrap();
            let list = self.calendar(&state, &draft.list_id)?;
            if list.kind != CalendarKind::Reminders {
                return Err(DomainError::invalid("reminders must belong to a reminder list"));
            }
            if list.read_only {
                return Err(DomainError::ReadOnly { entity: "calendar" });
            }
            let reminder = Reminder {
                id: ReminderId::new(Self::new_id()),
                list_id: draft.list_id,
                title: draft.title,
                notes: draft.notes,
                url: draft.url,
                due: draft.due,
                priority: draft.priority,
                completed_at: None,
                is_recurring: false,
            };
            state.reminders.insert(reminder.id.clone(), reminder.clone());
            reminder
        };
        self.notify();
        Ok(reminder)
    }

    fn update_reminder(&self, id: &ReminderId, draft: ReminderDraft) -> DomainResult<Reminder> {
        let reminder = {
            let mut state = self.state.write().unwrap();
            self.calendar(&state, &draft.list_id)?;
            let existing = state
                .reminders
                .get_mut(id)
                .ok_or_else(|| DomainError::NotFound { entity: "reminder", id: id.to_string() })?;
            existing.list_id = draft.list_id;
            existing.title = draft.title;
            existing.notes = draft.notes;
            existing.url = draft.url;
            existing.due = draft.due;
            existing.priority = draft.priority;
            existing.clone()
        };
        self.notify();
        Ok(reminder)
    }

    fn set_reminder_completed(&self, id: &ReminderId, completed: bool) -> DomainResult<Reminder> {
        let reminder = {
            let mut state = self.state.write().unwrap();
            let existing = state
                .reminders
                .get_mut(id)
                .ok_or_else(|| DomainError::NotFound { entity: "reminder", id: id.to_string() })?;
            existing.completed_at = if completed { Some(Utc::now()) } else { None };
            existing.clone()
        };
        self.notify();
        Ok(reminder)
    }

    fn delete_reminder(&self, id: &ReminderId) -> DomainResult<()> {
        let removed = self.state.write().unwrap().reminders.remove(id);
        if removed.is_none() {
            return Err(DomainError::NotFound { entity: "reminder", id: id.to_string() });
        }
        self.notify();
        Ok(())
    }
}

struct MockSubscription {
    id: u64,
    listeners: Listeners,
}

impl Subscription for MockSubscription {}

impl Drop for MockSubscription {
    fn drop(&mut self) {
        self.listeners.lock().unwrap().retain(|(id, _)| *id != self.id);
    }
}

impl ChangeNotifier for MockProvider {
    fn subscribe(&self, listener: ChangeListener) -> Box<dyn Subscription> {
        let id = {
            let mut next = self.next_listener.lock().unwrap();
            *next += 1;
            *next
        };
        self.listeners.lock().unwrap().push((id, listener));
        Box::new(MockSubscription { id, listeners: Arc::clone(&self.listeners) })
    }
}

impl CalendarProvider for MockProvider {
    fn name(&self) -> &'static str {
        "Mock"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use calenda_domain::{DateSpan, Due, Priority, TimeRange};
    use chrono::Duration;
    use std::sync::atomic::{AtomicUsize, Ordering};

    fn day(d: u32) -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 9, d).unwrap()
    }

    fn range(d1: u32, h1: u32, d2: u32, h2: u32) -> TimeRange {
        TimeRange::new(
            Utc.with_ymd_and_hms(2026, 9, d1, h1, 0, 0).unwrap(),
            Utc.with_ymd_and_hms(2026, 9, d2, h2, 0, 0).unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn seeded_provider_exposes_both_kinds_of_calendar() {
        let p = MockProvider::seeded(day(30));
        let calendars = p.calendars().unwrap();
        assert!(calendars.iter().any(|c| c.kind == CalendarKind::Events));
        assert!(calendars.iter().any(|c| c.kind == CalendarKind::Reminders));
    }

    #[test]
    fn events_query_matches_timed_overlap_and_all_day_dates() {
        let p = MockProvider::seeded(day(30));
        let cal = p.calendars().unwrap().into_iter().find(|c| c.kind == CalendarKind::Events).unwrap();
        p.insert_event(Event {
            id: EventId::new("allday"),
            calendar_id: cal.id.clone(),
            title: "Trip".into(),
            time: EventTime::AllDay(DateSpan::new(day(3), day(5)).unwrap()),
            location: None,
            notes: None,
            url: None,
            is_recurring: false,
            read_only: false,
        });
        p.insert_event(Event {
            id: EventId::new("timed"),
            calendar_id: cal.id.clone(),
            title: "Call".into(),
            time: EventTime::Timed(range(4, 9, 4, 10)),
            location: None,
            notes: None,
            url: None,
            is_recurring: false,
            read_only: false,
        });

        let q = |r| EventQuery { range: r, calendars: Some(vec![cal.id.clone()]) };
        let titles = |events: Vec<Event>| events.into_iter().map(|e| e.title).collect::<Vec<_>>();

        // Window ending exactly at midnight on the 3rd must not include the trip.
        assert!(!titles(p.events(&q(range(1, 0, 3, 0))).unwrap()).contains(&"Trip".to_string()));
        assert!(titles(p.events(&q(range(1, 0, 3, 1))).unwrap()).contains(&"Trip".to_string()));
        // Timed overlap is half-open.
        assert!(!titles(p.events(&q(range(4, 10, 4, 11))).unwrap()).contains(&"Call".to_string()));
        assert!(titles(p.events(&q(range(4, 9, 4, 10))).unwrap()).contains(&"Call".to_string()));
        // All-day events sort before timed ones.
        let both = titles(p.events(&q(range(4, 0, 5, 0))).unwrap());
        assert_eq!(both.iter().position(|t| t == "Trip").unwrap(), 0);
    }

    #[test]
    fn mutations_notify_subscribers_until_unsubscribed() {
        let p = MockProvider::seeded(day(30));
        let list = p.calendars().unwrap().into_iter().find(|c| c.kind == CalendarKind::Reminders).unwrap();
        let hits = Arc::new(AtomicUsize::new(0));
        let sub = {
            let hits = Arc::clone(&hits);
            p.subscribe(Box::new(move || {
                hits.fetch_add(1, Ordering::SeqCst);
            }))
        };
        let r = p
            .create_reminder(ReminderDraft {
                list_id: list.id.clone(),
                title: "Buy milk".into(),
                notes: None,
                url: None,
                due: Some(Due::on(day(30))),
                priority: Priority::None,
            })
            .unwrap();
        p.set_reminder_completed(&r.id, true).unwrap();
        assert_eq!(hits.load(Ordering::SeqCst), 2);
        drop(sub);
        p.delete_reminder(&r.id).unwrap();
        assert_eq!(hits.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn completed_filter_respects_since() {
        let p = MockProvider::seeded(day(30));
        let list = p.calendars().unwrap().into_iter().find(|c| c.kind == CalendarKind::Reminders).unwrap();
        let old = Reminder {
            id: ReminderId::new("old"),
            list_id: list.id.clone(),
            title: "Old".into(),
            notes: None,
            url: None,
            due: None,
            priority: Priority::None,
            completed_at: Some(Utc::now() - Duration::days(30)),
            is_recurring: false,
        };
        p.insert_reminder(old);
        let recent = p
            .reminders(&ReminderQuery {
                completion: CompletionFilter::CompletedSince(Utc::now() - Duration::days(7)),
                lists: Some(vec![list.id.clone()]),
            })
            .unwrap();
        assert!(!recent.iter().any(|r| r.title == "Old"));
        let all = p.reminders(&ReminderQuery { completion: CompletionFilter::All, lists: None }).unwrap();
        assert!(all.iter().any(|r| r.title == "Old"));
    }

    #[test]
    fn writes_to_read_only_calendars_are_refused() {
        let p = MockProvider::seeded(day(30));
        let ro = p.calendars().unwrap().into_iter().find(|c| c.read_only).expect("seed has a read-only calendar");
        let err = p
            .create_event(EventDraft {
                calendar_id: ro.id,
                title: "Nope".into(),
                time: EventTime::AllDay(DateSpan::single(day(30))),
                location: None,
                notes: None,
                url: None,
            })
            .unwrap_err();
        assert_eq!(err, DomainError::ReadOnly { entity: "calendar" });
    }
}
