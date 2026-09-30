//! Events: things that block a span of time on a calendar.

use crate::error::{DomainError, DomainResult};
use crate::ids::{CalendarId, EventId};
use crate::time::{DateSpan, TimeRange};

/// When an event happens. All-day events live on civil dates, timed events on
/// instants; the two never mix.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventTime {
    Timed(TimeRange),
    AllDay(DateSpan),
}

impl EventTime {
    pub fn is_all_day(&self) -> bool {
        matches!(self, EventTime::AllDay(_))
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Event {
    pub id: EventId,
    pub calendar_id: CalendarId,
    pub title: String,
    pub time: EventTime,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub url: Option<String>,
    /// True for occurrences of a repeating event. Recurrence rules are not
    /// editable in this version, so we only expose the fact.
    pub is_recurring: bool,
    /// True when this specific event cannot be modified (calendar is read-only
    /// or the user is an invitee rather than the organiser).
    pub read_only: bool,
}

/// Everything the user supplies to create or replace an event.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventDraft {
    pub calendar_id: CalendarId,
    pub title: String,
    pub time: EventTime,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub url: Option<String>,
}

impl EventDraft {
    /// Normalises free-text fields and rejects drafts the provider could not
    /// possibly store, so every provider gets the same guarantees.
    pub fn validated(mut self) -> DomainResult<Self> {
        self.title = self.title.trim().to_owned();
        if self.title.is_empty() {
            return Err(DomainError::invalid("event title must not be empty"));
        }
        self.location = normalise_optional(self.location);
        self.notes = normalise_optional(self.notes);
        self.url = normalise_optional(self.url);
        Ok(self)
    }
}

/// Which occurrences an edit or deletion of a recurring event applies to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecurrenceScope {
    ThisOccurrence,
    ThisAndFuture,
}

/// A request for events, in a time window, optionally limited to some calendars.
///
/// All-day events are matched on the civil dates the window covers in the
/// provider's local zone; timed events on overlap with the window.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventQuery {
    pub range: TimeRange,
    /// `None` means every readable calendar.
    pub calendars: Option<Vec<CalendarId>>,
}

pub(crate) fn normalise_optional(value: Option<String>) -> Option<String> {
    value.map(|s| s.trim().to_owned()).filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;

    fn draft(title: &str) -> EventDraft {
        EventDraft {
            calendar_id: CalendarId::new("cal"),
            title: title.to_owned(),
            time: EventTime::AllDay(DateSpan::single(NaiveDate::from_ymd_opt(2026, 9, 30).unwrap())),
            location: Some("  ".to_owned()),
            notes: Some(" note ".to_owned()),
            url: None,
        }
    }

    #[test]
    fn validation_trims_and_rejects_blank_title() {
        let ok = draft("  Team sync ").validated().unwrap();
        assert_eq!(ok.title, "Team sync");
        assert_eq!(ok.location, None);
        assert_eq!(ok.notes.as_deref(), Some("note"));
        assert!(draft("   ").validated().is_err());
    }
}
