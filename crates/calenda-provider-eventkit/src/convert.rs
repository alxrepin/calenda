//! Conversions between EventKit objects and domain types.
//!
//! Every function here runs on the worker thread.

use calenda_domain::{
    AccessStatus, Calendar, CalendarId, CalendarKind, Color, DateSpan, DomainError, DomainResult,
    Due, Event, EventId, EventTime, Priority, Reminder, ReminderId, Source, SourceId, SourceKind,
    TimeRange,
};
use chrono::{DateTime, Local, NaiveDate, NaiveTime, TimeZone, Utc};
use objc2::rc::Retained;
use objc2_app_kit::NSColorSpace;
use objc2_event_kit::{
    EKAuthorizationStatus, EKCalendar, EKEvent, EKReminder, EKSource, EKSourceType,
};
use objc2_foundation::{NSDate, NSDateComponentUndefined, NSDateComponents, NSError, NSString};

// ---- primitives -----------------------------------------------------------

pub fn ns_string(value: &str) -> Retained<NSString> {
    NSString::from_str(value)
}

pub fn opt_string(value: Option<Retained<NSString>>) -> Option<String> {
    value.map(|s| s.to_string()).filter(|s| !s.is_empty())
}

pub fn ns_date(instant: DateTime<Utc>) -> Retained<NSDate> {
    let secs = instant.timestamp() as f64 + f64::from(instant.timestamp_subsec_nanos()) / 1e9;
    NSDate::dateWithTimeIntervalSince1970(secs)
}

pub fn instant(date: &NSDate) -> DateTime<Utc> {
    let secs = date.timeIntervalSince1970();
    let whole = secs.floor();
    let nanos = ((secs - whole) * 1e9).round() as u32;
    DateTime::from_timestamp(whole as i64, nanos.min(999_999_999)).unwrap_or_default()
}

pub fn error(err: &NSError) -> DomainError {
    DomainError::provider(format!(
        "{} ({}:{})",
        err.localizedDescription(),
        err.domain(),
        err.code()
    ))
}

/// Local midnight at the start of `date`.
pub fn local_midnight(date: NaiveDate) -> DateTime<Utc> {
    let naive = date.and_hms_opt(0, 0, 0).expect("midnight exists");
    Local
        .from_local_datetime(&naive)
        .earliest()
        .unwrap_or_else(|| Local.from_utc_datetime(&naive))
        .with_timezone(&Utc)
}

/// The last second of `date`, which is how EventKit ends all-day events.
pub fn local_end_of_day(date: NaiveDate) -> DateTime<Utc> {
    let naive = date.and_hms_opt(23, 59, 59).expect("time exists");
    Local
        .from_local_datetime(&naive)
        .latest()
        .unwrap_or_else(|| Local.from_utc_datetime(&naive))
        .with_timezone(&Utc)
}

pub fn local_date(instant: DateTime<Utc>) -> NaiveDate {
    instant.with_timezone(&Local).date_naive()
}

// ---- access ---------------------------------------------------------------

pub fn access_status(status: EKAuthorizationStatus) -> AccessStatus {
    match status {
        EKAuthorizationStatus::NotDetermined => AccessStatus::NotDetermined,
        EKAuthorizationStatus::FullAccess => AccessStatus::Full,
        EKAuthorizationStatus::WriteOnly => AccessStatus::WriteOnly,
        _ => AccessStatus::Denied,
    }
}

// ---- sources & calendars -----------------------------------------------------

pub fn source(source: &EKSource) -> Source {
    let kind = match unsafe { source.sourceType() } {
        EKSourceType::Local => SourceKind::Local,
        EKSourceType::Exchange => SourceKind::Exchange,
        EKSourceType::CalDAV => SourceKind::CalDav,
        EKSourceType::MobileMe => SourceKind::ICloud,
        EKSourceType::Subscribed => SourceKind::Subscribed,
        EKSourceType::Birthdays => SourceKind::Birthdays,
        _ => SourceKind::Other,
    };
    Source {
        id: SourceId::new(unsafe { source.sourceIdentifier() }.to_string()),
        title: unsafe { source.title() }.to_string(),
        kind,
    }
}

pub fn calendar(calendar: &EKCalendar, kind: CalendarKind) -> Calendar {
    let source_id = unsafe { calendar.source() }
        .map(|s| unsafe { s.sourceIdentifier() }.to_string())
        .unwrap_or_default();
    Calendar {
        id: CalendarId::new(unsafe { calendar.calendarIdentifier() }.to_string()),
        source_id: SourceId::new(source_id),
        title: unsafe { calendar.title() }.to_string(),
        color: calendar_color(calendar),
        kind,
        read_only: !unsafe { calendar.allowsContentModifications() },
    }
}

fn calendar_color(calendar: &EKCalendar) -> Color {
    let fallback = Color::from_rgb(0x8E, 0x8E, 0x93);
    let color = unsafe { calendar.color() };
    let srgb = NSColorSpace::sRGBColorSpace();
    let Some(rgb) = color.colorUsingColorSpace(&srgb) else {
        return fallback;
    };
    let channel = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    Color::from_rgb(
        channel(rgb.redComponent()),
        channel(rgb.greenComponent()),
        channel(rgb.blueComponent()),
    )
}

// ---- events ---------------------------------------------------------------

