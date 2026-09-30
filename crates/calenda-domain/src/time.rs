//! Time value objects.
//!
//! Timed things are stored as UTC instants; the presentation layer converts to
//! the user's zone. All-day things are stored as civil dates without a zone, as
//! an all-day event on 2 October is on 2 October wherever you open the app.

use chrono::{DateTime, Duration, NaiveDate, Utc};

use crate::error::{DomainError, DomainResult};

/// A half-open instant range `[start, end)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct TimeRange {
    start: DateTime<Utc>,
    end: DateTime<Utc>,
}

impl TimeRange {
    pub fn new(start: DateTime<Utc>, end: DateTime<Utc>) -> DomainResult<Self> {
        if end <= start {
            return Err(DomainError::invalid("time range must end after it starts"));
        }
        Ok(Self { start, end })
    }

    pub fn start(&self) -> DateTime<Utc> {
        self.start
    }

    pub fn end(&self) -> DateTime<Utc> {
        self.end
    }

    pub fn duration(&self) -> Duration {
        self.end - self.start
    }

    pub fn contains(&self, instant: DateTime<Utc>) -> bool {
        self.start <= instant && instant < self.end
    }

    pub fn overlaps(&self, other: &TimeRange) -> bool {
        self.start < other.end && other.start < self.end
    }

    /// Moves the range so it starts at `start`, preserving its duration.
    pub fn moved_to(&self, start: DateTime<Utc>) -> Self {
        Self {
            start,
            end: start + self.duration(),
        }
    }
}

/// An inclusive civil date span `[first, last]`, used by all-day events.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DateSpan {
    first: NaiveDate,
    last: NaiveDate,
}

impl DateSpan {
    pub fn new(first: NaiveDate, last: NaiveDate) -> DomainResult<Self> {
        if last < first {
            return Err(DomainError::invalid(
                "date span must not end before it starts",
            ));
        }
        Ok(Self { first, last })
    }

    pub fn single(day: NaiveDate) -> Self {
        Self {
            first: day,
            last: day,
        }
    }

    pub fn first(&self) -> NaiveDate {
        self.first
    }

    pub fn last(&self) -> NaiveDate {
        self.last
    }

    /// Number of calendar days covered (at least 1).
    pub fn days(&self) -> i64 {
        (self.last - self.first).num_days() + 1
    }

    pub fn contains(&self, day: NaiveDate) -> bool {
        self.first <= day && day <= self.last
    }

    pub fn overlaps(&self, other: &DateSpan) -> bool {
        self.first <= other.last && other.first <= self.last
    }

    /// Moves the span so it begins on `first`, preserving its length.
    pub fn moved_to(&self, first: NaiveDate) -> Self {
        Self {
            first,
            last: first + Duration::days(self.days() - 1),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    fn utc(y: i32, m: u32, d: u32, h: u32) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(y, m, d, h, 0, 0).unwrap()
    }

    #[test]
    fn time_range_rejects_empty_or_inverted() {
        let t = utc(2026, 9, 30, 10);
        assert!(TimeRange::new(t, t).is_err());
        assert!(TimeRange::new(t, t - Duration::hours(1)).is_err());
        assert!(TimeRange::new(t, t + Duration::minutes(1)).is_ok());
    }

    #[test]
    fn time_range_overlap_is_half_open() {
        let a = TimeRange::new(utc(2026, 9, 30, 10), utc(2026, 9, 30, 11)).unwrap();
        let b = TimeRange::new(utc(2026, 9, 30, 11), utc(2026, 9, 30, 12)).unwrap();
        let c = TimeRange::new(utc(2026, 9, 30, 10), utc(2026, 9, 30, 10)).is_err();
        assert!(!a.overlaps(&b));
        assert!(c);
        assert!(a.contains(utc(2026, 9, 30, 10)));
        assert!(!a.contains(utc(2026, 9, 30, 11)));
    }

    #[test]
    fn moving_preserves_duration() {
        let a = TimeRange::new(utc(2026, 9, 30, 10), utc(2026, 9, 30, 11)).unwrap();
        let moved = a.moved_to(utc(2026, 10, 1, 15));
        assert_eq!(moved.end(), utc(2026, 10, 1, 16));
    }

    #[test]
    fn date_span_days_and_move() {
        let span = DateSpan::new(
            NaiveDate::from_ymd_opt(2026, 9, 28).unwrap(),
            NaiveDate::from_ymd_opt(2026, 9, 29).unwrap(),
        )
        .unwrap();
        assert_eq!(span.days(), 2);
        let moved = span.moved_to(NaiveDate::from_ymd_opt(2026, 10, 5).unwrap());
        assert_eq!(moved.last(), NaiveDate::from_ymd_opt(2026, 10, 6).unwrap());
        assert!(DateSpan::new(span.last(), span.first()).is_err());
    }
}
