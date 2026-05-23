use crate::config::AuthScheme;
use crate::proxy_log::{LogLevel, ProxyLogEntry, ProxyLogStore};
use crate::router::FailureAction;
use crate::router::SharedRouter;
use crate::transformer;
use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, Request, Response, StatusCode};
use axum::routing::{any, get};
use axum::{Json, Router};
use futures::StreamExt;
use http_body_util::BodyExt;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use tokio::sync::watch;

const UPSTREAM_RESPONSE_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RoutePrefix {
    Anthropic,
    OpenAI,
}

/// 追踪流式响应中的 token usage，支持跨 chunk 的 SSE 缓冲解析
#[derive(Debug, Clone, Default)]
struct UsageTracker {
    input_tokens: Option<u64>,
    output_tokens: Option<u64>,
    buffer: String,
}

struct RequestLogFinalizer {
    logs: ProxyLogStore,
    log_id: u64,
    status: u16,
    start_time: Instant,
    usage_tracker: Arc<std::sync::Mutex<UsageTracker>>,
    response_headers: Option<std::collections::BTreeMap<String, String>>,
    completed: Arc<AtomicBool>,
}

impl RequestLogFinalizer {
    fn complete(&self, status: u16) {
        self.update(status);
        self.completed.store(true, Ordering::SeqCst);
    }

    fn update(&self, status: u16) {
        let duration_ms = self.start_time.elapsed().as_millis() as u64;
        let tracker = self.usage_tracker.lock().unwrap();
        let in_str = tracker
            .input_tokens
            .map(|v| v.to_string())
            .unwrap_or_else(|| "-".to_string());
        let out_str = tracker
            .output_tokens
            .map(|v| v.to_string())
            .unwrap_or_else(|| "-".to_string());
        log::info!(
            "[proxy] done | status={} in={} out={} dur={}ms",
            status, in_str, out_str, duration_ms,
        );
        self.logs.update_request_log(
            self.log_id,
            Some(status),
            tracker.input_tokens,
            tracker.output_tokens,
            Some(duration_ms),
            self.response_headers.clone(),
        );
    }
}

impl Drop for RequestLogFinalizer {
    fn drop(&mut self) {
        if !self.completed.load(Ordering::SeqCst) {
            self.update(self.status);
        }
    }
}

impl UsageTracker {
    /// 解析累积的 SSE 数据，提取 usage 信息
    /// Anthropic:
    ///   - message_start: 包含 input_tokens
    ///   - message_delta: 包含 output_tokens
    /// OpenAI:
    ///   - 最后一个 data chunk 包含 usage（如果 stream_options.include_usage: true）
    fn parse_sse_chunk(&mut self, chunk: &str) {
        // 将新 chunk 追加到缓冲区
        self.buffer.push_str(chunk);

        // 按双换行分隔符切分完整事件（支持 \n\n 或 \r\n\r\n）
        while let Some(pos) = self.buffer.find("\n\n") {
            let event_str = self.buffer[..pos].to_string();
            // 跳过分隔符（可能是 \n\n 或 \r\n\r\n，这里简化处理）
            let skip_len = if event_str.ends_with('\r') { 3 } else { 2 };
            self.buffer = self.buffer[pos + skip_len..].to_string();

            // 解析完整事件
            if let Some((event_type, data)) = parse_sse_event(&event_str) {
                self.extract_usage(&event_type, data);
            }
        }
    }

    /// 从已解析的 SSE 事件中提取 usage
    fn extract_usage(&mut self, event_type: &str, data: &str) {
        if data == "[DONE]" {
            return;
        }

        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
            // Anthropic: message_start 包含 input_tokens（标准格式）
            if event_type == "message_start" {
                if let Some(usage) = json.get("message").and_then(|m| m.get("usage")) {
                    if let Some(input) = usage.get("input_tokens").and_then(|v| v.as_u64()) {
                        self.input_tokens = Some(input);
                    }
                }
            }
            // Anthropic: message_delta 包含 output_tokens（标准格式）
            // 注意：某些供应商（如美团 LongCat）也会把 input_tokens 放在这里
            else if event_type == "message_delta" {
                if let Some(usage) = json.get("usage") {
                    // 提取 input_tokens（如果有的话，兼容非标准格式）
                    if let Some(input) = usage.get("input_tokens").and_then(|v| v.as_u64()) {
                        self.input_tokens = Some(input);
                    }
                    // 提取 output_tokens
                    if let Some(output) = usage.get("output_tokens").and_then(|v| v.as_u64()) {
                        self.output_tokens = Some(output);
                    }
                }
            }
            // OpenAI: data 事件中的 usage（最后一个 chunk）
            else if event_type == "data" {
                if let Some(usage) = json.get("usage") {
                    if let Some(input) = usage.get("prompt_tokens").and_then(|v| v.as_u64()) {
                        self.input_tokens = Some(input);
                    }
                    if let Some(output) = usage.get("completion_tokens").and_then(|v| v.as_u64()) {
                        self.output_tokens = Some(output);
                    }
                }
            }
        }
    }
}