/// Encodes an occurrence identity. Recurring occurrences share an
/// `eventIdentifier`, so the occurrence date is appended to tell them apart.
pub fn event_id(event: &EKEvent) -> EventId {
    let base = unsafe { event.eventIdentifier() }
        .map(|s| s.to_string())
        .unwrap_or_default();
    match unsafe { event.occurrenceDate() } {
        Some(date) if unsafe { event.hasRecurrenceRules() } || unsafe { event.isDetached() } => {
            EventId::new(format!("{base}@{}", instant(&date).timestamp()))
        }
        _ => EventId::new(base),
    }
}

/// Splits an `EventId` back into `(eventIdentifier, occurrence instant)`.
pub fn parse_event_id(id: &EventId) -> (String, Option<DateTime<Utc>>) {
    match id.as_str().rsplit_once('@') {
        Some((base, ts)) => match ts.parse::<i64>() {
            Ok(secs) => (base.to_owned(), DateTime::from_timestamp(secs, 0)),
            Err(_) => (id.as_str().to_owned(), None),
        },
        None => (id.as_str().to_owned(), None),
    }
}

pub fn event(event: &EKEvent, read_only_calendar: bool) -> DomainResult<Event> {
    let start = instant(&*unsafe { event.startDate() });
    let end = instant(&*unsafe { event.endDate() });
    let time = if unsafe { event.isAllDay() } {
        let first = local_date(start);
        // EventKit ends all-day events at 23:59:59; some servers at next
        // midnight. Stepping back a second handles both.
        let last = local_date(end - chrono::Duration::seconds(1)).max(first);
        EventTime::AllDay(DateSpan::new(first, last)?)
    } else {
        // Zero-length events exist in the wild; give them a minute so they draw.
        let end = if end <= start {
            start + chrono::Duration::minutes(1)
        } else {
            end
        };
        EventTime::Timed(TimeRange::new(start, end)?)
    };
    let calendar_id = unsafe { event.calendar() }
        .map(|c| unsafe { c.calendarIdentifier() }.to_string())
        .unwrap_or_default();
    Ok(Event {
        id: event_id(event),
        calendar_id: CalendarId::new(calendar_id),
        title: unsafe { event.title() }.to_string(),
        time,
        location: opt_string(unsafe { event.location() }),
        notes: opt_string(unsafe { event.notes() }),
        url: unsafe { event.URL() }
            .and_then(|u| u.absoluteString())
            .map(|s| s.to_string()),
        is_recurring: unsafe { event.hasRecurrenceRules() } || unsafe { event.isDetached() },
        read_only: read_only_calendar,
    })
}

/// The `(start, end)` instants EventKit expects for an `EventTime`.
pub fn event_bounds(time: &EventTime) -> (DateTime<Utc>, DateTime<Utc>) {
    match time {
        EventTime::Timed(range) => (range.start(), range.end()),
        EventTime::AllDay(span) => (local_midnight(span.first()), local_end_of_day(span.last())),
    }
}

// ---- reminders --------------------------------------------------------------

pub fn reminder(reminder: &EKReminder) -> Reminder {
    let list_id = unsafe { reminder.calendar() }
        .map(|c| unsafe { c.calendarIdentifier() }.to_string())
        .unwrap_or_default();
    Reminder {
        id: ReminderId::new(unsafe { reminder.calendarItemIdentifier() }.to_string()),
        list_id: CalendarId::new(list_id),
        title: unsafe { reminder.title() }.to_string(),
        notes: opt_string(unsafe { reminder.notes() }),
        url: unsafe { reminder.URL() }
            .and_then(|u| u.absoluteString())
            .map(|s| s.to_string()),
        due: unsafe { reminder.dueDateComponents() }.and_then(|c| due(&c)),
        priority: Priority::from_rfc5545(unsafe { reminder.priority() } as u32),
        completed_at: unsafe { reminder.completionDate() }.map(|d| instant(&d)),
        is_recurring: unsafe { reminder.hasRecurrenceRules() },
    }
}

fn defined(value: isize) -> Option<isize> {
    (value != NSDateComponentUndefined).then_some(value)
}

pub fn due(components: &NSDateComponents) -> Option<Due> {
    let year = defined(components.year())?;
    let month = defined(components.month())?;
    let day = defined(components.day())?;
    let date = NaiveDate::from_ymd_opt(year as i32, month as u32, day as u32)?;
    let time = match (defined(components.hour()), defined(components.minute())) {
        (Some(h), m) => NaiveTime::from_hms_opt(h as u32, m.unwrap_or(0) as u32, 0),
        _ => None,
    };
    Some(Due { date, time })
}

pub fn due_components(due: &Due) -> Retained<NSDateComponents> {
    let components = NSDateComponents::new();
    components.setYear(i64::from(due.date.year()) as isize);
    components.setMonth(due.date.month() as isize);
    components.setDay(due.date.day() as isize);
    if let Some(time) = due.time {
        components.setHour(time.hour() as isize);
        components.setMinute(time.minute() as isize);
        components.setSecond(0);
    }
    components
}

/// The instant a timed due date refers to, for the alarm that makes macOS
/// actually notify the user. Date-only reminders get no alarm, like in
/// Reminders.app.
pub fn due_instant(due: &Due) -> Option<DateTime<Utc>> {
    let time = due.time?;
    let naive = due.date.and_time(time);
    Local
        .from_local_datetime(&naive)
        .earliest()
        .map(|d| d.with_timezone(&Utc))
}

use chrono::{Datelike, Timelike};
