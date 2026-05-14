mod auth;
mod claude_settings;
mod codex_settings;
mod hermes_settings;
mod openclaw_settings;
mod config;
mod proxy;
mod proxy_log;
mod router;
mod providers;

use std::sync::Arc;
use tauri::Manager;
use tokio::sync::{watch, Mutex};

/// Managed state for proxy lifecycle control — wrapped in Arc<Mutex>
/// so the restart command can replace the shutdown sender.
struct ProxyHandleInner {
    shutdown_tx: watch::Sender<bool>,
    notify_tx: Arc<watch::Sender<String>>,
    proxy_logs: proxy_log::ProxyLogStore,
}

struct ProxyHandle(Arc<Mutex<ProxyHandleInner>>);

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProviderSwitchedPayload {
    pub queue_id: String,
    pub provider_name: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 检查是否需要迁移（providers.json 不存在时）
    if providers::needs_migration() {
        let legacy_providers = providers::read_legacy_providers();
        if let Err(e) = providers::migrate_legacy_config(legacy_providers) {
            log::error!("[migrate] migration failed: {e}");
        }
    }

    let cfg = config::load_config();
    let port = cfg.port;
    let auth_map = auth::load_auth();
    let all_providers = providers::get_all_providers();
    let shared_router = router::new_router_with_providers(&cfg, all_providers, auth_map);
    let proxy_logs = proxy_log::ProxyLogStore::new(200);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(shared_router.clone())
        .manage(proxy_logs.clone())
        .setup(move |app| {
            let router_clone = shared_router.clone();
            let proxy_logs_clone = proxy_logs.clone();
            let (notify_tx, mut notify_rx) = tokio::sync::watch::channel(String::new());
            let notify_tx = Arc::new(notify_tx);
            let (shutdown_tx, shutdown_rx) = tokio::sync::watch::channel(false);

            // Start proxy server in background
            let router_for_proxy = router_clone.clone();
            let notify_for_proxy = notify_tx.clone();
            let logs_for_proxy = proxy_logs_clone.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = proxy::start_proxy(router_for_proxy, notify_for_proxy, logs_for_proxy, port, shutdown_rx).await {
                    log::error!("proxy error: {e}");
                }
            });

            // Listen for provider switch notifications and emit to frontend
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                while notify_rx.changed().await.is_ok() {
                    let payload_str = notify_rx.borrow().clone();
                    if !payload_str.is_empty() {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&payload_str) {
                            let event_payload = ProviderSwitchedPayload {
                                queue_id: json["queue_id"].as_str().unwrap_or("default").to_string(),
                                provider_name: json["provider_name"].as_str().unwrap_or("").to_string(),
                            };
                            use tauri::Emitter;
                            let _ = app_handle.emit("provider-switched", &event_payload);
                        }
                    }
                }
            });

            // 启动后异步检查线上版本
            let router_for_sync = router_clone.clone();
            tauri::async_runtime::spawn(async move {
                let (_, updated) = providers::sync_providers().await;
                if updated {
                    let new_providers = providers::get_all_providers();
                    router_for_sync.write().await.providers = new_providers;
                    log::info!("[sync] router providers refreshed after remote update");
                }
            });

            // Store proxy handle for restart capability
            app.manage(ProxyHandle(Arc::new(Mutex::new(ProxyHandleInner {
                shutdown_tx,
                notify_tx,
                proxy_logs: proxy_logs_clone,
            }))));

            // System tray
            let _tray = tauri::tray::TrayIconBuilder::new()
                .tooltip("freemodel router")
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide to tray instead of quitting
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config_cmd,
            inject_proxy_cmd,
            update_active_cmd,
            remove_proxy_cmd,
            restore_backup_cmd,
            has_backup_cmd,
            is_injected_cmd,
            get_proxy_logs_cmd,
            restart_proxy_cmd,
            inject_codex_cmd,
            remove_codex_cmd,
            inject_hermes_cmd,
            remove_hermes_cmd,
            is_hermes_injected_cmd,
            inject_openclaw_cmd,
            remove_openclaw_cmd,
            get_queue_states_cmd,
            reset_queue_exhausted_cmd,
            create_queue_cmd,
            delete_queue_cmd,
            update_queue_cmd,
            get_app_mappings_cmd,
            update_app_mapping_cmd,
            set_default_queue_cmd,
            get_auth_cmd,
            save_auth_cmd,
            has_auth_cmd,
            get_all_auth_cmd,
            test_provider_connection_cmd,
            get_providers_cmd,
            save_custom_provider_cmd,
            delete_custom_provider_cmd,
            add_custom_model_to_builtin_cmd,
            delete_custom_model_from_builtin_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // Clean up on exit
    let _ = claude_settings::remove_proxy();
}