/// 解析 SSE 事件格式：`event: xxx\ndata: yyy`
fn parse_sse_event(raw: &str) -> Option<(String, &str)> {
    let mut event_type = None;
    let mut data = None;

    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("event:") {
            event_type = Some(rest.trim());
        } else if let Some(rest) = line.strip_prefix("data:") {
            data = Some(rest.trim());
        }
    }

    match (event_type, data) {
        (Some(evt), Some(d)) => Some((evt.to_string(), d)),
        (None, Some(d)) => Some(("data".to_string(), d)), // 默认 event type
        _ => None,
    }
}

fn parse_route_prefix(path: &str) -> Option<(RoutePrefix, &str)> {
    if let Some(rest) = path.strip_prefix("/anthropic") {
        Some((RoutePrefix::Anthropic, rest))
    } else if let Some(rest) = path.strip_prefix("/openai") {
        Some((RoutePrefix::OpenAI, rest))
    } else {
        None
    }
}

#[derive(Clone)]
pub struct ProxyState {
    pub router: SharedRouter,
    pub notify_tx: Arc<watch::Sender<String>>,
    pub http_client: reqwest::Client,
    pub logs: ProxyLogStore,
}

pub async fn start_proxy(
    router: SharedRouter,
    notify_tx: Arc<watch::Sender<String>>,
    logs: ProxyLogStore,
    port: u16,
    shutdown_rx: watch::Receiver<bool>,
) -> anyhow::Result<()> {
    let client = reqwest::Client::builder().build()?;

    let state = ProxyState {
        router,
        notify_tx,
        http_client: client,
        logs,
    };

    let app = Router::new()
        .route("/logs", get(logs_handler))
        .fallback(any(proxy_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await?;
    log::info!("proxy listening on 127.0.0.1:{}", port);
    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let mut rx = shutdown_rx;
            loop {
                let _ = rx.changed().await;
                if *rx.borrow() {
                    break;
                }
            }
        })
        .await?;
    Ok(())
}

async fn logs_handler(State(state): State<ProxyState>) -> Json<Vec<ProxyLogEntry>> {
    Json(state.logs.recent())
}

