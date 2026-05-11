use crate::config::AuthScheme;
use crate::router::FailureAction;
use crate::router::SharedRouter;
use axum::body::Body;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, Request, Response, StatusCode};
use axum::routing::any;
use axum::Router;
use http_body_util::BodyExt;
use std::sync::Arc;
use tokio::sync::watch;

pub const PROXY_PORT: u16 = 7860;

#[derive(Clone)]
pub struct ProxyState {
    pub router: SharedRouter,
    pub notify_tx: Arc<watch::Sender<String>>,
    pub http_client: reqwest::Client,
}

pub async fn start_proxy(
    router: SharedRouter,
    notify_tx: Arc<watch::Sender<String>>,
) -> anyhow::Result<()> {
    let client = reqwest::Client::builder().build()?;

    let state = ProxyState {
        router,
        notify_tx,
        http_client: client,
    };

    let app = Router::new()
        .fallback(any(proxy_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", PROXY_PORT)).await?;
    log::info!("proxy listening on 127.0.0.1:{}", PROXY_PORT);
    axum::serve(listener, app).await?;
    Ok(())
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

    log::debug!(
        "[proxy] inbound {} {} | has_auth={} has_xkey={} ct={:?}",
        method,
        path,
        original_headers.contains_key("authorization"),
        original_headers.contains_key("x-api-key"),
        original_headers.get("content-type").and_then(|v| v.to_str().ok()),
    );

    let retry_delay = {
        let r = state.router.read().await;
        r.retry.retry_delay_secs
    };

    loop {
        let (base_url, api_key, protocol, auth_scheme, model_id, provider_name) = {
            let r = state.router.read().await;
            match r.active_entry() {
                Some((p, mid)) => (
                    p.base_url.clone(),
                    p.api_key.clone(),
                    p.protocol.clone(),
                    p.effective_auth_scheme(),
                    mid.to_owned(),
                    p.name.clone(),
                ),
                None => {
                    return error_response(
                        StatusCode::SERVICE_UNAVAILABLE,
                        "no available provider in queue",
                    )
                }
            }
        };

        // Rewrite the "model" field in the request body to match the queue item
        let final_body = rewrite_model_field(&body_bytes, &model_id);

        let url = format!("{}{}", base_url.trim_end_matches('/'), path);
        let reqwest_method = reqwest::Method::from_bytes(method.as_str().as_bytes())
            .unwrap_or(reqwest::Method::POST);

        let mut req_builder = state
            .http_client
            .request(reqwest_method, &url)
            .body(final_body);

        req_builder = req_builder.headers(build_upstream_headers(
            &original_headers,
            &auth_scheme,
            &api_key,
            &path,
        ));

        log::debug!(
            "[proxy] outbound -> {} | provider={} model={} protocol={:?}",
            url,
            provider_name,
            model_id,
            protocol,
        );

        match req_builder.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if is_retryable_error(status) {
                    let failure_action = {
                        let mut r = state.router.write().await;
                        r.record_failure()
                    };
                    match failure_action {
                        FailureAction::SwitchProvider => {
                            let next_name = {
                                let r = state.router.read().await;
                                r.active_entry()
                                    .map(|(p, mid)| format!("{} / {}", p.name, mid))
                                    .unwrap_or_default()
                            };
                            let _ = state.notify_tx.send(next_name);
                            continue;
                        }
                        FailureAction::RetryCurrent => {
                            tokio::time::sleep(std::time::Duration::from_secs(
                                retry_delay as u64,
                            ))
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
                let failure_action = {
                    let mut r = state.router.write().await;
                    r.record_failure()
                };
                match failure_action {
                    FailureAction::SwitchProvider => {
                        let next_name = {
                            let r = state.router.read().await;
                            r.active_entry()
                                .map(|(p, mid)| format!("{} / {}", p.name, mid))
                                .unwrap_or_default()
                        };
                        let _ = state.notify_tx.send(next_name);
                        continue;
                    }
                    FailureAction::RetryCurrent => {
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
    use axum::http::{HeaderMap, HeaderValue};

    #[test]
    fn upstream_message_headers_preserve_anthropic_beta_and_add_version() {
        let mut original = HeaderMap::new();
        original.insert("anthropic-beta", HeaderValue::from_static("claude-code-20250219"));
        original.insert("content-type", HeaderValue::from_static("application/json"));
        original.insert("authorization", HeaderValue::from_static("Bearer inbound-token"));
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
            assert!(!is_retryable_error(status), "{status} should not be retryable");
        }
    }
}
