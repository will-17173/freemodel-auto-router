use crate::config::AuthScheme;
use crate::proxy_log::{LogLevel, ProxyLogEntry, ProxyLogStore};
use crate::router::FailureAction;
use crate::router::SharedRouter;
use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, Request, Response, StatusCode};
use axum::routing::{any, get};
use axum::{Json, Router};
use http_body_util::BodyExt;
use std::sync::Arc;
use tokio::sync::watch;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RoutePrefix {
    Anthropic,
    OpenAI,
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
        "[proxy] inbound {} {} | queue_id={} has_auth={}",
        method,
        path,
        queue_id,
        original_headers.contains_key("authorization"),
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
                    let target_url = match route_prefix {
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

        // Rewrite the "model" field in the request body to match the queue item
        let final_body = rewrite_model_field(&body_bytes, &model_id);

        let url = smart_url_join(&target_url, &stripped_path);
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
            "[proxy] outbound -> {} | provider={} model={} protocol={:?}",
            url,
            provider_name,
            model_id,
            protocol,
        );
        state.logs.push(
            LogLevel::Info,
            "forwarding upstream",
            [
                ("provider", provider_name.clone()),
                ("model", model_id.clone()),
                ("url", url.clone()),
            ],
        );

        let start_time = std::time::Instant::now();
        match req_builder.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let duration_ms = start_time.elapsed().as_millis() as u64;
                let input_tokens: Option<u64> = None;
                let output_tokens: Option<u64> = None;
                state.logs.push_detailed(
                    if is_retryable_error(status) {
                        LogLevel::Warn
                    } else {
                        LogLevel::Info
                    },
                    "upstream response",
                    [("status", status.to_string())],
                    Some(provider_name.clone()),
                    Some(model_id.clone()),
                    Some(status),
                    input_tokens,
                    output_tokens,
                    Some(duration_ms),
                    Some(inbound_headers_map.clone()),
                );
                if is_retryable_error(status) {
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

                let _ = provider_name; // suppress unused warning
                let resp_status = StatusCode::from_u16(status).unwrap_or(StatusCode::OK);

                let mut builder = Response::builder().status(resp_status);

                for (key, value) in resp.headers().iter() {
                    if should_forward_response_header(key.as_str()) {
                        builder = builder.header(key.as_str(), value.clone());
                    }
                }

                let stream = resp.bytes_stream();
                let body = Body::from_stream(stream);
                return builder.body(body).unwrap_or_else(|_| {
                    error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "failed to build response",
                    )
                });
            }
            Err(e) => {
                log::warn!("proxy request error: {}", e);
                state.logs.push(
                    LogLevel::Error,
                    "upstream request error",
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

/// 智能拼接 URL，避免路径重复
/// 例如：
/// - base: "https://api.example.com/v1", path: "/v1/chat/completions"
///   → "https://api.example.com/v1/chat/completions"
/// - base: "https://api.example.com", path: "/v1/chat/completions"
///   → "https://api.example.com/v1/chat/completions"
fn smart_url_join(base: &str, path: &str) -> String {
    let base_trimmed = base.trim_end_matches('/');

    // 检查 path 的路径部分是否已经在 base 中存在
    // 例如 base 以 "/v1" 结尾，path 以 "/v1" 开头
    if let Some(stripped) = path.strip_prefix("/v1") {
        if base_trimmed.ends_with("/v1") {
            // 避免重复，去掉 path 的 "/v1" 前缀
            return format!("{}{}", base_trimmed, stripped);
        }
    }

    // 默认直接拼接
    format!("{}{}", base_trimmed, path)
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
        use super::super::smart_url_join;

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