async fn proxy_handler(State(state): State<ProxyState>, req: Request<Body>) -> Response<Body> {
    let (parts, body) = req.into_parts();
    let body_bytes = match body.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => return error_response(StatusCode::BAD_REQUEST, "failed to read request body"),
    };

    let method = parts.method.clone();
    let path = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str().to_owned())
        .unwrap_or_else(|| "/".to_owned());
    let original_headers = parts.headers.clone();

    // 解析路径前缀
    let (route_prefix, stripped_path) = match parse_route_prefix(&path) {
        Some(result) => result,
        None => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "path must start with /anthropic or /openai",
            );
        }
    };
    // 将 stripped_path 转为 owned String 以避免借用问题
    let stripped_path = stripped_path.to_owned();

    // Identify which queue to use for this request
    let queue_id = {
        let r = state.router.read().await;
        r.identify_queue(&original_headers, &stripped_path)
    };

    // 构建请求头的 BTreeMap 用于日志记录
    let inbound_headers_map: std::collections::BTreeMap<String, String> = original_headers
        .iter()
        .map(|(k, v)| {
            (
                k.as_str().to_string(),
                v.to_str().unwrap_or("[binary]").to_string(),
            )
        })
        .collect();

    log::debug!(
        "[proxy] >> {} {} queue={} auth={}",
        method,
        path,
        queue_id,
        if original_headers.contains_key("authorization") { "yes" } else { "no" },
    );
    state.logs.push_with_headers(
        LogLevel::Info,
        "inbound request",
        [
            ("method", method.as_str().to_owned()),
            ("path", path.clone()),
            ("queue_id", queue_id.clone()),
        ],
        Some(inbound_headers_map.clone()),
    );

    let retry_delay = {
        let r = state.router.read().await;
        r.retry.retry_delay_secs
    };

    loop {
        let (target_url, protocol, auth_scheme, model_id, provider_name, provider_id) = {
            let r = state.router.read().await;
            match r.active_entry_for_queue(&queue_id) {
                Some((p, mid)) => {
                    // For OpenAI-protocol providers (conversion path), always use openai_url
                    // even when the inbound request is on the /anthropic prefix.
                    let is_conversion =
                        route_prefix == RoutePrefix::Anthropic && p.protocol == crate::config::Protocol::OpenAI;
                    let target_url = if is_conversion {
                        if p.openai_url.is_empty() {
                            return error_response(
                                StatusCode::SERVICE_UNAVAILABLE,
                                "provider has no openai_url configured for conversion",
                            );
                        }
                        p.openai_url.clone()
                    } else {
                        match route_prefix {
                            RoutePrefix::Anthropic => {
                                if p.anthropic_url.is_empty() {
                                    return error_response(
                                        StatusCode::SERVICE_UNAVAILABLE,
                                        "provider has no anthropic_url configured",
                                    );
                                }
                                p.anthropic_url.clone()
                            }
                            RoutePrefix::OpenAI => {
                                if p.openai_url.is_empty() {
                                    return error_response(
                                        StatusCode::SERVICE_UNAVAILABLE,
                                        "provider has no openai_url configured",
                                    );
                                }
                                p.openai_url.clone()
                            }
                        }
                    };
                    (
                        target_url,
                        p.protocol.clone(),
                        p.effective_auth_scheme(),
                        mid.to_owned(),
                        p.name.clone(),
                        p.id.clone(),
                    )
                }
                None => {
                    return error_response(
                        StatusCode::SERVICE_UNAVAILABLE,
                        &format!("no available provider in queue '{}'", queue_id),
                    )
                }
            }
        };

        // 从 auth_map 获取 api_key
        let api_key = {
            let r = state.router.read().await;
            r.get_api_key(&provider_id).unwrap_or_default().to_owned()
        };

        // 请求开始时创建日志条目（is_final=false），显示"请求进行中"
        let log_id = state.logs.create_request_log(
            LogLevel::Info,
            "request",
            [
                ("provider", provider_name.clone()),
                ("model", model_id.clone()),
            ],
            Some(provider_name.clone()),
            Some(model_id.clone()),
            Some(inbound_headers_map.clone()),
        );

        let start_time = Instant::now();

        // Anthropic → OpenAI conversion path
        if route_prefix == RoutePrefix::Anthropic
            && protocol == crate::config::Protocol::OpenAI
        {
            return handle_anthropic_to_openai(
                &body_bytes,
                &original_headers,
                &state,
                &target_url,
                &stripped_path,
                &api_key,
                &provider_name,
                &provider_id,
                &queue_id,
                &model_id,
                log_id,
                start_time,
                &inbound_headers_map,
                retry_delay,
            )
            .await;
        }

        // Rewrite the "model" field in the request body to match the queue item
        let final_body = rewrite_model_field(&body_bytes, &model_id);

        let url = crate::smart_url_join(&target_url, &stripped_path);
        let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
            .unwrap_or(reqwest::Method::POST);

        let mut req_builder = state
            .http_client
            .request(reqwest_method, &url)
            .body(final_body);

        req_builder = req_builder.headers(build_upstream_headers_for_route(
            &original_headers,
            route_prefix,
            &auth_scheme,
            &api_key,
            &stripped_path,
        ));

        log::debug!(
            "[proxy] << {} model={} proto={:?} -> {}",
            provider_name,
            model_id,
            protocol,
            url,
        );
        match tokio::time::timeout(UPSTREAM_RESPONSE_TIMEOUT, req_builder.send()).await {
            Err(_) => {
                let duration_ms = start_time.elapsed().as_millis() as u64;
                state.logs.update_request_log(
                    log_id,
                    Some(StatusCode::GATEWAY_TIMEOUT.as_u16()),
                    None,
                    None,
                    Some(duration_ms),
                    None,
                );
                state.logs.push(
                    LogLevel::Error,
                    "upstream request timeout",
                    [
                        ("provider", provider_name.clone()),
                        ("model", model_id.clone()),
                        (
                            "timeout_secs",
                            UPSTREAM_RESPONSE_TIMEOUT.as_secs().to_string(),
                        ),
                    ],
                );
                return error_response(StatusCode::GATEWAY_TIMEOUT, "upstream request timeout");
            }
            Ok(Ok(resp)) => {
                let status = resp.status().as_u16();

                // 用于追踪 usage 的共享 tracker
                let usage_tracker = Arc::new(std::sync::Mutex::new(UsageTracker::default()));

                if is_retryable_error(status) {
                    // 错误响应：更新已有的日志条目（无 token 统计和响应头）
                    let duration_ms = start_time.elapsed().as_millis() as u64;
                    state.logs.update_request_log(
                        log_id,
                        Some(status),
                        None,
                        None,
                        Some(duration_ms),
                        None,
                    );

                    let failure_action = {
                        let mut r = state.router.write().await;
                        r.record_failure_for_queue(&queue_id)
                    };
                    match failure_action {
                        FailureAction::SwitchProvider => {
                            let next_name = {
                                let r = state.router.read().await;
                                r.active_entry_for_queue(&queue_id)
                                    .map(|(p, mid)| format!("{} / {}", p.name, mid))
                                    .unwrap_or_default()
                            };
                            state.logs.push(
                                LogLevel::Warn,
                                "switching provider",
                                [("next", next_name.clone()), ("status", status.to_string())],
                            );
                            let payload = serde_json::json!({
                                "queue_id": queue_id,
                                "provider_name": next_name.clone(),
                            });
                            let _ = state.notify_tx.send(payload.to_string());
                            continue;
                        }
                        FailureAction::RetryCurrent => {
                            state.logs.push(
                                LogLevel::Warn,
                                "retrying current provider",
                                [
                                    ("provider", provider_name.clone()),
                                    ("delay_secs", retry_delay.to_string()),
                                ],
                            );
                            tokio::time::sleep(std::time::Duration::from_secs(retry_delay as u64))
                                .await;
                            continue;
                        }
                        FailureAction::Exhausted => {}
                    }
                }

                let resp_status = StatusCode::from_u16(status).unwrap_or(StatusCode::OK);
                let mut builder = Response::builder().status(resp_status);

                // 收集响应头用于日志记录
                let response_headers_map: std::collections::BTreeMap<String, String> = resp
                    .headers()
                    .iter()
                    .map(|(k, v)| {
                        (
                            k.as_str().to_string(),
                            v.to_str().unwrap_or("[binary]").to_string(),
                        )
                    })
                    .collect();

                // 打印响应头，检查是否有 token 统计
                for (key, value) in resp.headers().iter() {
                    log::trace!("[proxy] resp header: {} = {:?}", key, value);
                    if should_forward_response_header(key.as_str()) {
                        builder = builder.header(key.as_str(), value.clone());
                    }
                }

                // 创建追踪 usage 的 stream，并在流结束时更新日志
                let stream = resp.bytes_stream();
                let usage_tracker_clone = usage_tracker.clone();
                let log_finalizer = Arc::new(RequestLogFinalizer {
                    logs: state.logs.clone(),
                    log_id,
                    status: 499,
                    start_time,
                    usage_tracker,
                    response_headers: Some(response_headers_map.clone()),
                    completed: Arc::new(AtomicBool::new(false)),
                });
                let log_finalizer_clone = log_finalizer.clone();
                let tracked_stream = stream
                    .inspect(move |chunk_result: &Result<bytes::Bytes, reqwest::Error>| {
                        // 解析 SSE 事件提取 usage（支持跨 chunk 缓冲）
                        if let Ok(chunk) = chunk_result {
                            let chunk_str = String::from_utf8_lossy(chunk);
                            let mut tracker = usage_tracker_clone.lock().unwrap();
                            tracker.parse_sse_chunk(&chunk_str);
                        }
                    })
                    .chain(futures::stream::once(async move {
                        // 流结束时更新日志（填充 token、耗时和响应头）
                        log_finalizer_clone.complete(status);
                        // 返回空 bytes 作为流的结束标记
                        Ok(bytes::Bytes::new())
                    }));

                let body = Body::from_stream(tracked_stream);
                return builder.body(body).unwrap_or_else(|_| {
                    error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "failed to build response",
                    )
                });
            }
            Ok(Err(e)) => {
                let status = if e.is_timeout() {
                    StatusCode::GATEWAY_TIMEOUT
                } else {
                    StatusCode::BAD_GATEWAY
                };
                let duration_ms = start_time.elapsed().as_millis() as u64;
                state.logs.update_request_log(
                    log_id,
                    Some(status.as_u16()),
                    None,
                    None,
                    Some(duration_ms),
                    None,
                );
                log::warn!("proxy request error: {}", e);
                state.logs.push(
                    LogLevel::Error,
                    if e.is_timeout() {
                        "upstream request timeout"
                    } else {
                        "upstream request error"
                    },
                    [
                        ("provider", provider_name.clone()),
                        ("model", model_id.clone()),
                        ("error", e.to_string()),
                    ],
                );
                let failure_action = {
                    let mut r = state.router.write().await;
                    r.record_failure_for_queue(&queue_id)
                };
                match failure_action {
                    FailureAction::SwitchProvider => {
                        let next_name = {
                            let r = state.router.read().await;
                            r.active_entry_for_queue(&queue_id)
                                .map(|(p, mid)| format!("{} / {}", p.name, mid))
                                .unwrap_or_default()
                        };
                        state.logs.push(
                            LogLevel::Warn,
                            "switching provider",
                            [
                                ("next", next_name.clone()),
                                ("reason", "request_error".to_owned()),
                            ],
                        );
                        let payload = serde_json::json!({
                            "queue_id": queue_id,
                            "provider_name": next_name.clone(),
                        });
                        let _ = state.notify_tx.send(payload.to_string());
                        continue;
                    }
                    FailureAction::RetryCurrent => {
                        state.logs.push(
                            LogLevel::Warn,
                            "retrying current provider",
                            [
                                ("provider", provider_name.clone()),
                                ("delay_secs", retry_delay.to_string()),
                            ],
                        );
                        tokio::time::sleep(std::time::Duration::from_secs(retry_delay as u64))
                            .await;
                        continue;
                    }
                    FailureAction::Exhausted => {
                        return error_response(
                            StatusCode::BAD_GATEWAY,
                            "upstream request failed after retries",
                        );
                    }
                }
            }
        }
    }
}

