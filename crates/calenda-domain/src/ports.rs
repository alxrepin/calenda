//! Ports implemented by infrastructure (EventKit today, CalDAV / Google later).
//!
//! The ports are split by responsibility so a future provider can implement,
//! say, events without reminders. `CalendarProvider` bundles them for the
//! application layer, which always wants the whole set.
//!
//! All methods are synchronous and may block. Providers that talk to a network
//! or to a single-threaded native store are expected to handle threading
//! internally; the application layer calls them from worker threads.

use crate::calendar::{AccessStatus, Calendar, Source};
use crate::error::DomainResult;
use crate::event::{Event, EventDraft, EventQuery, RecurrenceScope};
use crate::ids::{EventId, ReminderId};
use crate::reminder::{Reminder, ReminderDraft, ReminderQuery};

/// Platform permission handling.
pub trait AccessGateway: Send + Sync {
    fn event_access(&self) -> AccessStatus;
    fn reminder_access(&self) -> AccessStatus;

    /// Prompts the user if the status is `NotDetermined`; otherwise returns the
    /// current status without prompting.
    fn request_event_access(&self) -> DomainResult<AccessStatus>;
    fn request_reminder_access(&self) -> DomainResult<AccessStatus>;
}

pub trait CalendarStore: Send + Sync {
    fn sources(&self) -> DomainResult<Vec<Source>>;
    fn calendars(&self) -> DomainResult<Vec<Calendar>>;
}

pub trait EventRepository: Send + Sync {
    fn events(&self, query: &EventQuery) -> DomainResult<Vec<Event>>;
    fn create_event(&self, draft: EventDraft) -> DomainResult<Event>;
    fn update_event(
        &self,
        id: &EventId,
        draft: EventDraft,
        scope: RecurrenceScope,
    ) -> DomainResult<Event>;
    fn delete_event(&self, id: &EventId, scope: RecurrenceScope) -> DomainResult<()>;
}

pub trait ReminderRepository: Send + Sync {
    fn reminders(&self, query: &ReminderQuery) -> DomainResult<Vec<Reminder>>;
    fn create_reminder(&self, draft: ReminderDraft) -> DomainResult<Reminder>;
    fn update_reminder(&self, id: &ReminderId, draft: ReminderDraft) -> DomainResult<Reminder>;
    fn set_reminder_completed(&self, id: &ReminderId, completed: bool) -> DomainResult<Reminder>;
    fn delete_reminder(&self, id: &ReminderId) -> DomainResult<()>;
}

/// Called whenever the underlying store changed for any reason (another app,
/// a sync, or this app). Coarse on purpose: EventKit only tells us *that*
/// something changed, so callers re-query.
pub type ChangeListener = Box<dyn Fn() + Send + Sync + 'static>;

/// Keeps a change subscription alive; dropping it unsubscribes.
pub trait Subscription: Send + Sync {}

pub trait ChangeNotifier: Send + Sync {
    fn subscribe(&self, listener: ChangeListener) -> Box<dyn Subscription>;
}

pub trait CalendarProvider:
    AccessGateway + CalendarStore + EventRepository + ReminderRepository + ChangeNotifier
{
    /// Short human-readable name, for diagnostics ("EventKit", "Mock").
    fn name(&self) -> &'static str;
}
