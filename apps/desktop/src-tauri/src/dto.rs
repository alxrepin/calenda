//! Wire types for the webview. Kept apart from the domain so JSON shape can
//! change without touching it, and so the domain stays serde-free.

use calenda_app::{Preferences, SearchResults, Workspace};
use calenda_domain::{
    AccessStatus, Calendar, CalendarId, CalendarKind, DateSpan, DomainError, DomainResult,
    Due, Event, EventDraft, EventId, EventTime, Priority, RecurrenceScope, Reminder,
    ReminderDraft, Source, SourceKind, TimeRange,
};
use chrono::{DateTime, NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};

// ---- errors ---------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub kind: &'static str,
    pub message: String,
}

impl From<DomainError> for CommandError {
    fn from(err: DomainError) -> Self {
        let kind = match err {
            DomainError::AccessDenied { .. } => "accessDenied",
            DomainError::NotFound { .. } => "notFound",
            DomainError::ReadOnly { .. } => "readOnly",
            DomainError::Invalid(_) => "invalid",
            DomainError::Provider(_) => "provider",
        };
        Self { kind, message: err.to_string() }
    }
}

impl From<tauri::Error> for CommandError {
    fn from(err: tauri::Error) -> Self {
        Self { kind: "shell", message: err.to_string() }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;

// ---- workspace --------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AccessStatusDto {
    NotDetermined,
    Denied,
    WriteOnly,
    Full,
}

impl From<AccessStatus> for AccessStatusDto {
    fn from(s: AccessStatus) -> Self {
        match s {
            AccessStatus::NotDetermined => Self::NotDetermined,
            AccessStatus::Denied => Self::Denied,
            AccessStatus::WriteOnly => Self::WriteOnly,
            AccessStatus::Full => Self::Full,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SourceKindDto {
    Local,
    ICloud,
    Exchange,
    CalDav,
    Subscribed,
    Birthdays,
    Other,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDto {
    pub id: String,
    pub title: String,
    pub kind: SourceKindDto,
}

impl From<Source> for SourceDto {
    fn from(s: Source) -> Self {
        let kind = match s.kind {
            SourceKind::Local => SourceKindDto::Local,
            SourceKind::ICloud => SourceKindDto::ICloud,
            SourceKind::Exchange => SourceKindDto::Exchange,
            SourceKind::CalDav => SourceKindDto::CalDav,
            SourceKind::Subscribed => SourceKindDto::Subscribed,
            SourceKind::Birthdays => SourceKindDto::Birthdays,
            SourceKind::Other => SourceKindDto::Other,
        };
        Self { id: s.id.to_string(), title: s.title, kind }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum CalendarKindDto {
    Events,
    Reminders,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDto {
    pub id: String,
    pub source_id: String,
    pub title: String,
    pub color: String,
    pub kind: CalendarKindDto,
    pub read_only: bool,
}

impl From<Calendar> for CalendarDto {
    fn from(c: Calendar) -> Self {
        Self {
            id: c.id.to_string(),
            source_id: c.source_id.to_string(),
            title: c.title,
            color: c.color.as_hex().to_owned(),
            kind: match c.kind {
                CalendarKind::Events => CalendarKindDto::Events,
                CalendarKind::Reminders => CalendarKindDto::Reminders,
            },
            read_only: c.read_only,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreferencesDto {
    pub hidden_calendars: Vec<String>,
    pub show_reminders_in_grid: bool,
}

impl From<Preferences> for PreferencesDto {
    fn from(p: Preferences) -> Self {
        Self {
            hidden_calendars: p.hidden_calendars.iter().map(ToString::to_string).collect(),
            show_reminders_in_grid: p.show_reminders_in_grid,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceDto {
    pub provider_name: String,
    pub event_access: AccessStatusDto,
    pub reminder_access: AccessStatusDto,
    pub sources: Vec<SourceDto>,
    pub calendars: Vec<CalendarDto>,
    pub preferences: PreferencesDto,
}

impl WorkspaceDto {
    pub fn new(provider_name: &str, w: Workspace) -> Self {
        Self {
            provider_name: provider_name.to_owned(),
            event_access: w.event_access.into(),
            reminder_access: w.reminder_access.into(),
            sources: w.sources.into_iter().map(Into::into).collect(),
            calendars: w.calendars.into_iter().map(Into::into).collect(),
            preferences: w.preferences.into(),
        }
    }
}

// ---- time -------------------------------------------------------------------

const DATE_FORMAT: &str = "%Y-%m-%d";
const TIME_FORMAT: &str = "%H:%M";

pub fn parse_instant(value: &str) -> DomainResult<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .map(|d| d.with_timezone(&Utc))
        .map_err(|e| DomainError::invalid(format!("bad timestamp {value:?}: {e}")))
}

pub fn parse_date(value: &str) -> DomainResult<NaiveDate> {
    NaiveDate::parse_from_str(value, DATE_FORMAT).map_err(|e| DomainError::invalid(format!("bad date {value:?}: {e}")))
}

fn parse_time(value: &str) -> DomainResult<NaiveTime> {
    NaiveTime::parse_from_str(value, TIME_FORMAT)
        .or_else(|_| NaiveTime::parse_from_str(value, "%H:%M:%S"))
        .map_err(|e| DomainError::invalid(format!("bad time {value:?}: {e}")))
}

fn format_instant(value: DateTime<Utc>) -> String {
    value.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EventTimeDto {
    #[serde(rename_all = "camelCase")]
    Timed { start: String, end: String },
    #[serde(rename_all = "camelCase")]
    AllDay { first: String, last: String },
}

impl From<&EventTime> for EventTimeDto {
    fn from(t: &EventTime) -> Self {
        match t {
            EventTime::Timed(r) => Self::Timed { start: format_instant(r.start()), end: format_instant(r.end()) },
            EventTime::AllDay(s) => Self::AllDay {
                first: s.first().format(DATE_FORMAT).to_string(),
                last: s.last().format(DATE_FORMAT).to_string(),
            },
        }
    }
}

impl TryFrom<EventTimeDto> for EventTime {
    type Error = DomainError;

    fn try_from(t: EventTimeDto) -> DomainResult<Self> {
        Ok(match t {
            EventTimeDto::Timed { start, end } => {
                EventTime::Timed(TimeRange::new(parse_instant(&start)?, parse_instant(&end)?)?)
            }
            EventTimeDto::AllDay { first, last } => {
                EventTime::AllDay(DateSpan::new(parse_date(&first)?, parse_date(&last)?)?)
            }
        })
    }
}

// ---- events ---------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EventDto {
    pub id: String,
    pub calendar_id: String,
    pub title: String,
    pub time: EventTimeDto,
    pub location: Option<String>,
    pub notes: Option<String>,
    pub url: Option<String>,
    pub is_recurring: bool,
    pub read_only: bool,
}

impl From<Event> for EventDto {
    fn from(e: Event) -> Self {
        Self {
            id: e.id.to_string(),
            calendar_id: e.calendar_id.to_string(),
            title: e.title,
            time: (&e.time).into(),
            location: e.location,
            notes: e.notes,
            url: e.url,
            is_recurring: e.is_recurring,
            read_only: e.read_only,
        }
    }
}

impl TryFrom<EventDto> for Event {
    type Error = DomainError;

    fn try_from(e: EventDto) -> DomainResult<Self> {
        Ok(Self {
            id: EventId::new(e.id),
            calendar_id: CalendarId::new(e.calendar_id),
            title: e.title,
            time: e.time.try_into()?,
            location: e.location,
            notes: e.notes,
            url: e.url,
            is_recurring: e.is_recurring,
            read_only: e.read_only,
        })
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDraftDto {
    pub calendar_id: String,
    pub title: String,
    pub time: EventTimeDto,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
}

impl TryFrom<EventDraftDto> for EventDraft {
    type Error = DomainError;

    fn try_from(d: EventDraftDto) -> DomainResult<Self> {
        Ok(Self {
            calendar_id: CalendarId::new(d.calendar_id),
            title: d.title,
            time: d.time.try_into()?,
            location: d.location,
            notes: d.notes,
            url: d.url,
        })
    }
}

#[derive(Debug, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum RecurrenceScopeDto {
    ThisOccurrence,
    ThisAndFuture,
}

impl From<RecurrenceScopeDto> for RecurrenceScope {
    fn from(s: RecurrenceScopeDto) -> Self {
        match s {
            RecurrenceScopeDto::ThisOccurrence => Self::ThisOccurrence,
            RecurrenceScopeDto::ThisAndFuture => Self::ThisAndFuture,
        }
    }
}

// ---- reminders --------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DueDto {
    pub date: String,
    #[serde(default)]
    pub time: Option<String>,
}

impl From<Due> for DueDto {
    fn from(d: Due) -> Self {
        Self { date: d.date.format(DATE_FORMAT).to_string(), time: d.time.map(|t| t.format(TIME_FORMAT).to_string()) }
    }
}

impl TryFrom<DueDto> for Due {
    type Error = DomainError;

    fn try_from(d: DueDto) -> DomainResult<Self> {
        Ok(Self { date: parse_date(&d.date)?, time: d.time.as_deref().map(parse_time).transpose()? })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum PriorityDto {
    None,
    Low,
    Medium,
    High,
}

impl From<Priority> for PriorityDto {
    fn from(p: Priority) -> Self {
        match p {
            Priority::None => Self::None,
            Priority::Low => Self::Low,
            Priority::Medium => Self::Medium,
            Priority::High => Self::High,
        }
    }
}

impl From<PriorityDto> for Priority {
    fn from(p: PriorityDto) -> Self {
        match p {
            PriorityDto::None => Self::None,
            PriorityDto::Low => Self::Low,
            PriorityDto::Medium => Self::Medium,
            PriorityDto::High => Self::High,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDto {
    pub id: String,
    pub list_id: String,
    pub title: String,
    pub notes: Option<String>,
    pub url: Option<String>,
    pub due: Option<DueDto>,
    pub priority: PriorityDto,
    pub completed_at: Option<String>,
    pub is_recurring: bool,
}

impl From<Reminder> for ReminderDto {
    fn from(r: Reminder) -> Self {
        Self {
            id: r.id.to_string(),
            list_id: r.list_id.to_string(),
            title: r.title,
            notes: r.notes,
            url: r.url,
            due: r.due.map(Into::into),
            priority: r.priority.into(),
            completed_at: r.completed_at.map(format_instant),
            is_recurring: r.is_recurring,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderDraftDto {
    pub list_id: String,
    pub title: String,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub due: Option<DueDto>,
    #[serde(default = "default_priority")]
    pub priority: PriorityDto,
}

fn default_priority() -> PriorityDto {
    PriorityDto::None
}

impl TryFrom<ReminderDraftDto> for ReminderDraft {
    type Error = DomainError;

    fn try_from(d: ReminderDraftDto) -> DomainResult<Self> {
        Ok(Self {
            list_id: CalendarId::new(d.list_id),
            title: d.title,
            notes: d.notes,
            url: d.url,
            due: d.due.map(Due::try_from).transpose()?,
            priority: d.priority.into(),
        })
    }
}

// ---- search -----------------------------------------------------------------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResultsDto {
    pub events: Vec<EventDto>,
    pub reminders: Vec<ReminderDto>,
}

impl From<SearchResults> for SearchResultsDto {
    fn from(r: SearchResults) -> Self {
        Self {
            events: r.events.into_iter().map(Into::into).collect(),
            reminders: r.reminders.into_iter().map(Into::into).collect(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_time_round_trips() {
        let timed = EventTimeDto::Timed { start: "2026-09-30T10:00:00Z".into(), end: "2026-09-30T11:00:00Z".into() };
        let domain: EventTime = timed.try_into().unwrap();
        let back: EventTimeDto = (&domain).into();
        assert_eq!(serde_json::to_string(&back).unwrap(), r#"{"kind":"timed","start":"2026-09-30T10:00:00Z","end":"2026-09-30T11:00:00Z"}"#);

        let all_day = EventTimeDto::AllDay { first: "2026-09-28".into(), last: "2026-09-29".into() };
        let domain: EventTime = all_day.try_into().unwrap();
        assert!(domain.is_all_day());
    }

    #[test]
    fn invalid_dates_become_invalid_errors() {
        let bad = EventTimeDto::AllDay { first: "2026-09-30".into(), last: "2026-09-29".into() };
        assert!(matches!(EventTime::try_from(bad), Err(DomainError::Invalid(_))));
        let bad = EventTimeDto::Timed { start: "nope".into(), end: "2026-09-30T11:00:00Z".into() };
        assert!(matches!(EventTime::try_from(bad), Err(DomainError::Invalid(_))));
    }

    #[test]
    fn due_accepts_missing_time() {
        let json = r#"{"date":"2026-10-02"}"#;
        let due: Due = serde_json::from_str::<DueDto>(json).unwrap().try_into().unwrap();
        assert_eq!(due.time, None);
        let json = r#"{"date":"2026-10-02","time":"14:30"}"#;
        let due: Due = serde_json::from_str::<DueDto>(json).unwrap().try_into().unwrap();
        assert_eq!(due.time.unwrap().format("%H:%M").to_string(), "14:30");
    }
}
