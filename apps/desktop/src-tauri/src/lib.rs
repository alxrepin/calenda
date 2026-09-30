//! Tauri shell. Thin adapter: builds the provider and `AgendaService`, exposes
//! commands, and forwards store-change notifications to the webview.

mod commands;
mod dto;
mod preferences;
mod provider;

use std::sync::Arc;

use calenda_app::AgendaService;
use calenda_domain::Subscription;
use tauri::{Emitter, Manager};

/// Event name the webview listens to for "re-query everything".
pub const STORE_CHANGED_EVENT: &str = "calenda://store-changed";

/// Everything commands need, managed by Tauri.
pub struct AppState {
    service: Arc<AgendaService>,
    _subscription: Box<dyn Subscription>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            let provider = provider::build();
            log::info!("calendar provider: {}", provider.name());
            let preferences = preferences::JsonFilePreferences::in_app_config(app.handle())?;
            let service = Arc::new(AgendaService::new(provider, Arc::new(preferences)));

            let handle = app.handle().clone();
            let subscription = service.subscribe(Box::new(move || {
                if let Err(err) = handle.emit(STORE_CHANGED_EVENT, ()) {
                    log::warn!("failed to emit store change: {err}");
                }
            }));

            app.manage(AppState { service, _subscription: subscription });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::load_workspace,
            commands::set_calendar_visible,
            commands::set_show_reminders_in_grid,
            commands::list_events,
            commands::create_event,
            commands::update_event,
            commands::delete_event,
            commands::move_event,
            commands::list_reminders,
            commands::create_reminder,
            commands::update_reminder,
            commands::set_reminder_completed,
            commands::delete_reminder,
            commands::search,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Calenda");
}
