use std::collections::BTreeSet;
use std::sync::RwLock;

use calenda_domain::{CalendarId, DomainResult};

/// User preferences owned by this app (as opposed to data owned by the
/// calendar provider).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Preferences {
    /// Calendars and lists the user switched off in the sidebar.
    pub hidden_calendars: BTreeSet<CalendarId>,
    /// Whether reminders with a due time should also be drawn in the time grid.
    pub show_reminders_in_grid: bool,
}

/// Port for persisting `Preferences`. The desktop shell stores them as a JSON
/// file; tests use `InMemoryPreferences`.
pub trait PreferencesRepository: Send + Sync {
    fn load(&self) -> DomainResult<Preferences>;
    fn save(&self, preferences: &Preferences) -> DomainResult<()>;
}

#[derive(Debug, Default)]
pub struct InMemoryPreferences {
    inner: RwLock<Preferences>,
}

impl InMemoryPreferences {
    pub fn new(preferences: Preferences) -> Self {
        Self { inner: RwLock::new(preferences) }
    }
}

impl PreferencesRepository for InMemoryPreferences {
    fn load(&self) -> DomainResult<Preferences> {
        Ok(self.inner.read().expect("preferences lock poisoned").clone())
    }

    fn save(&self, preferences: &Preferences) -> DomainResult<()> {
        *self.inner.write().expect("preferences lock poisoned") = preferences.clone();
        Ok(())
    }
}
