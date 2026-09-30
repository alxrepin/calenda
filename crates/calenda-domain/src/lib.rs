//! Calenda domain.
//!
//! This crate is the innermost layer of the application. It knows nothing about
//! EventKit, Tauri, JSON or any other delivery mechanism. It defines:
//!
//! * entities and value objects (`Calendar`, `Event`, `Reminder`, `TimeRange`, ...),
//! * the *ports* that outer layers implement (`CalendarProvider` and friends),
//! * the error type shared by those ports.
//!
//! Two vocabulary decisions worth knowing:
//!
//! * An **event** blocks a span of time on a calendar. A **reminder** is an action
//!   to take, which may or may not have a due date and time. They are separate
//!   entities on purpose: the product is built around that distinction.
//! * Reminder lists and event calendars are both represented by `Calendar`, with a
//!   `CalendarKind` telling them apart. That mirrors how Apple's EventKit models
//!   them and keeps a single "which calendars are visible" concept in the app.

pub mod calendar;
pub mod error;
pub mod event;
pub mod ids;
pub mod ports;
pub mod reminder;
pub mod time;

pub use calendar::{AccessStatus, Calendar, CalendarKind, Color, Source, SourceKind};
pub use error::{DomainError, DomainResult};
pub use event::{Event, EventDraft, EventQuery, EventTime, RecurrenceScope};
pub use ids::{CalendarId, EventId, ReminderId, SourceId};
pub use ports::{
    AccessGateway, CalendarProvider, CalendarStore, ChangeListener, ChangeNotifier,
    EventRepository, ReminderRepository, Subscription,
};
pub use reminder::{CompletionFilter, Due, Priority, Reminder, ReminderDraft, ReminderQuery};
pub use time::{DateSpan, TimeRange};
