use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use calenda_domain::{
    AccessGateway, AccessStatus, Calendar, CalendarId, CalendarKind, CalendarProvider,
    CalendarStore, ChangeListener, ChangeNotifier, CompletionFilter, DomainError, DomainResult,
    Event, EventDraft, EventId, EventQuery, EventRepository, RecurrenceScope, Reminder,
    ReminderDraft, ReminderId, ReminderQuery, ReminderRepository, Source, Subscription,
};

use objc2::rc::Retained;
use objc2::runtime::Bool;
use objc2_event_kit::{
    EKAlarm, EKCalendar, EKEntityType, EKEvent, EKEventStore, EKReminder, EKSpan,
};
use objc2_foundation::{NSArray, NSError, NSURL};

use crate::convert;
use crate::worker::{wait_for_completion, Listeners, Store, Worker};

/// How long to wait for the system permission dialog.
const ACCESS_PROMPT_TIMEOUT: Duration = Duration::from_secs(15 * 60);
/// How long to wait for an asynchronous reminder fetch.
const FETCH_TIMEOUT: Duration = Duration::from_secs(20);

fn entity_name(entity: EKEntityType) -> &'static str {
    if entity == EKEntityType::Reminder {
        "reminders"
    } else {
        "events"
    }
}

pub struct EventKitProvider {
    worker: Worker,
    listeners: Listeners,
    next_listener: Mutex<u64>,
}

impl EventKitProvider {
    pub fn new() -> Self {
        let listeners: Listeners = Arc::new(Mutex::new(Vec::new()));
        Self {
            worker: Worker::spawn(Arc::clone(&listeners)),
            listeners,
            next_listener: Mutex::new(0),
        }
    }

    fn request_access(&self, entity: EKEntityType) -> DomainResult<AccessStatus> {
        self.worker.run(move |store| {
            let current = convert::access_status(unsafe {
                EKEventStore::authorizationStatusForEntityType(entity)
            });
            if current != AccessStatus::NotDetermined {
                log::info!(
                    "EventKit {} access already {:?}",
                    entity_name(entity),
                    current
                );
                return Ok(current);
            }
            log::info!("EventKit requesting {} access", entity_name(entity));
            let (tx, rx) = mpsc::channel::<Result<bool, String>>();
            let block = block2::RcBlock::new(move |granted: Bool, err: *mut NSError| {
                let result = if err.is_null() {
                    Ok(granted.as_bool())
                } else {
                    Err(convert::error(unsafe { &*err }).to_string())
                };
                let _ = tx.send(result);
            });
            unsafe {
                match entity {
                    EKEntityType::Reminder => {
                        store.store.requestFullAccessToRemindersWithCompletion(
                            block2::RcBlock::as_ptr(&block),
                        )
                    }
                    _ => store
                        .store
                        .requestFullAccessToEventsWithCompletion(block2::RcBlock::as_ptr(&block)),
                }
            }
            let granted = wait_for_completion(&rx, ACCESS_PROMPT_TIMEOUT)
                .ok_or_else(|| DomainError::provider("timed out waiting for the access prompt"))?
                .map_err(DomainError::Provider)?;
            if granted {
                store.recreate();
            }
            let status = convert::access_status(unsafe {
                EKEventStore::authorizationStatusForEntityType(entity)
            });
            log::info!(
                "EventKit {} access prompt answered: granted={granted}, status={status:?}",
                entity_name(entity)
            );
            Ok(status)
        })
    }
}

impl Default for EventKitProvider {
    fn default() -> Self {
        Self::new()
    }
}

// ---- helpers on the worker thread -----------------------------------------------

fn calendars_of(store: &Store, entity: EKEntityType) -> Vec<Retained<EKCalendar>> {
    unsafe { store.store.calendarsForEntityType(entity) }.to_vec()
}

fn find_calendar(store: &Store, id: &CalendarId) -> DomainResult<Retained<EKCalendar>> {
    unsafe {
        store
            .store
            .calendarWithIdentifier(&convert::ns_string(id.as_str()))
    }
    .ok_or_else(|| DomainError::NotFound {
        entity: "calendar",
        id: id.to_string(),
    })
}

fn calendar_array(
    store: &Store,
    ids: &[CalendarId],
) -> DomainResult<Retained<NSArray<EKCalendar>>> {
    let calendars = ids
        .iter()
        .map(|id| find_calendar(store, id))
        .collect::<DomainResult<Vec<_>>>()?;
    Ok(NSArray::from_retained_slice(&calendars))
}

fn read_only(calendar: Option<Retained<EKCalendar>>) -> bool {
    calendar
        .map(|c| !unsafe { c.allowsContentModifications() })
        .unwrap_or(true)
}

