use serde::Serialize;
use std::collections::{BTreeMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ProxyLogEntry {
    pub id: u64,
    pub timestamp_ms: u128,
    pub level: LogLevel,
    pub message: String,
    pub fields: BTreeMap<String, String>,
}

#[derive(Clone)]
pub struct ProxyLogStore {
    inner: Arc<Mutex<ProxyLogInner>>,
}

struct ProxyLogInner {
    next_id: u64,
    capacity: usize,
    entries: VecDeque<ProxyLogEntry>,
}

impl ProxyLogStore {
    pub fn new(capacity: usize) -> Self {
        Self {
            inner: Arc::new(Mutex::new(ProxyLogInner {
                next_id: 1,
                capacity,
                entries: VecDeque::with_capacity(capacity),
            })),
        }
    }

    pub fn push<K, V, I>(&self, level: LogLevel, message: impl Into<String>, fields: I)
    where
        K: Into<String>,
        V: Into<String>,
        I: IntoIterator<Item = (K, V)>,
    {
        let mut inner = self.inner.lock().unwrap();
        if inner.capacity == 0 {
            return;
        }

        while inner.entries.len() >= inner.capacity {
            inner.entries.pop_front();
        }

        let entry = ProxyLogEntry {
            id: inner.next_id,
            timestamp_ms: current_timestamp_ms(),
            level,
            message: message.into(),
            fields: fields
                .into_iter()
                .map(|(key, value)| {
                    let key = key.into();
                    let value = sanitize_field(&key, value.into());
                    (key, value)
                })
                .collect(),
        };
        inner.next_id += 1;
        inner.entries.push_back(entry);
    }

    pub fn recent(&self) -> Vec<ProxyLogEntry> {
        self.inner.lock().unwrap().entries.iter().cloned().collect()
    }
}

fn current_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

fn sanitize_field(key: &str, value: String) -> String {
    let normalized = key.to_ascii_lowercase();
    if normalized.contains("authorization")
        || normalized.contains("api-key")
        || normalized.contains("api_key")
        || normalized.contains("token")
    {
        "[redacted]".to_owned()
    } else {
        value
    }
}
