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
    pub provider: Option<String>,
    pub model: Option<String>,
    pub status: Option<u16>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub duration_ms: Option<u64>,
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
            provider: None,
            model: None,
            status: None,
            input_tokens: None,
            output_tokens: None,
            duration_ms: None,
        };
        inner.next_id += 1;
        inner.entries.push_back(entry);
    }

    pub fn push_detailed<K, V, I>(
        &self,
        level: LogLevel,
        message: impl Into<String>,
        fields: I,
        provider: Option<String>,
        model: Option<String>,
        status: Option<u16>,
        input_tokens: Option<u64>,
        output_tokens: Option<u64>,
        duration_ms: Option<u64>,
    ) where
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
            provider,
            model,
            status,
            input_tokens,
            output_tokens,
            duration_ms,
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