/// 检测响应是否是流式（SSE）
#[allow(dead_code)]
fn is_streaming_response(resp: &reqwest::Response) -> bool {
    resp.headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(|ct| ct.contains("text/event-stream"))
        .unwrap_or(false)
}

/// 将请求体 JSON 中的 "model" 字段替换为队列指定的 model_id
fn rewrite_model_field(body: &[u8], model_id: &str) -> bytes::Bytes {
    if let Ok(mut v) = serde_json::from_slice::<serde_json::Value>(body) {
        if let Some(obj) = v.as_object_mut() {
            obj.insert(
                "model".to_owned(),
                serde_json::Value::String(model_id.to_owned()),
            );
            if let Ok(rewritten) = serde_json::to_vec(&v) {
                return bytes::Bytes::from(rewritten);
            }
        }
    }
    bytes::Bytes::copy_from_slice(body)
}

#[allow(dead_code)]
fn build_upstream_headers(
    original_headers: &HeaderMap,
    auth_scheme: &AuthScheme,
    api_key: &str,
    path: &str,
) -> HeaderMap {
    let mut headers = HeaderMap::new();

    for (key, value) in original_headers.iter() {
        if should_forward_request_header(key.as_str()) {
            headers.insert(key.clone(), value.clone());
        }
    }

    match auth_scheme {
        AuthScheme::Bearer => {
            if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", api_key)) {
                headers.insert("authorization", value);
            }
        }
        AuthScheme::ApiKey => {
            if let Ok(value) = HeaderValue::from_str(api_key) {
                headers.insert("x-api-key", value);
            }
        }
    }

    if is_anthropic_messages_path(path) && !headers.contains_key("anthropic-version") {
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
    }

    headers
}

