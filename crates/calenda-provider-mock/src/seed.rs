//! Seed data shaped like a realistic week, positioned around an anchor date so
//! the demo always looks "current".

use calenda_domain::{
    Calendar, CalendarId, CalendarKind, Color, DateSpan, Due, Event, EventId, EventTime, Priority,
    Reminder, ReminderId, Source, SourceId, SourceKind, TimeRange,
};
use chrono::{Datelike, Duration, Local, NaiveDate, NaiveTime, TimeZone, Utc};

use crate::MockProvider;

const ICLOUD: &str = "src-icloud";
const GOOGLE: &str = "src-google";
const SUBSCRIBED: &str = "src-subscribed";

const CAL_PERSONAL: &str = "cal-personal";
const CAL_WORK: &str = "cal-work";
const CAL_FAMILY: &str = "cal-family";
const CAL_HEALTH: &str = "cal-health";
const CAL_BIRTHDAYS: &str = "cal-birthdays";

const LIST_PERSONAL: &str = "list-personal";
const LIST_WORK: &str = "list-work";
const LIST_TRAVEL: &str = "list-travel";
const LIST_HEALTH: &str = "list-health";
const LIST_HOME: &str = "list-home";
const LIST_LEARNING: &str = "list-learning";

fn source(id: &str, title: &str, kind: SourceKind) -> Source {
    Source {
        id: SourceId::new(id),
        title: title.into(),
        kind,
    }
}

fn calendar(
    id: &str,
    source: &str,
    title: &str,
    hex: &str,
    kind: CalendarKind,
    read_only: bool,
) -> Calendar {
    Calendar {
        id: CalendarId::new(id),
        source_id: SourceId::new(source),
        title: title.into(),
        color: Color::from_hex(hex).expect("seed colour"),
        kind,
        read_only,
    }
}