fn require_full_access(entity: EKEntityType, name: &'static str) -> DomainResult<()> {
    match convert::access_status(unsafe { EKEventStore::authorizationStatusForEntityType(entity) })
    {
        AccessStatus::Full => Ok(()),
        _ => Err(DomainError::AccessDenied { entity: name }),
    }
}

/// Finds the `EKEvent` for a domain id, including a specific occurrence of a
/// recurring event.
fn find_event(store: &Store, id: &EventId) -> DomainResult<Retained<EKEvent>> {
    let not_found = || DomainError::NotFound {
        entity: "event",
        id: id.to_string(),
    };
    let (identifier, occurrence) = convert::parse_event_id(id);
    let ns_id = convert::ns_string(&identifier);
    let Some(occurrence) = occurrence else {
        return unsafe { store.store.eventWithIdentifier(&ns_id) }.ok_or_else(not_found);
    };
    // Occurrences are only reachable through a date predicate. The occurrence
    // date is the *scheduled* start, so a detached, moved instance still
    // matches the window around it.
    let window = chrono::Duration::days(2);
    let predicate = unsafe {
        store
            .store
            .predicateForEventsWithStartDate_endDate_calendars(
                &convert::ns_date(occurrence - window),
                &convert::ns_date(occurrence + window),
                None,
            )
    };
    let candidates = unsafe { store.store.eventsMatchingPredicate(&predicate) };
    candidates
        .iter()
        .find(|e| convert::event_id(e) == *id)
        .ok_or_else(not_found)
}

fn find_reminder(store: &Store, id: &ReminderId) -> DomainResult<Retained<EKReminder>> {
    let item = unsafe {
        store
            .store
            .calendarItemWithIdentifier(&convert::ns_string(id.as_str()))
    }
    .ok_or_else(|| DomainError::NotFound {
        entity: "reminder",
        id: id.to_string(),
    })?;
    item.downcast::<EKReminder>()
        .map_err(|_| DomainError::NotFound {
            entity: "reminder",
            id: id.to_string(),
        })
}

fn apply_event_draft(store: &Store, event: &EKEvent, draft: &EventDraft) -> DomainResult<()> {
    let calendar = find_calendar(store, &draft.calendar_id)?;
    if !unsafe { calendar.allowsContentModifications() } {
        return Err(DomainError::ReadOnly { entity: "calendar" });
    }
    let (start, end) = convert::event_bounds(&draft.time);
    unsafe {
        event.setCalendar(Some(&calendar));
        event.setTitle(Some(&convert::ns_string(&draft.title)));
        event.setAllDay(draft.time.is_all_day());
        event.setStartDate(Some(&convert::ns_date(start)));
        event.setEndDate(Some(&convert::ns_date(end)));
        event.setLocation(draft.location.as_deref().map(convert::ns_string).as_deref());
        event.setNotes(draft.notes.as_deref().map(convert::ns_string).as_deref());
        event.setURL(
            draft
                .url
                .as_deref()
                .and_then(|u| NSURL::URLWithString(&convert::ns_string(u)))
                .as_deref(),
        );
    }
    Ok(())
}

fn apply_reminder_draft(
    store: &Store,
    reminder: &EKReminder,
    draft: &ReminderDraft,
) -> DomainResult<()> {
    let list = find_calendar(store, &draft.list_id)?;
    if !unsafe { list.allowsContentModifications() } {
        return Err(DomainError::ReadOnly { entity: "calendar" });
    }
    unsafe {
        reminder.setCalendar(Some(&list));
        reminder.setTitle(Some(&convert::ns_string(&draft.title)));
        reminder.setNotes(draft.notes.as_deref().map(convert::ns_string).as_deref());
        reminder.setURL(
            draft
                .url
                .as_deref()
                .and_then(|u| NSURL::URLWithString(&convert::ns_string(u)))
                .as_deref(),
        );
        reminder.setPriority(draft.priority.to_rfc5545() as usize);
        reminder.setDueDateComponents(draft.due.as_ref().map(convert::due_components).as_deref());
        // Reminders.app notifies at the due time through an alarm; EventKit
        // does not add one for us.
        let alarm = draft
            .due
            .as_ref()
            .and_then(convert::due_instant)
            .map(|at| EKAlarm::alarmWithAbsoluteDate(&convert::ns_date(at)));
        reminder.setAlarms(alarm.map(|a| NSArray::from_retained_slice(&[a])).as_deref());
    }
    Ok(())
}

fn span(scope: RecurrenceScope) -> EKSpan {
    match scope {
        RecurrenceScope::ThisOccurrence => EKSpan::ThisEvent,
        RecurrenceScope::ThisAndFuture => EKSpan::FutureEvents,
    }
}

