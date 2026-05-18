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
    pub request_id: Option<String>,  // 用于关联同一请求的开始和结束日志
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
    pub request_headers: Option<BTreeMap<String, String>>,
    pub response_headers: Option<BTreeMap<String, String>>,  // 新增响应头
    pub is_final: bool,  // true 表示请求完成，false 表示请求进行中
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
        self.push_with_headers(level, message, fields, None)
    }

    pub fn push_with_headers<K, V, I>(
        &self,
        level: LogLevel,
        message: impl Into<String>,
        fields: I,
        request_headers: Option<BTreeMap<String, String>>,
    ) where
        K: Into<String>,
        V: Into<String>,
        I: IntoIterator<Item = (K, V)>,
    {
        let message_str = message.into();
        // 过滤掉 inbound request、forwarding upstream 和 retrying current provider 日志
        if message_str == "inbound request"
            || message_str == "forwarding upstream"
            || message_str == "retrying current provider"
        {
            return;
        }

        let mut inner = self.inner.lock().unwrap();
        if inner.capacity == 0 {
            return;
        }

        while inner.entries.len() >= inner.capacity {
            inner.entries.pop_front();
        }

        // 对请求头进行敏感字段过滤
        let sanitized_headers = request_headers.map(|h| {
            h.into_iter()
                .map(|(key, value)| {
                    let sanitized_value = sanitize_field(&key, value);
                    (key, sanitized_value)
                })
                .collect()
        });

        let entry = ProxyLogEntry {
            id: inner.next_id,
            request_id: None,
            timestamp_ms: current_timestamp_ms(),
            level,
            message: message_str,
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
            request_headers: sanitized_headers,
            response_headers: None,
            is_final: true,
        };
        inner.next_id += 1;
        inner.entries.push_back(entry);
    }

    /// 创建一条请求开始日志（is_final=false），返回日志 id 用于后续更新
    pub fn create_request_log<K, V, I>(
        &self,
        level: LogLevel,
        message: impl Into<String>,
        fields: I,
        provider: Option<String>,
        model: Option<String>,
        request_headers: Option<BTreeMap<String, String>>,
    ) -> u64
    where
        K: Into<String>,
        V: Into<String>,
        I: IntoIterator<Item = (K, V)>,
    {
        let message_str = message.into();
        let mut inner = self.inner.lock().unwrap();
        if inner.capacity == 0 {
            return 0;
        }

        while inner.entries.len() >= inner.capacity {
            inner.entries.pop_front();
        }

        // 对请求头进行敏感字段过滤
        let sanitized_headers = request_headers.map(|h| {
            h.into_iter()
                .map(|(key, value)| {
                    let sanitized_value = sanitize_field(&key, value);
                    (key, sanitized_value)
                })
                .collect()
        });

        let id = inner.next_id;
        let request_id = format!("req_{}", id);
        let entry = ProxyLogEntry {
            id,
            request_id: Some(request_id),
            timestamp_ms: current_timestamp_ms(),
            level,
            message: message_str,
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
            status: None,
            input_tokens: None,
            output_tokens: None,
            duration_ms: None,
            request_headers: sanitized_headers,
            response_headers: None,
            is_final: false,
        };
        inner.next_id += 1;
        inner.entries.push_back(entry);
        id
    }

    /// 更新已有的日志条目，填充 token、状态和响应头信息
    pub fn update_request_log(
        &self,
        log_id: u64,
        status: Option<u16>,
        input_tokens: Option<u64>,
        output_tokens: Option<u64>,
        duration_ms: Option<u64>,
        response_headers: Option<BTreeMap<String, String>>,
    ) {
        let mut inner = self.inner.lock().unwrap();
        // 从后向前查找（最新条目在后面）
        for entry in inner.entries.iter_mut().rev() {
            if entry.id == log_id {
                entry.status = status;
                entry.input_tokens = input_tokens;
                entry.output_tokens = output_tokens;
                entry.duration_ms = duration_ms;
                entry.response_headers = response_headers;
                entry.is_final = true;
                break;
            }
        }
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