/// Fills `provider` with sources, calendars, a week of events around `anchor`
/// and a handful of reminders due around it.
pub fn seed_for(provider: &MockProvider, anchor: NaiveDate) {
    let sources = vec![
        source(ICLOUD, "iCloud", SourceKind::ICloud),
        source(GOOGLE, "Google", SourceKind::CalDav),
        source(SUBSCRIBED, "Other", SourceKind::Birthdays),
    ];
    let calendars = vec![
        calendar(
            CAL_PERSONAL,
            ICLOUD,
            "Personal",
            "#3478F6",
            CalendarKind::Events,
            false,
        ),
        calendar(
            CAL_WORK,
            GOOGLE,
            "Work",
            "#A259E6",
            CalendarKind::Events,
            false,
        ),
        calendar(
            CAL_FAMILY,
            ICLOUD,
            "Family",
            "#34C759",
            CalendarKind::Events,
            false,
        ),
        calendar(
            CAL_HEALTH,
            ICLOUD,
            "Health",
            "#FF6B9D",
            CalendarKind::Events,
            false,
        ),
        calendar(
            CAL_BIRTHDAYS,
            SUBSCRIBED,
            "Birthdays",
            "#FF7AB6",
            CalendarKind::Events,
            true,
        ),
        calendar(
            LIST_PERSONAL,
            ICLOUD,
            "Personal",
            "#3478F6",
            CalendarKind::Reminders,
            false,
        ),
        calendar(
            LIST_WORK,
            ICLOUD,
            "Work",
            "#A259E6",
            CalendarKind::Reminders,
            false,
        ),
        calendar(
            LIST_TRAVEL,
            ICLOUD,
            "Travel",
            "#30B0C7",
            CalendarKind::Reminders,
            false,
        ),
        calendar(
            LIST_HEALTH,
            ICLOUD,
            "Health",
            "#34C759",
            CalendarKind::Reminders,
            false,
        ),
        calendar(
            LIST_HOME,
            ICLOUD,
            "Home",
            "#FF9F0A",
            CalendarKind::Reminders,
            false,
        ),
        calendar(
            LIST_LEARNING,
            ICLOUD,
            "Learning",
            "#5AC8A8",
            CalendarKind::Reminders,
            false,
        ),
    ];

    // The seed is laid out against the week containing the anchor.
    let monday = anchor - Duration::days(anchor.weekday().num_days_from_monday() as i64);
    let day = |offset: i64| monday + Duration::days(offset);

    let mut events = Vec::new();
    let mut push_timed = |cal: &str,
                          title: &str,
                          d: i64,
                          from: (u32, u32),
                          to: (u32, u32),
                          location: Option<&str>| {
        let start = local(day(d), from.0, from.1);
        let end = local(day(d), to.0, to.1);
        events.push(Event {
            id: EventId::new(format!("evt-{}", events.len() + 1)),
            calendar_id: CalendarId::new(cal),
            title: title.into(),
            time: EventTime::Timed(TimeRange::new(start, end).expect("seed range")),
            location: location.map(str::to_owned),
            notes: None,
            url: None,
            is_recurring: false,
            read_only: false,
        });
    };

    push_timed(CAL_PERSONAL, "Team sync", 0, (10, 0), (11, 0), Some("Zoom"));
    push_timed(
        CAL_WORK,
        "Call with client",
        0,
        (14, 0),
        (15, 0),
        Some("Google Meet"),
    );
    push_timed(CAL_PERSONAL, "Movie", 0, (20, 0), (21, 30), Some("Cinema"));
    push_timed(
        CAL_WORK,
        "Design review",
        1,
        (11, 0),
        (12, 0),
        Some("Office"),
    );
    push_timed(CAL_FAMILY, "Gym", 1, (17, 30), (18, 30), None);
    push_timed(CAL_HEALTH, "Yoga", 2, (9, 0), (10, 0), None);
    push_timed(
        CAL_FAMILY,
        "Lunch with Anna",
        2,
        (12, 0),
        (13, 0),
        Some("Cafe Milan"),
    );
    push_timed(CAL_PERSONAL, "Write proposal", 2, (16, 0), (17, 0), None);
    push_timed(
        CAL_WORK,
        "Dinner with Alex",
        3,
        (18, 30),
        (20, 0),
        Some("Bistro Noel"),
    );
    push_timed(
        CAL_PERSONAL,
        "Product planning",
        4,
        (10, 0),
        (11, 30),
        Some("Room B"),
    );
    push_timed(CAL_WORK, "Interview", 4, (14, 0), (15, 0), Some("Zoom"));
    push_timed(
        CAL_FAMILY,
        "Family time",
        6,
        (15, 0),
        (17, 0),
        Some("At home"),
    );

    let all_day = |id: &str, cal: &str, title: &str, from: i64, to: i64, read_only: bool| Event {
        id: EventId::new(id),
        calendar_id: CalendarId::new(cal),
        title: title.into(),
        time: EventTime::AllDay(DateSpan::new(day(from), day(to)).expect("seed span")),
        location: None,
        notes: None,
        url: None,
        is_recurring: read_only,
        read_only,
    };
    events.push(all_day(
        "evt-vacation",
        CAL_FAMILY,
        "🏝️ Vacation",
        0,
        1,
        false,
    ));
    events.push(all_day(
        "evt-birthday",
        CAL_BIRTHDAYS,
        "🎂 Mom's birthday",
        2,
        2,
        true,
    ));
    events.push(all_day(
        "evt-berlin",
        CAL_PERSONAL,
        "📍 Berlin",
        5,
        6,
        false,
    ));

    let reminder =
        |id: &str, list: &str, title: &str, due: Option<Due>, priority: Priority, done: bool| {
            Reminder {
                id: ReminderId::new(id),
                list_id: CalendarId::new(list),
                title: title.into(),
                notes: None,
                url: None,
                due,
                priority,
                completed_at: done.then(|| Utc::now() - Duration::hours(2)),
                is_recurring: false,
            }
        };
    let t = |h: u32, m: u32| NaiveTime::from_hms_opt(h, m, 0).expect("seed time");
    let reminders = vec![
        reminder(
            "rem-1",
            LIST_WORK,
            "Review design mockups",
            Some(Due::at(anchor, t(9, 0))),
            Priority::High,
            false,
        ),
        reminder(
            "rem-2",
            LIST_WORK,
            "Call with client",
            Some(Due::at(anchor, t(14, 0))),
            Priority::None,
            false,
        ),
        reminder(
            "rem-3",
            LIST_PERSONAL,
            "Buy birthday gift",
            Some(Due::on(anchor)),
            Priority::None,
            false,
        ),
        reminder(
            "rem-4",
            LIST_PERSONAL,
            "Plan weekend trip",
            Some(Due::on(anchor)),
            Priority::None,
            false,
        ),
        reminder(
            "rem-5",
            LIST_WORK,
            "Write proposal",
            Some(Due::on(anchor)),
            Priority::None,
            false,
        ),
        reminder(
            "rem-6",
            LIST_PERSONAL,
            "Return library book",
            Some(Due::on(anchor - Duration::days(1))),
            Priority::Medium,
            false,
        ),
        reminder(
            "rem-7",
            LIST_TRAVEL,
            "Book flight to Berlin",
            Some(Due::on(anchor + Duration::days(2))),
            Priority::None,
            false,
        ),
        reminder(
            "rem-8",
            LIST_WORK,
            "Prepare presentation",
            Some(Due::on(anchor + Duration::days(5))),
            Priority::High,
            false,
        ),
        reminder(
            "rem-9",
            LIST_HEALTH,
            "Renew gym membership",
            Some(Due::on(anchor + Duration::days(6))),
            Priority::None,
            false,
        ),
        reminder(
            "rem-10",
            LIST_PERSONAL,
            "Order new keyboard",
            Some(Due::on(anchor + Duration::days(7))),
            Priority::None,
            false,
        ),
        reminder(
            "rem-11",
            LIST_LEARNING,
            "Learn Rust",
            None,
            Priority::Low,
            false,
        ),
        reminder(
            "rem-12",
            LIST_HOME,
            "Pay phone bill",
            Some(Due::on(anchor)),
            Priority::None,
            true,
        ),
        reminder(
            "rem-13",
            LIST_WORK,
            "Send team feedback",
            Some(Due::on(anchor)),
            Priority::None,
            true,
        ),
        reminder(
            "rem-14",
            LIST_LEARNING,
            "Read new article",
            Some(Due::on(anchor)),
            Priority::None,
            true,
        ),
    ];

    {
        let mut state = provider.state.write().unwrap();
        state.sources = sources;
        state.calendars = calendars;
        for e in events {
            state.events.insert(e.id.clone(), e);
        }
        for r in reminders {
            state.reminders.insert(r.id.clone(), r);
        }
    }
}

/// Local wall-clock time on `date`, as a UTC instant.
fn local(date: NaiveDate, hour: u32, minute: u32) -> chrono::DateTime<Utc> {
    let naive = date.and_hms_opt(hour, minute, 0).expect("seed time");
    Local
        .from_local_datetime(&naive)
        .single()
        .unwrap_or_else(|| Local.from_utc_datetime(&naive))
        .with_timezone(&Utc)
}
