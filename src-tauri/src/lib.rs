mod auth;
mod claude_settings;
mod codex_settings;
mod hermes_settings;
mod openclaw_settings;
mod config;
mod proxy;
mod proxy_log;
mod router;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cfg = config::load_config();
    let port = cfg.port;
    let auth_map = auth::load_auth();
    let shared_router = router::new_router_with_auth(&cfg, auth_map);
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
                    let name = notify_rx.borrow().clone();
                    if !name.is_empty() {
                        use tauri::Emitter;
                        let _ = app_handle.emit("provider-switched", &name);
                    }
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
            get_exhausted_indices_cmd,
            get_active_idx_cmd,
            reset_exhausted_cmd,
            get_auth_cmd,
            save_auth_cmd,
            has_auth_cmd,
            get_all_auth_cmd,
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
async fn get_exhausted_indices_cmd(
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<Vec<usize>, String> {
    Ok(router.read().await.get_exhausted_indices())
}

#[tauri::command]
async fn get_active_idx_cmd(
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<usize, String> {
    Ok(router.read().await.active_idx)
}

#[tauri::command]
async fn reset_exhausted_cmd(
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    router.write().await.reset_exhausted();
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