#[tauri::command]
fn get_config() -> config::AppConfig {
    config::load_config()
}

#[tauri::command]
async fn save_config_cmd(
    cfg: config::AppConfig,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    router.write().await.replace_config(&cfg);
    Ok(())
}

#[tauri::command]
fn inject_proxy_cmd(
    port: u16,
    auth_token: String,
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match claude_settings::inject_proxy(port, &auth_token) {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "Claude Code 注入已开启",
                [("app", "Claude Code"), ("action", "inject"), ("port", &port.to_string())],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("Claude Code 注入失败: {e}"),
                [("app", "Claude Code"), ("action", "inject"), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn update_active_cmd(auth_token: String) -> Result<(), String> {
    claude_settings::update_active(&auth_token).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_proxy_cmd(
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match claude_settings::remove_proxy() {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "Claude Code 注入已关闭",
                [("app", "Claude Code"), ("action", "remove")],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("Claude Code 注入关闭失败: {e}"),
                [("app", "Claude Code"), ("action", "remove"), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn restore_backup_cmd(
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match claude_settings::restore_backup() {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "Claude Code 配置已恢复备份",
                [("app", "Claude Code"), ("action", "restore")],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("Claude Code 配置恢复失败: {e}"),
                [("app", "Claude Code"), ("action", "restore"), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn has_backup_cmd() -> bool {
    claude_settings::has_backup()
}

#[tauri::command]
fn is_injected_cmd(port: u16) -> bool {
    claude_settings::is_injected(port)
}

#[tauri::command]
fn get_proxy_logs_cmd(
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Vec<proxy_log::ProxyLogEntry> {
    logs.recent()
}

#[tauri::command]
async fn restart_proxy_cmd(
    port: u16,
    handle: tauri::State<'_, ProxyHandle>,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    let inner = handle.0.lock().await;

    // Signal the old proxy to shut down
    inner.shutdown_tx.send(true).map_err(|e| e.to_string())?;

    // Small delay to let the old listener release the port
    drop(inner);
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;

    let mut inner = handle.0.lock().await;

    // Create new shutdown channel and restart
    let (new_shutdown_tx, new_shutdown_rx) = tokio::sync::watch::channel(false);
    let router_clone = router.inner().clone();
    let notify_clone = inner.notify_tx.clone();
    let logs_clone = inner.proxy_logs.clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) = proxy::start_proxy(router_clone, notify_clone, logs_clone, port, new_shutdown_rx).await {
            log::error!("proxy restart error: {e}");
        }
    });

    // Replace the shutdown sender so future restarts work
    inner.shutdown_tx = new_shutdown_tx;

    Ok(())
}

#[tauri::command]
fn inject_codex_cmd(
    provider_id: String,
    api_key: String,
    port: u16,
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match codex_settings::inject(&provider_id, &api_key, port) {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "Codex 注入已开启",
                [("app", "Codex"), ("action", "inject"), ("provider_id", &provider_id), ("port", &port.to_string())],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("Codex 注入失败: {e}"),
                [("app", "Codex"), ("action", "inject"), ("provider_id", &provider_id), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn remove_codex_cmd(
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match codex_settings::remove() {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "Codex 注入已关闭",
                [("app", "Codex"), ("action", "remove")],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("Codex 注入关闭失败: {e}"),
                [("app", "Codex"), ("action", "remove"), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn inject_hermes_cmd(
    provider_id: String,
    api_key: String,
    port: u16,
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match hermes_settings::inject(&provider_id, &api_key, port) {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "Hermes 注入已开启",
                [("app", "Hermes"), ("action", "inject"), ("provider_id", &provider_id), ("port", &port.to_string())],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("Hermes 注入失败: {e}"),
                [("app", "Hermes"), ("action", "inject"), ("provider_id", &provider_id), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn remove_hermes_cmd(
    provider_id: String,
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match hermes_settings::remove(&provider_id) {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "Hermes 注入已关闭",
                [("app", "Hermes"), ("action", "remove"), ("provider_id", &provider_id)],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("Hermes 注入关闭失败: {e}"),
                [("app", "Hermes"), ("action", "remove"), ("provider_id", &provider_id), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn is_hermes_injected_cmd(provider_id: String) -> bool {
    hermes_settings::is_injected(&provider_id)
}

#[tauri::command]
fn inject_openclaw_cmd(
    provider_id: String,
    api_key: String,
    models: Vec<config::Model>,
    port: u16,
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match openclaw_settings::inject(&provider_id, &api_key, &models, port) {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "OpenClaw 注入已开启",
                [("app", "OpenClaw"), ("action", "inject"), ("provider_id", &provider_id), ("port", &port.to_string())],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("OpenClaw 注入失败: {e}"),
                [("app", "OpenClaw"), ("action", "inject"), ("provider_id", &provider_id), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn remove_openclaw_cmd(
    provider_id: String,
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Result<(), String> {
    match openclaw_settings::remove(&provider_id) {
        Ok(()) => {
            logs.push(
                proxy_log::LogLevel::Info,
                "OpenClaw 注入已关闭",
                [("app", "OpenClaw"), ("action", "remove"), ("provider_id", &provider_id)],
            );
            Ok(())
        }
        Err(e) => {
            logs.push(
                proxy_log::LogLevel::Error,
                format!("OpenClaw 注入关闭失败: {e}"),
                [("app", "OpenClaw"), ("action", "remove"), ("provider_id", &provider_id), ("error", &e.to_string())],
            );
            Err(e.to_string())
        }
    }
}

#[tauri::command]
async fn get_queue_states_cmd(
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<std::collections::HashMap<String, router::QueueStateInfo>, String> {
    Ok(router.read().await.get_all_queue_states())
}

#[tauri::command]
async fn reset_queue_exhausted_cmd(
    queue_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    router.write().await.reset_queue_exhausted(&queue_id);
    Ok(())
}

#[tauri::command]
fn get_auth_cmd(provider_id: String) -> Option<String> {
    auth::get_api_key(&provider_id)
}

#[tauri::command]
async fn save_auth_cmd(provider_id: String, api_key: String, router: tauri::State<'_, router::SharedRouter>) -> Result<(), String> {
    auth::save_api_key(&provider_id, &api_key).map_err(|e| e.to_string())?;
    // 更新 router 的 auth_map
    let auth_map = auth::load_auth();
    router.write().await.update_auth(auth_map);
    Ok(())
}

#[tauri::command]
fn has_auth_cmd(provider_id: String) -> bool {
    auth::get_api_key(&provider_id).map(|k| k.trim().len() > 0).unwrap_or(false)
}

#[tauri::command]
fn get_all_auth_cmd() -> std::collections::HashMap<String, bool> {
    auth::has_auth_map()
}

#[tauri::command]
async fn test_provider_connection_cmd(
    provider_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<TestConnectionResult, String> {
    let (provider, api_key) = {
        let r = router.read().await;
        let provider = r.providers.iter().find(|p| p.id == provider_id)
            .cloned()
            .ok_or_else(|| format!("Provider '{}' not found", provider_id))?;
        let api_key = r.get_api_key(&provider_id).unwrap_or_default().to_owned();
        (provider, api_key)
    };

    if api_key.is_empty() {
        return Err("API Key 未配置".to_string());
    }

    test_provider_connection(provider, api_key).await
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TestConnectionResult {
    pub success: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

// ===== 队列管理 =====

#[tauri::command]
async fn create_queue_cmd(
    name: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<config::Queue, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    let id = format!("queue-{:08x}", ts);

    let queue = config::Queue {
        id: id.clone(),
        name,
        items: vec![],
    };

    // Update router state
    router.write().await.queues.insert(
        id.clone(),
        router::QueueState::from_items(vec![]),
    );

    // Save config
    let mut cfg = config::load_config();
    cfg.queues.insert(id, queue.clone());
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    Ok(queue)
}

#[tauri::command]
async fn delete_queue_cmd(
    queue_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // Cannot delete default queue
    let cfg = config::load_config();
    if queue_id == cfg.default_queue_id {
        return Err("不能删除默认队列".to_string());
    }

    // Update router state
    router.write().await.queues.remove(&queue_id);

    // Save config
    let mut cfg = config::load_config();
    cfg.queues.remove(&queue_id);
    // Remove associated app_mapping entries
    cfg.app_mapping.retain(|m| m.queue_id != queue_id);
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn update_queue_cmd(
    queue_id: String,
    name: String,
    items: Vec<config::QueueItem>,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // Update router state
    {
        let mut r = router.write().await;
        if let Some(queue_state) = r.queues.get_mut(&queue_id) {
            let n = items.len();
            queue_state.items = items.clone();
            queue_state.fail_counts = vec![0; n];
            queue_state.exhausted_indices.clear();
            queue_state.active_idx = 0;
        }
    }

    // Save config
    let mut cfg = config::load_config();
    if let Some(queue) = cfg.queues.get_mut(&queue_id) {
        queue.name = name;
        queue.items = items;
    }
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn get_app_mappings_cmd() -> Vec<config::AppMapping> {
    config::load_config().app_mapping
}

#[tauri::command]
async fn set_default_queue_cmd(
    queue_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // Update router state
    router.write().await.default_queue_id = queue_id.clone();

    // Save config
    let mut cfg = config::load_config();
    cfg.default_queue_id = queue_id;
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn update_app_mapping_cmd(
    app_id: String,
    queue_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // Save config
    let mut cfg = config::load_config();
    if let Some(mapping) = cfg.app_mapping.iter_mut().find(|m| m.app_id == app_id) {
        mapping.queue_id = queue_id;
    } else {
        cfg.app_mapping.push(config::AppMapping {
            app_id: app_id.clone(),
            display_name: app_id,
            match_rules: vec![],
            queue_id,
        });
    }

    // Update router state
    router.write().await.app_mapping = cfg.app_mapping.clone();

    config::save_config(&cfg).map_err(|e| e.to_string())?;
    Ok(())
}

// ===== 供应商管理（新架构）=====

#[tauri::command]
fn get_providers_cmd() -> Vec<config::Provider> {
    providers::get_all_providers()
}

#[tauri::command]
async fn save_custom_provider_cmd(
    provider: config::Provider,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    providers::save_custom_provider(&provider).map_err(|e| e.to_string())?;
    // 更新 router 的内存中供应商
    let mut r = router.write().await;
    let existing = r.providers.iter().position(|p| p.id == provider.id);
    match existing {
        Some(idx) => r.providers[idx] = provider,
        None => r.providers.push(provider),
    }
    Ok(())
}

#[tauri::command]
async fn delete_custom_provider_cmd(
    provider_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // 删除关联的 auth
    auth::delete_api_key(&provider_id).map_err(|e| e.to_string())?;

    // 更新 router state
    {
        let mut r = router.write().await;
        r.providers.retain(|p| p.id != provider_id);
        let auth_map = auth::load_auth();
        r.update_auth(auth_map);
    }

    providers::delete_custom_provider(&provider_id).map_err(|e| e.to_string())?;

    // 从队列中移除
    let mut cfg = config::load_config();
    for queue in cfg.queues.values_mut() {
        queue.items.retain(|item| item.provider_id != provider_id);
    }
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn add_custom_model_to_builtin_cmd(
    provider_id: String,
    model: config::Model,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    let mut model = model;
    model.is_custom = true;
    providers::add_custom_model_to_builtin(&provider_id, &model).map_err(|e| e.to_string())?;
    // 更新 router
    let mut r = router.write().await;
    if let Some(provider) = r.providers.iter_mut().find(|p| p.id == provider_id) {
        provider.models.push(model);
    }
    Ok(())
}

#[tauri::command]
async fn delete_custom_model_from_builtin_cmd(
    provider_id: String,
    model_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // 更新 router state
    {
        let mut r = router.write().await;
        if let Some(provider) = r.providers.iter_mut().find(|p| p.id == provider_id) {
            provider.models.retain(|m| m.id != model_id);
        }
    }

    providers::delete_custom_model_from_builtin(&provider_id, &model_id).map_err(|e| e.to_string())?;

    // 从队列中移除
    let mut cfg = config::load_config();
    for queue in cfg.queues.values_mut() {
        queue.items.retain(|item| item.provider_id != provider_id || item.model_id != model_id);
    }
    config::save_config(&cfg).map_err(|e| e.to_string())?;

    Ok(())
}

async fn test_provider_connection(provider: config::Provider, api_key: String) -> Result<TestConnectionResult, String> {
    use std::time::Instant;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let start = Instant::now();

    // 根据协议选择测试端点
    match provider.protocol {
        config::Protocol::Anthropic => {
            // 使用 anthropic_url 测试 /v1/messages - 发送最小请求
            let url = if provider.anthropic_url.is_empty() {
                return Err("anthropic_url 未配置".to_string());
            } else {
                format!("{}{}", provider.anthropic_url.trim_end_matches('/'), "/v1/messages")
            };

            let mut headers = reqwest::header::HeaderMap::new();
            headers.insert("content-type", reqwest::header::HeaderValue::from_static("application/json"));

            match provider.effective_auth_scheme() {
                config::AuthScheme::Bearer => {
                    if let Ok(value) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", api_key)) {
                        headers.insert("authorization", value);
                    }
                }
                config::AuthScheme::ApiKey => {
                    if let Ok(value) = reqwest::header::HeaderValue::from_str(&api_key) {
                        headers.insert("x-api-key", value);
                    }
                }
            }
            headers.insert("anthropic-version", reqwest::header::HeaderValue::from_static("2023-06-01"));

            // 发送最小请求测试连接
            let test_body = serde_json::json!({
                "model": provider.models.first().map(|m| m.id.as_str()).unwrap_or("claude-3-haiku-20240307"),
                "max_tokens": 1,
                "messages": [{"role": "user", "content": "test"}]
            });

            let response = client
                .post(&url)
                .headers(headers)
                .json(&test_body)
                .send()
                .await;

            match response {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let latency_ms = start.elapsed().as_millis() as u64;

                    if status == 200 || status == 201 {
                        Ok(TestConnectionResult {
                            success: true,
                            message: "连接成功".to_string(),
                            latency_ms: Some(latency_ms),
                        })
                    } else if status == 401 {
                        Ok(TestConnectionResult {
                            success: false,
                            message: "API Key 无效".to_string(),
                            latency_ms: Some(latency_ms),
                        })
                    } else if status == 429 {
                        Ok(TestConnectionResult {
                            success: false,
                            message: "请求频率限制".to_string(),
                            latency_ms: Some(latency_ms),
                        })
                    } else {
                        let error_text = resp.text().await.unwrap_or_default();
                        Ok(TestConnectionResult {
                            success: false,
                            message: format!("HTTP {}: {}", status, error_text.chars().take(100).collect::<String>()),
                            latency_ms: Some(latency_ms),
                        })
                    }
                }
                Err(e) => {
                    Ok(TestConnectionResult {
                        success: false,
                        message: format!("连接失败: {}", e),
                        latency_ms: None,
                    })
                }
            }
        }
        config::Protocol::OpenAI => {
            // 使用 openai_url 测试 /v1/models 端点（更简单）
            let url = if provider.openai_url.is_empty() {
                return Err("openai_url 未配置".to_string());
            } else {
                format!("{}{}", provider.openai_url.trim_end_matches('/'), "/v1/models")
            };

            let mut headers = reqwest::header::HeaderMap::new();
            if let Ok(value) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", api_key)) {
                headers.insert("authorization", value);
            }

            let response = client
                .get(&url)
                .headers(headers)
                .send()
                .await;

            match response {
                Ok(resp) => {
                    let status = resp.status().as_u16();
                    let latency_ms = start.elapsed().as_millis() as u64;

                    if status == 200 {
                        Ok(TestConnectionResult {
                            success: true,
                            message: "连接成功".to_string(),
                            latency_ms: Some(latency_ms),
                        })
                    } else if status == 401 {
                        Ok(TestConnectionResult {
                            success: false,
                            message: "API Key 无效".to_string(),
                            latency_ms: Some(latency_ms),
                        })
                    } else if status == 429 {
                        Ok(TestConnectionResult {
                            success: false,
                            message: "请求频率限制".to_string(),
                            latency_ms: Some(latency_ms),
                        })
                    } else {
                        let error_text = resp.text().await.unwrap_or_default();
                        Ok(TestConnectionResult {
                            success: false,
                            message: format!("HTTP {}: {}", status, error_text.chars().take(100).collect::<String>()),
                            latency_ms: Some(latency_ms),
                        })
                    }
                }
                Err(e) => {
                    Ok(TestConnectionResult {
                        success: false,
                        message: format!("连接失败: {}", e),
                        latency_ms: None,
                    })
                }
            }
        }
    }
}