fn build_upstream_headers_for_route(
    original_headers: &HeaderMap,
    route_prefix: RoutePrefix,
    auth_scheme: &AuthScheme,
    api_key: &str,
    stripped_path: &str,
) -> HeaderMap {
    let mut headers = HeaderMap::new();

    for (key, value) in original_headers.iter() {
        if should_forward_request_header(key.as_str()) {
            headers.insert(key.clone(), value.clone());
        }
    }

    match route_prefix {
        RoutePrefix::Anthropic => {
            // Anthropic 路径：按 auth_scheme 处理认证
            match auth_scheme {
                AuthScheme::Bearer => {
                    if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", api_key)) {
                        headers.insert("authorization", value);
                    }
                }
                AuthScheme::ApiKey => {
                    if let Ok(value) = HeaderValue::from_str(api_key) {
                        headers.insert("x-api-key", value);
                    }
                }
            }
            // 添加 anthropic-version（如果是 messages 路径）
            if is_anthropic_messages_path(stripped_path)
                && !headers.contains_key("anthropic-version")
            {
                headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            }
        }
        RoutePrefix::OpenAI => {
            // OpenAI 路径：固定 Bearer 认证
            if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", api_key)) {
                headers.insert("authorization", value);
            }
            // 不添加 anthropic-version
        }
    }

    headers
}

fn is_anthropic_messages_path(path: &str) -> bool {
    path == "/v1/messages" || path.starts_with("/v1/messages?")
}

fn should_forward_request_header(name: &str) -> bool {
    !matches!(
        name.to_ascii_lowercase().as_str(),
        "host"
            | "content-length"
            | "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "accept-encoding"
            | "authorization"
            | "x-api-key"
    )
}

fn should_forward_response_header(name: &str) -> bool {
    !matches!(
        name.to_ascii_lowercase().as_str(),
        "content-length"
            | "connection"
            | "keep-alive"
            | "proxy-authenticate"
            | "proxy-authorization"
            | "te"
            | "trailer"
            | "transfer-encoding"
            | "upgrade"
            | "content-encoding"
    )
}

fn is_retryable_error(status: u16) -> bool {
    matches!(status, 429 | 500 | 502 | 503 | 504)
}

fn error_response(status: StatusCode, msg: &str) -> Response<Body> {
    let body = serde_json::json!({ "error": msg }).to_string();
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap()
}

// ============================================================================
// Anthropic → OpenAI Conversion Handler
// ============================================================================

/// Map HTTP status codes to Anthropic error types.
fn status_to_anthropic_error(status: u16) -> &'static str {
    match status {
        400 => "invalid_request_error",
        401 => "authentication_error",
        403 => "permission_error",
        404 => "not_found_error",
        429 => "rate_limit_error",
        500 | 502 | 503 | 504 => "api_error",
        _ => "api_error",
    }
}

/// Build an Anthropic-formatted error JSON response.
fn anthropic_error_response(status: StatusCode, error_type: &str, message: &str) -> Response<Body> {
    let body = serde_json::json!({
        "type": "error",
        "error": {
            "type": error_type,
            "message": message,
        }
    })
    .to_string();
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap()
}

