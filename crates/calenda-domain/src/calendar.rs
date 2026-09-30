//! Sources, calendars and access.

use crate::error::{DomainError, DomainResult};
use crate::ids::{CalendarId, SourceId};

/// Where a calendar comes from: an account or the local machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SourceKind {
    Local,
    ICloud,
    Exchange,
    CalDav,
    Subscribed,
    Birthdays,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Source {
    pub id: SourceId,
    pub title: String,
    pub kind: SourceKind,
}

/// Whether a calendar holds events (blocks of time) or reminders (actions).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CalendarKind {
    Events,
    Reminders,
}

/// An sRGB colour in `#RRGGBB` form.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Color(String);

impl Color {
    pub fn from_hex(hex: &str) -> DomainResult<Self> {
        let body = hex.strip_prefix('#').unwrap_or(hex);
        let valid = body.len() == 6 && body.chars().all(|c| c.is_ascii_hexdigit());
        if !valid {
            return Err(DomainError::invalid(format!("not a #RRGGBB colour: {hex}")));
        }
        Ok(Self(format!("#{}", body.to_ascii_uppercase())))
    }

    pub fn from_rgb(r: u8, g: u8, b: u8) -> Self {
        Self(format!("#{r:02X}{g:02X}{b:02X}"))
    }

    pub fn as_hex(&self) -> &str {
        &self.0
    }
}

/// An event calendar or a reminder list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Calendar {
    pub id: CalendarId,
    pub source_id: SourceId,
    pub title: String,
    pub color: Color,
    pub kind: CalendarKind,
    /// True when the provider will refuse writes (subscribed or shared read-only).
    pub read_only: bool,
}

/// Authorisation state for one entity type, as the platform reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccessStatus {
    /// The user has not been asked yet.
    NotDetermined,
    /// Explicitly denied, or restricted by policy. The app must send the user to
    /// system settings; it cannot ask again.
    Denied,
    /// Can write but not read (macOS "add only" permission).
    WriteOnly,
    Full,
}

impl AccessStatus {
    pub fn can_read(self) -> bool {
        matches!(self, AccessStatus::Full)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colour_parsing_normalises_case_and_prefix() {
        assert_eq!(Color::from_hex("ff8800").unwrap().as_hex(), "#FF8800");
        assert_eq!(Color::from_hex("#ff8800").unwrap().as_hex(), "#FF8800");
        assert!(Color::from_hex("#ff88").is_err());
        assert!(Color::from_hex("#gg8800").is_err());
        assert_eq!(Color::from_rgb(255, 136, 0).as_hex(), "#FF8800");
    }
}
