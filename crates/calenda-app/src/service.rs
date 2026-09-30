use std::sync::Arc;

use calenda_domain::{
    AccessStatus, Calendar, CalendarId, CalendarKind, CalendarProvider, ChangeListener,
    CompletionFilter, DomainError, DomainResult, Event, EventDraft, EventId,
    EventQuery, EventTime, RecurrenceScope, Reminder, ReminderDraft, ReminderId,
    ReminderQuery, Subscription, TimeRange,
};
use chrono::{DateTime, Duration, NaiveDate, Utc};

use crate::preferences::{Preferences, PreferencesRepository};
use crate::workspace::Workspace;

/// Free-text search results across both entity kinds.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct SearchResults {
    pub events: Vec<Event>,
    pub reminders: Vec<Reminder>,
}

/// The application façade. One instance per running app.
pub struct AgendaService {
    provider: Arc<dyn CalendarProvider>,
    preferences: Arc<dyn PreferencesRepository>,
}

impl AgendaService {
    pub fn new(provider: Arc<dyn CalendarProvider>, preferences: Arc<dyn PreferencesRepository>) -> Self {
        Self { provider, preferences }
    }

    pub fn provider_name(&self) -> &'static str {
        self.provider.name()
    }

    // ---- workspace & access -------------------------------------------------

    /// Loads sources, calendars and preferences. Asks for platform access on
    /// first use; later calls just report the stored decision.
    pub fn workspace(&self) -> DomainResult<Workspace> {
        let event_access = self.ensure_access(
            self.provider.event_access(),
            || self.provider.request_event_access(),
        )?;
        let reminder_access = self.ensure_access(
            self.provider.reminder_access(),
            || self.provider.request_reminder_access(),
        )?;

        let readable = event_access.can_read() || reminder_access.can_read();
        let (sources, calendars) = if readable {
            (self.provider.sources()?, self.provider.calendars()?)
        } else {
            (Vec::new(), Vec::new())
        };

        Ok(Workspace {
            event_access,
            reminder_access,
            sources,
            calendars,
            preferences: self.preferences.load()?,
        })
    }

    fn ensure_access(
        &self,
        current: AccessStatus,
        request: impl FnOnce() -> DomainResult<AccessStatus>,
    ) -> DomainResult<AccessStatus> {
        match current {
            AccessStatus::NotDetermined => request(),
            other => Ok(other),
        }
    }

    pub fn preferences(&self) -> DomainResult<Preferences> {
        self.preferences.load()
    }

    pub fn set_calendar_visible(&self, id: &CalendarId, visible: bool) -> DomainResult<Preferences> {
        let mut prefs = self.preferences.load()?;
        if visible {
            prefs.hidden_calendars.remove(id);
        } else {
            prefs.hidden_calendars.insert(id.clone());
        }
        self.preferences.save(&prefs)?;
        Ok(prefs)
    }

    pub fn set_show_reminders_in_grid(&self, show: bool) -> DomainResult<Preferences> {
        let mut prefs = self.preferences.load()?;
        prefs.show_reminders_in_grid = show;
        self.preferences.save(&prefs)?;
        Ok(prefs)
    }

    // ---- events ---------------------------------------------------------

    /// Events in `range` from the calendars the user has left visible.
    pub fn events(&self, range: TimeRange) -> DomainResult<Vec<Event>> {
        let calendars = self.visible_ids(CalendarKind::Events)?;
        if calendars.is_empty() {
            return Ok(Vec::new());
        }
        self.provider.events(&EventQuery { range, calendars: Some(calendars) })
    }

    pub fn create_event(&self, draft: EventDraft) -> DomainResult<Event> {
        self.guard_writable(&draft.calendar_id)?;
        self.provider.create_event(draft.validated()?)
    }

    pub fn update_event(&self, id: &EventId, draft: EventDraft, scope: RecurrenceScope) -> DomainResult<Event> {
        self.guard_writable(&draft.calendar_id)?;
        self.provider.update_event(id, draft.validated()?, scope)
    }

    pub fn delete_event(&self, id: &EventId, scope: RecurrenceScope) -> DomainResult<()> {
        self.provider.delete_event(id, scope)
    }

    /// Drag-and-drop: keeps everything about the event except *when*. A timed
    /// event keeps its duration; an all-day event keeps its length in days.
    pub fn move_event(&self, event: &Event, new_start: DateTime<Utc>, new_day: NaiveDate) -> DomainResult<Event> {
        if event.read_only {
            return Err(DomainError::ReadOnly { entity: "event" });
        }
        let time = match &event.time {
            EventTime::Timed(range) => EventTime::Timed(range.moved_to(new_start)),
            EventTime::AllDay(span) => EventTime::AllDay(span.moved_to(new_day)),
        };
        let draft = EventDraft {
            calendar_id: event.calendar_id.clone(),
            title: event.title.clone(),
            time,
            location: event.location.clone(),
            notes: event.notes.clone(),
            url: event.url.clone(),
        };
        self.provider.update_event(&event.id, draft, RecurrenceScope::ThisOccurrence)
    }

    // ---- reminders ------------------------------------------------------

    /// Incomplete reminders plus those completed in the last `completed_window`
    /// (so a just-ticked task does not vanish), from visible lists only.
    pub fn reminders(&self, now: DateTime<Utc>, completed_window: Duration) -> DomainResult<Vec<Reminder>> {
        let lists = self.visible_ids(CalendarKind::Reminders)?;
        if lists.is_empty() {
            return Ok(Vec::new());
        }
        self.provider.reminders(&ReminderQuery {
            completion: CompletionFilter::CompletedSince(now - completed_window),
            lists: Some(lists),
        })
    }

    pub fn create_reminder(&self, draft: ReminderDraft) -> DomainResult<Reminder> {
        self.guard_writable(&draft.list_id)?;
        self.provider.create_reminder(draft.validated()?)
    }

    pub fn update_reminder(&self, id: &ReminderId, draft: ReminderDraft) -> DomainResult<Reminder> {
        self.guard_writable(&draft.list_id)?;
        self.provider.update_reminder(id, draft.validated()?)
    }

    pub fn set_reminder_completed(&self, id: &ReminderId, completed: bool) -> DomainResult<Reminder> {
        self.provider.set_reminder_completed(id, completed)
    }

    pub fn delete_reminder(&self, id: &ReminderId) -> DomainResult<()> {
        self.provider.delete_reminder(id)
    }

    // ---- search ---------------------------------------------------------

    /// Case-insensitive substring search over titles, locations and notes.
    /// Providers have no text index, so events are scanned in a window around
    /// `now`; reminders are scanned in full.
    pub fn search(&self, text: &str, now: DateTime<Utc>) -> DomainResult<SearchResults> {
        let needle = text.trim().to_lowercase();
        if needle.is_empty() {
            return Ok(SearchResults::default());
        }
        let range = TimeRange::new(now - Duration::days(180), now + Duration::days(366))
            .expect("search window is non-empty");

        let mut events = self.events(range)?;
        events.retain(|e| {
            matches(&e.title, &needle)
                || e.location.as_deref().is_some_and(|s| matches(s, &needle))
                || e.notes.as_deref().is_some_and(|s| matches(s, &needle))
        });

        let lists = self.visible_ids(CalendarKind::Reminders)?;
        let mut reminders = if lists.is_empty() {
            Vec::new()
        } else {
            self.provider.reminders(&ReminderQuery { completion: CompletionFilter::All, lists: Some(lists) })?
        };
        reminders.retain(|r| {
            matches(&r.title, &needle) || r.notes.as_deref().is_some_and(|s| matches(s, &needle))
        });

        Ok(SearchResults { events, reminders })
    }

    // ---- change notifications ---------------------------------------------

    pub fn subscribe(&self, listener: ChangeListener) -> Box<dyn Subscription> {
        self.provider.subscribe(listener)
    }

    // ---- helpers --------------------------------------------------------

    fn visible_ids(&self, kind: CalendarKind) -> DomainResult<Vec<CalendarId>> {
        let prefs = self.preferences.load()?;
        Ok(self
            .provider
            .calendars()?
            .into_iter()
            .filter(|c| c.kind == kind && !prefs.hidden_calendars.contains(&c.id))
            .map(|c| c.id)
            .collect())
    }

    fn guard_writable(&self, calendar_id: &CalendarId) -> DomainResult<()> {
        let calendar = self.find_calendar(calendar_id)?;
        if calendar.read_only {
            return Err(DomainError::ReadOnly { entity: "calendar" });
        }
        Ok(())
    }

    fn find_calendar(&self, id: &CalendarId) -> DomainResult<Calendar> {
        self.provider
            .calendars()?
            .into_iter()
            .find(|c| &c.id == id)
            .ok_or_else(|| DomainError::NotFound { entity: "calendar", id: id.to_string() })
    }
}

fn matches(haystack: &str, needle: &str) -> bool {
    haystack.to_lowercase().contains(needle)
}
