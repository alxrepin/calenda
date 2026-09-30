//! The single thread that owns the `EKEventStore`.

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use calenda_domain::{ChangeListener, DomainError, DomainResult};
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::{AnyObject, NSObjectProtocol, ProtocolObject};
use objc2_event_kit::{EKEventStore, EKEventStoreChangedNotification};
use objc2_foundation::{NSDate, NSDefaultRunLoopMode, NSNotificationCenter, NSRunLoop};

/// Runs on the worker thread with exclusive access to the store.
pub(crate) type Job = Box<dyn FnOnce(&mut Store) + Send + 'static>;

pub(crate) type Listeners = Arc<Mutex<Vec<(u64, ChangeListener)>>>;

/// State owned by the worker thread. `!Send` on purpose.
pub(crate) struct Store {
    pub store: Retained<EKEventStore>,
    listeners: Listeners,
    observer: Option<Retained<ProtocolObject<dyn NSObjectProtocol>>>,
}

impl Store {
    fn new(listeners: Listeners) -> Self {
        let mut this = Self {
            store: unsafe { EKEventStore::new() },
            listeners,
            observer: None,
        };
        this.observe_changes();
        this
    }

    /// EventKit recommends a fresh store after the user grants access; data
    /// fetched through the old one can be stale or empty.
    pub fn recreate(&mut self) {
        self.unobserve();
        self.store = unsafe { EKEventStore::new() };
        self.observe_changes();
    }

    fn observe_changes(&mut self) {
        let listeners = Arc::clone(&self.listeners);
        let block = block2::RcBlock::new(
            move |_notification: std::ptr::NonNull<objc2_foundation::NSNotification>| {
                let guard = listeners.lock().unwrap_or_else(|e| e.into_inner());
                for (_, listener) in guard.iter() {
                    listener();
                }
            },
        );
        let center = NSNotificationCenter::defaultCenter();
        let observer = unsafe {
            center.addObserverForName_object_queue_usingBlock(
                Some(EKEventStoreChangedNotification),
                Some(&*self.store as &AnyObject),
                None,
                &block,
            )
        };
        self.observer = Some(observer);
    }

    fn unobserve(&mut self) {
        if let Some(observer) = self.observer.take() {
            let center = NSNotificationCenter::defaultCenter();
            unsafe { center.removeObserver(observer.as_ref()) };
        }
    }
}

impl Drop for Store {
    fn drop(&mut self) {
        self.unobserve();
    }
}

/// Waits for a value sent from an EventKit completion block.
///
/// Completion blocks normally arrive on a background queue, but some are
/// delivered through the calling thread's run loop. Pumping the worker's run
/// loop while waiting covers both without blocking the app's main thread.
pub(crate) fn wait_for_completion<T>(rx: &Receiver<T>, timeout: Duration) -> Option<T> {
    let deadline = Instant::now() + timeout;
    loop {
        match rx.recv_timeout(Duration::from_millis(20)) {
            Ok(value) => return Some(value),
            Err(RecvTimeoutError::Disconnected) => return None,
            Err(RecvTimeoutError::Timeout) => {}
        }
        if Instant::now() >= deadline {
            return None;
        }
        let run_loop = NSRunLoop::currentRunLoop();
        let until = NSDate::dateWithTimeIntervalSinceNow(0.03);
        unsafe { run_loop.runMode_beforeDate(NSDefaultRunLoopMode, &until) };
    }
}

/// Handle to the worker thread. Cloning shares the same thread.
#[derive(Clone)]
pub(crate) struct Worker {
    sender: Sender<Job>,
}

impl Worker {
    pub fn spawn(listeners: Listeners) -> Self {
        let (sender, receiver) = mpsc::channel::<Job>();
        thread::Builder::new()
            .name("calenda-eventkit".into())
            .spawn(move || {
                let mut store = Store::new(listeners);
                for job in receiver {
                    autoreleasepool(|_| job(&mut store));
                }
            })
            .expect("spawn EventKit worker thread");
        Self { sender }
    }

    /// Runs `f` on the worker thread and waits for its result.
    pub fn run<T, F>(&self, f: F) -> DomainResult<T>
    where
        T: Send + 'static,
        F: FnOnce(&mut Store) -> DomainResult<T> + Send + 'static,
    {
        let (tx, rx) = mpsc::channel();
        let job: Job = Box::new(move |store| {
            let _ = tx.send(f(store));
        });
        self.sender
            .send(job)
            .map_err(|_| DomainError::provider("EventKit worker thread is gone"))?;
        rx.recv()
            .map_err(|_| DomainError::provider("EventKit worker dropped the job"))?
    }
}
