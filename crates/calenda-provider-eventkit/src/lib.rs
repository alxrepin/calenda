//! `CalendarProvider` backed by Apple EventKit.
//!
//! EventKit exposes everything the system Calendar and Reminders apps see:
//! iCloud, Google, Exchange and local calendars, shared calendars and every
//! reminder list, with sync handled by macOS. This crate adapts that API to
//! the domain ports.
//!
//! Design notes:
//!
//! * `EKEventStore` is not thread-safe, so all EventKit calls run on one
//!   dedicated worker thread (`worker`). The public provider is `Send + Sync`
//!   and forwards each call as a job to that thread, blocking until it is done.
//! * Objective-C objects never leave the worker. Everything is converted to
//!   domain types (`convert`) before crossing back.
//! * The crate only compiles on macOS; other targets get an empty crate so the
//!   workspace still builds.

#[cfg(target_os = "macos")]
mod convert;
#[cfg(target_os = "macos")]
mod provider;
#[cfg(target_os = "macos")]
mod worker;

#[cfg(target_os = "macos")]
pub use provider::EventKitProvider;
