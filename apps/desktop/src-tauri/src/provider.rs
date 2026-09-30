//! Chooses the `CalendarProvider` for this process.
//!
//! * macOS: EventKit, unless `CALENDA_PROVIDER=mock`.
//! * everything else: the in-memory mock, seeded around today.

use std::sync::Arc;

use calenda_domain::CalendarProvider;

pub fn build() -> Arc<dyn CalendarProvider> {
    let requested = std::env::var("CALENDA_PROVIDER").unwrap_or_default();
    if requested.eq_ignore_ascii_case("mock") {
        return mock();
    }
    native().unwrap_or_else(|| {
        if !requested.is_empty() {
            log::warn!("unknown CALENDA_PROVIDER={requested}, falling back");
        }
        mock()
    })
}

fn mock() -> Arc<dyn CalendarProvider> {
    let today = chrono::Local::now().date_naive();
    Arc::new(calenda_provider_mock::MockProvider::seeded(today))
}

#[cfg(target_os = "macos")]
fn native() -> Option<Arc<dyn CalendarProvider>> {
    Some(Arc::new(calenda_provider_eventkit::EventKitProvider::new()))
}

#[cfg(not(target_os = "macos"))]
fn native() -> Option<Arc<dyn CalendarProvider>> {
    None
}
