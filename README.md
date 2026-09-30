# Calenda

A macOS calendar that shows a month overview, the week's events and your
reminders on one screen. Events and reminders come straight from Apple's
EventKit, so every account already set up in Calendar.app and Reminders.app
(iCloud, Google, Exchange, shared calendars, reminder lists) shows up here and
syncs through macOS.

The UI is a reskin in the spirit of Notion Calendar and Apple Calendar; the
data model keeps the Apple distinction: an **event** blocks time on a calendar,
a **reminder** is an action with an optional due date.

## Layout

```
crates/
  calenda-domain             entities, value objects, provider ports (no serde, no platform code)
  calenda-app                use cases: AgendaService, Workspace, Preferences port
  calenda-provider-mock      in-memory provider with seed data (dev on Linux/Windows, tests)
  calenda-provider-eventkit  EventKit provider (macOS only; objc2 bindings, one worker thread)
apps/desktop/
  src-tauri/                 Tauri 2 shell: commands, DTOs, provider selection, JSON preferences
  src/
    domain/                  civil-date maths, grid layout, reminder grouping, filters (+ tests)
    application/             Backend port, zustand store with the use cases the UI calls (+ tests)
    infrastructure/          Tauri adapter, in-browser mock backend, wire mapping
    ui/                      React components and CSS modules (design tokens in ui/tokens.css)
```

Dependencies point inwards: `ui → application → domain`, and `infrastructure`
implements `application`'s ports. On the Rust side the same holds:
`desktop → app → domain`, providers implement `domain::ports`. A future
Windows/Linux/mobile build swaps the provider (CalDAV, Google API) and keeps
everything else.

## Running

Prerequisites: Node 22, pnpm 10, Rust stable, and on macOS the Xcode command
line tools. Minimum macOS is Sonoma 14 (the full-access EventKit API).

```sh
pnpm install

# UI only, in a browser with the in-memory mock (works on any OS)
pnpm dev                 # http://localhost:1420

# The real app on macOS (asks for Calendars and Reminders access on first run)
pnpm tauri dev

# The real app with the mock provider, on any OS
CALENDA_PROVIDER=mock pnpm tauri dev

# Release bundle (.app / .dmg in apps/desktop/src-tauri/target/release/bundle)
pnpm tauri build
```

If access was denied, the app shows buttons that open the matching pane in
System Settings → Privacy & Security. The gear in the sidebar shows the
current data source and the access state for Calendars and Reminders.

Logs go to stdout in `tauri dev` and to
`~/Library/Logs/dev.alxrepin.calenda/Calenda.log`; the EventKit provider logs
access prompts, calendar and list counts, and reminder fetch results, which is
the first thing to look at when something does not show up.

Preferences (hidden calendars, "show timed reminders in the grid") are stored in
`~/Library/Application Support/dev.alxrepin.calenda/preferences.json`.

## Checks

```sh
cargo test --workspace            # domain, app, mock provider, DTOs, Tauri IPC tests
cargo clippy --workspace --all-targets
pnpm test                         # vitest: frontend domain + store
pnpm typecheck && pnpm lint

# On Linux, type-check the macOS-only code without a Mac:
rustup target add aarch64-apple-darwin
DOCS_RS=1 cargo check --target aarch64-apple-darwin -p calenda-desktop -p calenda-provider-eventkit
```

`DOCS_RS=1` skips a build script that needs clang for Apple targets; nothing is
linked in a `check`, so the result is a faithful type check of the EventKit code.
The Tauri IPC tests run the real command handlers on Tauri's mock runtime with
the mock provider, so the JSON contract between Rust and the webview is covered
on every platform.

## Keyboard

| Key | Action |
| --- | --- |
| `⌘K` | focus search |
| `T` | today |
| `←` `→` | previous / next period |
| `D` `W` `M` | day / week / month view |
| `+ Add` | new item, on the kind used last; the arrow next to it picks Event or Task |
| double-click a slot, a day, or an event | create / edit |
| drag an event | move it (15-minute snap; all-day bars move by day) |
| `Esc` | close editor or search |

## What EventKit does and does not give us

Available through the public API and used here: calendars and reminder lists
with colours and read-only flags, events with location, notes and URL, whether
an item repeats, reminders with due date, optional due time, priority
(none/low/medium/high), completion.

Not exposed by EventKit, so not in the app: reminder subtasks, tags, flags,
sections and attachments. The reference design's coloured chips map to the
reminder's **list**, and "High priority" maps to priority. In the UI reminders
are called **tasks**; the code keeps the EventKit name.

Recurrence rules are read (an event or reminder shows a repeat badge) but not
edited; edits and moves apply to the single occurrence.

## Roadmap

- Windows/Linux: CalDAV provider (iCloud with an app-specific password, Google
  via CalDAV or its API) plus a local SQLite cache behind the same ports.
- Mobile: Tauri 2 targets iOS/Android with the same UI; iOS can use EventKit.
- Recurrence editing, invitees, natural-language quick add, drag to resize.