fn fetch_reminders(store: &Store, query: &ReminderQuery) -> DomainResult<Vec<Reminder>> {
    let calendars = match &query.lists {
        Some(ids) => Some(calendar_array(store, ids)?),
        None => None,
    };
    let calendars_ref = calendars.as_deref();

    // Incomplete reminders are always wanted; completed ones depend on the filter.
    let mut predicates = vec![unsafe {
        store
            .store
            .predicateForIncompleteRemindersWithDueDateStarting_ending_calendars(
                None,
                None,
                calendars_ref,
            )
    }];
    match query.completion {
        CompletionFilter::IncompleteOnly => {}
        CompletionFilter::CompletedSince(since) => predicates.push(unsafe {
            store
                .store
                .predicateForCompletedRemindersWithCompletionDateStarting_ending_calendars(
                    Some(&convert::ns_date(since)),
                    None,
                    calendars_ref,
                )
        }),
        CompletionFilter::All => predicates.push(unsafe {
            store
                .store
                .predicateForCompletedRemindersWithCompletionDateStarting_ending_calendars(
                    None,
                    None,
                    calendars_ref,
                )
        }),
    }

    let mut all = Vec::new();
    for predicate in predicates {
        let (tx, rx) = mpsc::channel::<Vec<Reminder>>();
        let block = block2::RcBlock::new(move |reminders: *mut NSArray<EKReminder>| {
            let converted = if reminders.is_null() {
                Vec::new()
            } else {
                unsafe { &*reminders }
                    .iter()
                    .map(|r| convert::reminder(&r))
                    .collect()
            };
            let _ = tx.send(converted);
        });
        let _request = unsafe {
            store
                .store
                .fetchRemindersMatchingPredicate_completion(&predicate, &block)
        };
        let batch = wait_for_completion(&rx, FETCH_TIMEOUT)
            .ok_or_else(|| DomainError::provider("timed out fetching reminders"))?;
        log::debug!("EventKit reminder fetch returned {} items", batch.len());
        all.extend(batch);
    }
    log::info!("EventKit reminders fetched: {}", all.len());
    all.sort_by(|a, b| {
        a.due
            .map(|d| (d.date, d.time))
            .cmp(&b.due.map(|d| (d.date, d.time)))
    });
    Ok(all)
}

// ---- port implementations -------------------------------------------------------

impl AccessGateway for EventKitProvider {
    fn event_access(&self) -> AccessStatus {
        convert::access_status(unsafe {
            EKEventStore::authorizationStatusForEntityType(EKEntityType::Event)
        })
    }

    fn reminder_access(&self) -> AccessStatus {
        convert::access_status(unsafe {
            EKEventStore::authorizationStatusForEntityType(EKEntityType::Reminder)
        })
    }

    fn request_event_access(&self) -> DomainResult<AccessStatus> {
        self.request_access(EKEntityType::Event)
    }

    fn request_reminder_access(&self) -> DomainResult<AccessStatus> {
        self.request_access(EKEntityType::Reminder)
    }
}

impl CalendarStore for EventKitProvider {
    fn sources(&self) -> DomainResult<Vec<Source>> {
        self.worker.run(|store| {
            Ok(unsafe { store.store.sources() }
                .iter()
                .map(|s| convert::source(&s))
                .collect())
        })
    }

    fn calendars(&self) -> DomainResult<Vec<Calendar>> {
        self.worker.run(|store| {
            let mut out = Vec::new();
            if require_full_access(EKEntityType::Event, "events").is_ok() {
                out.extend(
                    calendars_of(store, EKEntityType::Event)
                        .iter()
                        .map(|c| convert::calendar(c, CalendarKind::Events)),
                );
            }
            if require_full_access(EKEntityType::Reminder, "reminders").is_ok() {
                out.extend(
                    calendars_of(store, EKEntityType::Reminder)
                        .iter()
                        .map(|c| convert::calendar(c, CalendarKind::Reminders)),
                );
            }
            let lists = out.iter().filter(|c| c.kind == CalendarKind::Reminders).count();
            log::info!(
                "EventKit calendars: {} event calendars, {} reminder lists (event access {:?}, reminder access {:?})",
                out.len() - lists,
                lists,
                convert::access_status(unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) }),
                convert::access_status(unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Reminder) }),
            );
            Ok(out)
        })
    }
}