/// Handle Anthropic → OpenAI conversion for the proxy.
/// This parses an Anthropic Messages API request, converts it to OpenAI Chat Completions
/// format, sends it to the upstream provider, and converts the response back.
async fn handle_anthropic_to_openai(
    body_bytes: &bytes::Bytes,
    _original_headers: &HeaderMap,
    state: &ProxyState,
    target_url: &str,
    stripped_path: &str,
    api_key: &str,
    provider_name: &str,
    _provider_id: &str,
    queue_id: &str,
    model_id: &str,
    log_id: u64,
    start_time: Instant,
    _inbound_headers_map: &std::collections::BTreeMap<String, String>,
    retry_delay: u32,
) -> Response<Body> {
    // Parse Anthropic request
    let anthropic_req: transformer::AnthropicMessageRequest = match serde_json::from_slice(body_bytes) {
        Ok(req) => req,
        Err(e) => {
            log::warn!("[convert] failed to parse Anthropic request: {}", e);
            return anthropic_error_response(
                StatusCode::BAD_REQUEST,
                "invalid_request_error",
                &format!("Failed to parse request: {}", e),
            );
        }
    };

    // Always use the model specified in the queue.
    let effective_model = model_id.to_string();

    log::info!(
        "[convert] model={}",
        effective_model,
    );

    // Convert to OpenAI request
    let mut openai_req: transformer::ChatCompletionRequest =
        match transformer::anthropic_to_openai_request(&anthropic_req, &effective_model) {
            Ok(req) => req,
            Err(e) => {
                log::warn!("[convert] failed to convert request: {}", e);
                return anthropic_error_response(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "api_error",
                    &format!("Conversion error: {}", e),
                );
            }
        };

    // Apply DeepSeek-specific thinking config
    let has_thinking_history = transformer::has_thinking_blocks(&anthropic_req.messages);
    openai_req =
        transformer::apply_deepseek_thinking(openai_req, &effective_model, has_thinking_history);

    // Serialize the converted request
    let openai_body = match serde_json::to_vec(&openai_req) {
        Ok(body) => body,
        Err(e) => {
            log::warn!("[convert] failed to serialize OpenAI request: {}", e);
            return anthropic_error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "api_error",
                &format!("Serialization error: {}", e),
            );
        }
    };

    // Build the upstream URL: /anthropic/v1/messages → /openai/v1/chat/completions
    let upstream_path = if stripped_path.starts_with("/v1/messages") {
        "/v1/chat/completions".to_string()
    } else {
        stripped_path.to_string()
    };
    let url = crate::smart_url_join(target_url, &upstream_path);

    log::debug!(
        "[convert] << {} {} -> {}",
        provider_name,
        effective_model,
        url,
    );

    // Build the request
    let reqwest_method = reqwest::Method::from_bytes(b"POST").unwrap_or(reqwest::Method::POST);
    let req_builder = state
        .http_client
        .request(reqwest_method, &url)
        .header("content-type", "application/json")
        .header("authorization", format!("Bearer {}", api_key))
        .body(openai_body);

    // Send the request
    match tokio::time::timeout(UPSTREAM_RESPONSE_TIMEOUT, req_builder.send()).await {
        Err(_) => {
            let duration_ms = start_time.elapsed().as_millis() as u64;
            state.logs.update_request_log(
                log_id,
                Some(StatusCode::GATEWAY_TIMEOUT.as_u16()),
                None,
                None,
                Some(duration_ms),
                None,
            );
            anthropic_error_response(
                StatusCode::GATEWAY_TIMEOUT,
                "api_error",
                "upstream request timeout",
            )
        }
        Ok(Ok(resp)) => {
            let status = resp.status().as_u16();

            if is_retryable_error(status) {
                let duration_ms = start_time.elapsed().as_millis() as u64;
                state.logs.update_request_log(
                    log_id,
                    Some(status),
                    None,
                    None,
                    Some(duration_ms),
                    None,
                );

                let failure_action = {
                    let mut r = state.router.write().await;
                    r.record_failure_for_queue(queue_id)
                };
                match failure_action {
                    FailureAction::SwitchProvider => {
                        let next_name = {
                            let r = state.router.read().await;
                            r.active_entry_for_queue(queue_id)
                                .map(|(p, mid)| format!("{} / {}", p.name, mid))
                                .unwrap_or_default()
                        };
                        state.logs.push(
                            LogLevel::Warn,
                            "switching provider",
                            [("next", next_name.clone()), ("status", status.to_string())],
                        );
                        let payload = serde_json::json!({
                            "queue_id": queue_id,
                            "provider_name": next_name.clone(),
                        });
                        let _ = state.notify_tx.send(payload.to_string());
                        // For retryable errors in conversion path, return error to caller
                        // The outer loop will retry with the next provider
                        return anthropic_error_response(
                            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
                            status_to_anthropic_error(status),
                            &format!("upstream error: {}", status),
                        );
                    }
                    FailureAction::RetryCurrent => {
                        state.logs.push(
                            LogLevel::Warn,
                            "retrying current provider",
                            [
                                ("provider", provider_name.to_string()),
                                ("delay_secs", retry_delay.to_string()),
                            ],
                        );
                        return anthropic_error_response(
                            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
                            status_to_anthropic_error(status),
                            &format!("upstream error: {}", status),
                        );
                    }
                    FailureAction::Exhausted => {
                        return anthropic_error_response(
                            StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
                            status_to_anthropic_error(status),
                            "all providers exhausted",
                        );
                    }
                }
            }

            // Check if the original request wanted streaming
            let is_streaming = anthropic_req.stream;

            if is_streaming {
                // Streaming response: convert SSE
                let resp_headers = resp.headers().iter()
                    .map(|(k, v)| {
                        (
                            k.as_str().to_string(),
                            v.to_str().unwrap_or("[binary]").to_string(),
                        )
                    })
                    .collect::<std::collections::BTreeMap<String, String>>();

                let mut builder = Response::builder()
                    .status(StatusCode::from_u16(status).unwrap_or(StatusCode::OK))
                    .header("content-type", "text/event-stream")
                    .header("cache-control", "no-cache")
                    .header("connection", "keep-alive");

                // Forward select response headers
                for (key, value) in resp.headers().iter() {
                    if should_forward_response_header(key.as_str()) {
                        builder = builder.header(key.as_str(), value.clone());
                    }
                }

                let chunk_stream = resp.bytes_stream();
                let converted_stream = transformer::proxy_stream(chunk_stream);

                // Create log finalizer
                let usage_tracker = Arc::new(std::sync::Mutex::new(UsageTracker::default()));
                let log_finalizer = Arc::new(RequestLogFinalizer {
                    logs: state.logs.clone(),
                    log_id,
                    status: 499,
                    start_time,
                    usage_tracker,
                    response_headers: Some(resp_headers),
                    completed: Arc::new(AtomicBool::new(false)),
                });

                let tracked_stream = converted_stream.inspect(move |result| {
                    if let Ok(chunk) = result {
                        let chunk_str = String::from_utf8_lossy(chunk);
                        let mut tracker = log_finalizer.usage_tracker.lock().unwrap();
                        tracker.parse_sse_chunk(&chunk_str);
                    }
                });

                // Note: We can't easily chain the finalizer completion into a raw Bytes stream
                // without a custom stream wrapper. For now, log at response time.
                let duration_ms = start_time.elapsed().as_millis() as u64;
                state.logs.update_request_log(
                    log_id,
                    Some(status),
                    None,
                    None,
                    Some(duration_ms),
                    None,
                );

                let body = Body::from_stream(tracked_stream);
                builder.body(body).unwrap_or_else(|_| {
                    error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "failed to build response",
                    )
                })
            } else {
                // Non-streaming response: read full body and convert
                let body_bytes = match resp.bytes().await {
                    Ok(b) => b,
                    Err(e) => {
                        let duration_ms = start_time.elapsed().as_millis() as u64;
                        state.logs.update_request_log(
                            log_id,
                            Some(StatusCode::BAD_GATEWAY.as_u16()),
                            None,
                            None,
                            Some(duration_ms),
                            None,
                        );
                        return anthropic_error_response(
                            StatusCode::BAD_GATEWAY,
                            "api_error",
                            &format!("failed to read upstream response: {}", e),
                        );
                    }
                };

                let duration_ms = start_time.elapsed().as_millis() as u64;

                // Try to parse as OpenAI response
                let openai_resp: transformer::ChatCompletionResponse =
                    match serde_json::from_slice(&body_bytes) {
                        Ok(r) => r,
                        Err(e) => {
                            log::warn!("[convert] failed to parse OpenAI response: {}", e);
                            state.logs.update_request_log(
                                log_id,
                                Some(status),
                                None,
                                None,
                                Some(duration_ms),
                                None,
                            );
                            // If we can't parse it, return the raw body as an error
                            return anthropic_error_response(
                                StatusCode::from_u16(status).unwrap_or(StatusCode::OK),
                                "api_error",
                                &format!("failed to parse upstream response: {}", e),
                            );
                        }
                    };

                // Extract usage for logging
                let (input_tokens, output_tokens) = openai_resp.usage.as_ref().map(|u| {
                    (
                        Some(u.prompt_tokens),
                        Some(u.completion_tokens),
                    )
                }).unwrap_or((None, None));

                state.logs.update_request_log(
                    log_id,
                    Some(status),
                    input_tokens,
                    output_tokens,
                    Some(duration_ms),
                    None,
                );

                // Convert to Anthropic response
                let anthropic_resp =
                    match transformer::openai_to_anthropic_response(&openai_resp) {
                        Ok(r) => r,
                        Err(e) => {
                            log::warn!("[convert] failed to convert response: {}", e);
                            return anthropic_error_response(
                                StatusCode::INTERNAL_SERVER_ERROR,
                                "api_error",
                                &format!("conversion error: {}", e),
                            );
                        }
                    };

                match serde_json::to_vec(&anthropic_resp) {
                    Ok(json_bytes) => Response::builder()
                        .status(StatusCode::OK)
                        .header("content-type", "application/json")
                        .body(Body::from(json_bytes))
                        .unwrap(),
                    Err(e) => anthropic_error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "api_error",
                        &format!("failed to serialize response: {}", e),
                    ),
                }
            }
        }
        Ok(Err(e)) => {
            let status = if e.is_timeout() {
                StatusCode::GATEWAY_TIMEOUT
            } else {
                StatusCode::BAD_GATEWAY
            };
            let duration_ms = start_time.elapsed().as_millis() as u64;
            state.logs.update_request_log(
                log_id,
                Some(status.as_u16()),
                None,
                None,
                Some(duration_ms),
                None,
            );
            log::warn!("[convert] upstream request error: {}", e);
            anthropic_error_response(
                status,
                "api_error",
                &format!("upstream request failed: {}", e),
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proxy_log::{LogLevel, ProxyLogStore};
    use axum::http::{HeaderMap, HeaderValue};

    #[test]
    fn upstream_message_headers_preserve_anthropic_beta_and_add_version() {
        let mut original = HeaderMap::new();
        original.insert(
            "anthropic-beta",
            HeaderValue::from_static("claude-code-20250219"),
        );
        original.insert("content-type", HeaderValue::from_static("application/json"));
        original.insert(
            "authorization",
            HeaderValue::from_static("Bearer inbound-token"),
        );
        original.insert("host", HeaderValue::from_static("localhost:7860"));

        let headers = build_upstream_headers(
            &original,
            &AuthScheme::Bearer,
            "provider-token",
            "/v1/messages?beta=true",
        );

        assert_eq!(
            headers.get("anthropic-beta").unwrap(),
            "claude-code-20250219"
        );
        assert_eq!(headers.get("anthropic-version").unwrap(), "2023-06-01");
        assert_eq!(
            headers.get("authorization").unwrap(),
            "Bearer provider-token"
        );
        assert!(!headers.contains_key("host"));
    }

    #[test]
    fn upstream_message_headers_keep_existing_anthropic_version() {
        let mut original = HeaderMap::new();
        original.insert("anthropic-version", HeaderValue::from_static("2024-01-01"));

        let headers = build_upstream_headers(
            &original,
            &AuthScheme::ApiKey,
            "provider-token",
            "/v1/messages",
        );

        assert_eq!(headers.get("anthropic-version").unwrap(), "2024-01-01");
        assert_eq!(headers.get("x-api-key").unwrap(), "provider-token");
    }

    #[test]
    fn upstream_5xx_statuses_are_retryable() {
        for status in [429, 500, 502, 503, 504] {
            assert!(is_retryable_error(status), "{status} should be retryable");
        }

        for status in [400, 401, 404] {
            assert!(
                !is_retryable_error(status),
                "{status} should not be retryable"
            );
        }
    }

    #[test]
    fn proxy_log_store_keeps_recent_entries_without_sensitive_headers() {
        let store = ProxyLogStore::new(2);

        store.push(
            LogLevel::Info,
            "first request",
            [
                ("path", "/v1/messages"),
                ("authorization", "Bearer secret-token"),
            ],
        );
        store.push(LogLevel::Warn, "retrying upstream", [("status", "503")]);
        store.push(
            LogLevel::Error,
            "upstream failed",
            [("x-api-key", "secret-key")],
        );

        let entries = store.recent();

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].message, "retrying upstream");
        assert_eq!(entries[1].level, LogLevel::Error);
        assert_eq!(entries[1].fields.get("x-api-key").unwrap(), "[redacted]");
    }

    mod route_prefix {
        use super::super::{build_upstream_headers_for_route, parse_route_prefix, RoutePrefix};
        use crate::config::AuthScheme;
        use axum::http::{HeaderMap, HeaderValue};

        #[test]
        fn parse_anthropic_prefix() {
            let result = parse_route_prefix("/anthropic/v1/messages");
            assert_eq!(result, Some((RoutePrefix::Anthropic, "/v1/messages")));
        }

        #[test]
        fn parse_openai_prefix() {
            let result = parse_route_prefix("/openai/v1/chat/completions");
            assert_eq!(result, Some((RoutePrefix::OpenAI, "/v1/chat/completions")));
        }

        #[test]
        fn reject_invalid_prefix() {
            let result = parse_route_prefix("/v1/messages");
            assert_eq!(result, None);
        }

        #[test]
        fn openai_route_uses_bearer_auth_regardless_of_auth_scheme() {
            let mut original = HeaderMap::new();
            original.insert("content-type", HeaderValue::from_static("application/json"));

            // 即使 auth_scheme 是 ApiKey，OpenAI 路径也应该使用 Bearer
            let headers = build_upstream_headers_for_route(
                &original,
                RoutePrefix::OpenAI,
                &AuthScheme::ApiKey,
                "test-key",
                "/v1/chat/completions",
            );

            assert_eq!(headers.get("authorization").unwrap(), "Bearer test-key");
            assert!(!headers.contains_key("x-api-key"));
            assert!(!headers.contains_key("anthropic-version"));
        }

        #[test]
        fn anthropic_route_with_apikey_scheme_uses_x_api_key() {
            let mut original = HeaderMap::new();
            original.insert("content-type", HeaderValue::from_static("application/json"));

            let headers = build_upstream_headers_for_route(
                &original,
                RoutePrefix::Anthropic,
                &AuthScheme::ApiKey,
                "test-key",
                "/v1/messages",
            );

            assert_eq!(headers.get("x-api-key").unwrap(), "test-key");
            assert!(!headers.contains_key("authorization"));
            assert_eq!(headers.get("anthropic-version").unwrap(), "2023-06-01");
        }

        #[test]
        fn anthropic_route_with_bearer_scheme_uses_authorization() {
            let mut original = HeaderMap::new();
            original.insert("content-type", HeaderValue::from_static("application/json"));

            let headers = build_upstream_headers_for_route(
                &original,
                RoutePrefix::Anthropic,
                &AuthScheme::Bearer,
                "test-key",
                "/v1/messages",
            );

            assert_eq!(headers.get("authorization").unwrap(), "Bearer test-key");
            assert!(!headers.contains_key("x-api-key"));
            assert_eq!(headers.get("anthropic-version").unwrap(), "2023-06-01");
        }
    }

    mod smart_url_join {
        use crate::smart_url_join;

        #[test]
        fn avoids_duplicate_v1_prefix() {
            // base 已包含 /v1，path 也以 /v1 开头 → 去掉 path 的 /v1
            let result = smart_url_join("https://api.example.com/v1", "/v1/chat/completions");
            assert_eq!(result, "https://api.example.com/v1/chat/completions");
        }

        #[test]
        fn normal_join_when_base_missing_v1() {
            // base 不含 /v1 → 直接拼接
            let result = smart_url_join("https://api.example.com", "/v1/chat/completions");
            assert_eq!(result, "https://api.example.com/v1/chat/completions");
        }

        #[test]
        fn handles_trailing_slash() {
            // base 有尾部斜杠 → 先去掉再拼接
            let result = smart_url_join("https://api.example.com/v1/", "/v1/chat/completions");
            assert_eq!(result, "https://api.example.com/v1/chat/completions");
        }

        #[test]
        fn handles_messages_path() {
            // Anthropic messages 路径
            let result = smart_url_join("https://api.anthropic.com/v1", "/v1/messages");
            assert_eq!(result, "https://api.anthropic.com/v1/messages");
        }
    }
}
