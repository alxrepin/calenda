//! Reminders: actions to take, with or without a due date.

use chrono::{DateTime, NaiveDate, NaiveTime, Utc};

use crate::error::{DomainError, DomainResult};
use crate::event::normalise_optional;
use crate::ids::{CalendarId, ReminderId};

/// When a reminder is due. The time, when present, is a *floating* local time:
/// "9:00 on 30 September" stays 9:00 whatever zone the user is in, which is how
/// Apple Reminders behaves and what people expect from a to-do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct Due {
    pub date: NaiveDate,
    pub time: Option<NaiveTime>,
}

impl Due {
    pub fn on(date: NaiveDate) -> Self {
        Self { date, time: None }
    }

    pub fn at(date: NaiveDate, time: NaiveTime) -> Self {
        Self {
            date,
            time: Some(time),
        }
    }
}

/// Reminder priority, in the four steps Apple Reminders shows.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum Priority {
    None,
    Low,
    Medium,
    High,
}

impl Priority {
    /// Maps the RFC 5545 / EventKit 0..=9 scale (0 = none, 1 = highest).
    pub fn from_rfc5545(value: u32) -> Self {
        match value {
            0 => Priority::None,
            1..=4 => Priority::High,
            5 => Priority::Medium,
            _ => Priority::Low,
        }
    }

    pub fn to_rfc5545(self) -> u32 {
        match self {
            Priority::None => 0,
            Priority::High => 1,
            Priority::Medium => 5,
            Priority::Low => 9,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Reminder {
    pub id: ReminderId,
    /// The list the reminder belongs to (a `Calendar` of kind `Reminders`).
    pub list_id: CalendarId,
    pub title: String,
    pub notes: Option<String>,
    pub url: Option<String>,
    pub due: Option<Due>,
    pub priority: Priority,
    pub completed_at: Option<DateTime<Utc>>,
    pub is_recurring: bool,
}

impl Reminder {
    pub fn is_completed(&self) -> bool {
        self.completed_at.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReminderDraft {
    pub list_id: CalendarId,
    pub title: String,
    pub notes: Option<String>,
    pub url: Option<String>,
    pub due: Option<Due>,
    pub priority: Priority,
}

impl ReminderDraft {
    pub fn validated(mut self) -> DomainResult<Self> {
        self.title = self.title.trim().to_owned();
        if self.title.is_empty() {
            return Err(DomainError::invalid("reminder title must not be empty"));
        }
        self.notes = normalise_optional(self.notes);
        self.url = normalise_optional(self.url);
        Ok(self)
    }
}

/// Which completed reminders to include in a query. Incomplete reminders are
/// always included.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompletionFilter {
    IncompleteOnly,
    /// Include reminders completed at or after the instant.
    CompletedSince(DateTime<Utc>),
    All,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReminderQuery {
    pub completion: CompletionFilter,
    /// `None` means every readable list.
    pub lists: Option<Vec<CalendarId>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_round_trips_through_rfc5545() {
        for p in [
            Priority::None,
            Priority::Low,
            Priority::Medium,
            Priority::High,
        ] {
            assert_eq!(Priority::from_rfc5545(p.to_rfc5545()), p);
        }
        assert_eq!(Priority::from_rfc5545(3), Priority::High);
        assert_eq!(Priority::from_rfc5545(7), Priority::Low);
    }
}