impl EventRepository for EventKitProvider {
    fn events(&self, query: &EventQuery) -> DomainResult<Vec<Event>> {
        let query = query.clone();
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Event, "events")?;
            let calendars = match &query.calendars {
                Some(ids) => Some(calendar_array(store, ids)?),
                None => None,
            };
            let predicate = unsafe {
                store
                    .store
                    .predicateForEventsWithStartDate_endDate_calendars(
                        &convert::ns_date(query.range.start()),
                        &convert::ns_date(query.range.end()),
                        calendars.as_deref(),
                    )
            };
            let found = unsafe { store.store.eventsMatchingPredicate(&predicate) };
            let mut events = found
                .iter()
                .map(|e| convert::event(&e, read_only(unsafe { e.calendar() })))
                .collect::<DomainResult<Vec<_>>>()?;
            // EventKit already sorts by start date; keep all-day first for the UI.
            events.sort_by_key(|e| !e.time.is_all_day());
            Ok(events)
        })
    }

    fn create_event(&self, draft: EventDraft) -> DomainResult<Event> {
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Event, "events")?;
            let event = unsafe { EKEvent::eventWithEventStore(&store.store) };
            apply_event_draft(store, &event, &draft)?;
            unsafe {
                store
                    .store
                    .saveEvent_span_commit_error(&event, EKSpan::ThisEvent, true)
            }
            .map_err(|e| convert::error(&e))?;
            convert::event(&event, false)
        })
    }

    fn update_event(
        &self,
        id: &EventId,
        draft: EventDraft,
        scope: RecurrenceScope,
    ) -> DomainResult<Event> {
        let id = id.clone();
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Event, "events")?;
            let event = find_event(store, &id)?;
            if read_only(unsafe { event.calendar() }) {
                return Err(DomainError::ReadOnly { entity: "event" });
            }
            apply_event_draft(store, &event, &draft)?;
            unsafe {
                store
                    .store
                    .saveEvent_span_commit_error(&event, span(scope), true)
            }
            .map_err(|e| convert::error(&e))?;
            convert::event(&event, false)
        })
    }

    fn delete_event(&self, id: &EventId, scope: RecurrenceScope) -> DomainResult<()> {
        let id = id.clone();
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Event, "events")?;
            let event = find_event(store, &id)?;
            if read_only(unsafe { event.calendar() }) {
                return Err(DomainError::ReadOnly { entity: "event" });
            }
            unsafe {
                store
                    .store
                    .removeEvent_span_commit_error(&event, span(scope), true)
            }
            .map_err(|e| convert::error(&e))
        })
    }
}

impl ReminderRepository for EventKitProvider {
    fn reminders(&self, query: &ReminderQuery) -> DomainResult<Vec<Reminder>> {
        let query = query.clone();
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Reminder, "reminders")?;
            fetch_reminders(store, &query)
        })
    }

    fn create_reminder(&self, draft: ReminderDraft) -> DomainResult<Reminder> {
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Reminder, "reminders")?;
            let reminder = unsafe { EKReminder::reminderWithEventStore(&store.store) };
            apply_reminder_draft(store, &reminder, &draft)?;
            unsafe { store.store.saveReminder_commit_error(&reminder, true) }
                .map_err(|e| convert::error(&e))?;
            Ok(convert::reminder(&reminder))
        })
    }

    fn update_reminder(&self, id: &ReminderId, draft: ReminderDraft) -> DomainResult<Reminder> {
        let id = id.clone();
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Reminder, "reminders")?;
            let reminder = find_reminder(store, &id)?;
            apply_reminder_draft(store, &reminder, &draft)?;
            unsafe { store.store.saveReminder_commit_error(&reminder, true) }
                .map_err(|e| convert::error(&e))?;
            Ok(convert::reminder(&reminder))
        })
    }

    fn set_reminder_completed(&self, id: &ReminderId, completed: bool) -> DomainResult<Reminder> {
        let id = id.clone();
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Reminder, "reminders")?;
            let reminder = find_reminder(store, &id)?;
            unsafe { reminder.setCompleted(completed) };
            unsafe { store.store.saveReminder_commit_error(&reminder, true) }
                .map_err(|e| convert::error(&e))?;
            Ok(convert::reminder(&reminder))
        })
    }

    fn delete_reminder(&self, id: &ReminderId) -> DomainResult<()> {
        let id = id.clone();
        self.worker.run(move |store| {
            require_full_access(EKEntityType::Reminder, "reminders")?;
            let reminder = find_reminder(store, &id)?;
            unsafe { store.store.removeReminder_commit_error(&reminder, true) }
                .map_err(|e| convert::error(&e))
        })
    }
}

struct EventKitSubscription {
    id: u64,
    listeners: Listeners,
}

impl Subscription for EventKitSubscription {}

impl Drop for EventKitSubscription {
    fn drop(&mut self) {
        self.listeners
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .retain(|(id, _)| *id != self.id);
    }
}

impl ChangeNotifier for EventKitProvider {
    fn subscribe(&self, listener: ChangeListener) -> Box<dyn Subscription> {
        let id = {
            let mut next = self.next_listener.lock().unwrap_or_else(|e| e.into_inner());
            *next += 1;
            *next
        };
        self.listeners
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .push((id, listener));
        Box::new(EventKitSubscription {
            id,
            listeners: Arc::clone(&self.listeners),
        })
    }
}

impl CalendarProvider for EventKitProvider {
    fn name(&self) -> &'static str {
        "EventKit"
    }
}
