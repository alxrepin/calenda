use calenda_domain::{AccessStatus, Calendar, Source};

use crate::preferences::Preferences;

/// Everything the UI needs to draw the sidebar and decide what to query.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Workspace {
    pub event_access: AccessStatus,
    pub reminder_access: AccessStatus,
    pub sources: Vec<Source>,
    pub calendars: Vec<Calendar>,
    pub preferences: Preferences,
}

impl Workspace {
    /// Calendars the user has not hidden, in provider order.
    pub fn visible_calendars(&self) -> impl Iterator<Item = &Calendar> {
        self.calendars
            .iter()
            .filter(|c| !self.preferences.hidden_calendars.contains(&c.id))
    }
}
