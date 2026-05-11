use crate::config::Protocol;
use crate::router::SharedRouter;
use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, Response, StatusCode};
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

    let retry_delay = {
        let r = state.router.read().await;
        r.retry.retry_delay_secs
    };

    loop {
        let (base_url, api_key, protocol, model_id, provider_name) = {
            let r = state.router.read().await;
            match r.active_entry() {
                Some((p, mid)) => (
                    p.base_url.clone(),
                    p.api_key.clone(),
                    p.protocol.clone(),
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

        match protocol {
            Protocol::Anthropic => {
                req_builder = req_builder
                    .header("x-api-key", &api_key)
                    .header("anthropic-version", "2023-06-01");
            }
            Protocol::OpenAI => {
                req_builder =
                    req_builder.header("Authorization", format!("Bearer {}", api_key));
            }
        }

        if let Some(ct) = original_headers.get("content-type") {
            req_builder = req_builder.header("content-type", ct.clone());
        }
        if let Some(accept) = original_headers.get("accept") {
            req_builder = req_builder.header("accept", accept.clone());
        }

        match req_builder.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if is_retryable_error(status) {
                    let switched = {
                        let mut r = state.router.write().await;
                        r.record_failure()
                    };
                    if switched {
                        let next_name = {
                            let r = state.router.read().await;
                            r.active_entry()
                                .map(|(p, mid)| format!("{} / {}", p.name, mid))
                                .unwrap_or_default()
                        };
                        let _ = state.notify_tx.send(next_name);
                        continue;
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(retry_delay as u64)).await;
                    continue;
                }

                let _ = provider_name; // suppress unused warning
                let resp_status = StatusCode::from_u16(status).unwrap_or(StatusCode::OK);
                let mut builder = Response::builder().status(resp_status);

                for (key, value) in resp.headers().iter() {
                    builder = builder.header(key.as_str(), value.clone());
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
                let switched = {
                    let mut r = state.router.write().await;
                    r.record_failure()
                };
                if switched {
                    let next_name = {
                        let r = state.router.read().await;
                        r.active_entry()
                            .map(|(p, mid)| format!("{} / {}", p.name, mid))
                            .unwrap_or_default()
                    };
                    let _ = state.notify_tx.send(next_name);
                    continue;
                }
                tokio::time::sleep(std::time::Duration::from_secs(retry_delay as u64)).await;
                continue;
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

fn is_retryable_error(status: u16) -> bool {
    matches!(status, 429 | 503)
}

fn error_response(status: StatusCode, msg: &str) -> Response<Body> {
    let body = serde_json::json!({ "error": msg }).to_string();
    Response::builder()
        .status(status)
        .header("content-type", "application/json")
        .body(Body::from(body))
        .unwrap()
}
