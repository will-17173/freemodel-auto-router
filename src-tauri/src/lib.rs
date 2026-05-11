mod claude_settings;
mod config;
mod proxy;
mod proxy_log;
mod router;

use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cfg = config::load_config();
    let shared_router = router::new_router(&cfg);
    let proxy_logs = proxy_log::ProxyLogStore::new(200);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(shared_router.clone())
        .manage(proxy_logs.clone())
        .setup(move |app| {
            let router_clone = shared_router.clone();
            let proxy_logs = proxy_logs.clone();
            let (notify_tx, mut notify_rx) = tokio::sync::watch::channel(String::new());
            let notify_tx = Arc::new(notify_tx);

            // Start proxy server in background
            tauri::async_runtime::spawn(async move {
                if let Err(e) = proxy::start_proxy(router_clone, notify_tx, proxy_logs).await {
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
fn inject_proxy_cmd(auth_token: String, model: String) -> Result<(), String> {
    claude_settings::inject_proxy(proxy::PROXY_PORT, &auth_token, &model).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_active_cmd(auth_token: String, model: String) -> Result<(), String> {
    claude_settings::update_active(&auth_token, &model).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_proxy_cmd() -> Result<(), String> {
    claude_settings::remove_proxy().map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_backup_cmd() -> Result<(), String> {
    claude_settings::restore_backup().map_err(|e| e.to_string())
}

#[tauri::command]
fn has_backup_cmd() -> bool {
    claude_settings::has_backup()
}

#[tauri::command]
fn is_injected_cmd() -> bool {
    claude_settings::is_injected(proxy::PROXY_PORT)
}

#[tauri::command]
fn get_proxy_logs_cmd(
    logs: tauri::State<'_, proxy_log::ProxyLogStore>,
) -> Vec<proxy_log::ProxyLogEntry> {
    logs.recent()
}
