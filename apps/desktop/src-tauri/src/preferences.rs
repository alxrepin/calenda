//! `PreferencesRepository` backed by a JSON file in the app's config directory.

use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use calenda_app::{Preferences, PreferencesRepository};
use calenda_domain::{CalendarId, DomainError, DomainResult};
use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct StoredPreferences {
    hidden_calendars: BTreeSet<String>,
    show_reminders_in_grid: bool,
}

impl From<&Preferences> for StoredPreferences {
    fn from(p: &Preferences) -> Self {
        Self {
            hidden_calendars: p.hidden_calendars.iter().map(ToString::to_string).collect(),
            show_reminders_in_grid: p.show_reminders_in_grid,
        }
    }
}

impl From<StoredPreferences> for Preferences {
    fn from(s: StoredPreferences) -> Self {
        Self {
            hidden_calendars: s
                .hidden_calendars
                .into_iter()
                .map(CalendarId::new)
                .collect(),
            show_reminders_in_grid: s.show_reminders_in_grid,
        }
    }
}

pub struct JsonFilePreferences {
    path: PathBuf,
    /// Serialises writers so two quick toggles cannot interleave.
    lock: Mutex<()>,
}

impl JsonFilePreferences {
    pub fn in_app_config(app: &tauri::AppHandle) -> tauri::Result<Self> {
        let dir = app.path().app_config_dir()?;
        Ok(Self::at(dir.join("preferences.json")))
    }

    pub fn at(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }
}

impl PreferencesRepository for JsonFilePreferences {
    fn load(&self) -> DomainResult<Preferences> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        match fs::read(&self.path) {
            Ok(bytes) => serde_json::from_slice::<StoredPreferences>(&bytes)
                .map(Preferences::from)
                .map_err(|e| DomainError::provider(format!("preferences file is corrupt: {e}"))),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Preferences::default()),
            Err(e) => Err(DomainError::provider(format!(
                "cannot read preferences: {e}"
            ))),
        }
    }

    fn save(&self, preferences: &Preferences) -> DomainResult<()> {
        let _guard = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| DomainError::provider(format!("cannot create config dir: {e}")))?;
        }
        let json = serde_json::to_vec_pretty(&StoredPreferences::from(preferences))
            .map_err(|e| DomainError::provider(e.to_string()))?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json)
            .map_err(|e| DomainError::provider(format!("cannot write preferences: {e}")))?;
        fs::rename(&tmp, &self.path)
            .map_err(|e| DomainError::provider(format!("cannot save preferences: {e}")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_disk() {
        let dir = std::env::temp_dir().join(format!("calenda-prefs-{}", std::process::id()));
        let repo = JsonFilePreferences::at(dir.join("preferences.json"));
        assert_eq!(repo.load().unwrap(), Preferences::default());

        let mut prefs = Preferences::default();
        prefs.hidden_calendars.insert(CalendarId::new("a"));
        prefs.show_reminders_in_grid = true;
        repo.save(&prefs).unwrap();
        assert_eq!(repo.load().unwrap(), prefs);
        let _ = fs::remove_dir_all(dir);
    }
}
