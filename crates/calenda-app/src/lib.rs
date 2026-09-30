//! Application layer.
//!
//! Use cases live here. They orchestrate the domain ports (`CalendarProvider`)
//! and app-owned state (`Preferences`) but contain no platform code and no
//! presentation logic. The Tauri shell is a thin adapter over `AgendaService`.

mod preferences;
mod service;
mod workspace;

pub use preferences::{InMemoryPreferences, Preferences, PreferencesRepository};
pub use service::{AgendaService, SearchResults};
pub use workspace::Workspace;
