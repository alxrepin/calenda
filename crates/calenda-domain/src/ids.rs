//! Opaque identifiers.
//!
//! Identifiers are provider-issued strings (EventKit uses UUID-like strings, a
//! CalDAV provider would use hrefs). The domain never inspects them; the newtypes
//! only stop an `EventId` from being passed where a `CalendarId` is expected.

use std::fmt;

macro_rules! string_id {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self(value)
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self(value.to_owned())
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(&self.0)
            }
        }
    };
}

string_id!(
    /// Identifies an account-level source (iCloud, Google, Exchange, local...).
    SourceId
);
string_id!(
    /// Identifies an event calendar or a reminder list.
    CalendarId
);
string_id!(
    /// Identifies a single event occurrence.
    ///
    /// For recurring events the provider may encode the occurrence date into the
    /// identifier; the domain treats it as opaque either way.
    EventId
);
string_id!(
    /// Identifies a reminder.
    ReminderId
);
