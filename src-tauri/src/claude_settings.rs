use anyhow::Result;
use std::fs;
use std::path::PathBuf;

use serde_json::{json, Value};

const BACKUP_KEY: &str = "_fm_backup";

fn settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("settings.json")
}

fn read_settings() -> Result<Value> {
    let path = settings_path();
    if !path.exists() {
        return Ok(json!({}));
    }
    let s = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&s).unwrap_or_else(|_| json!({})))
}

fn write_settings(val: &Value) -> Result<()> {
    let path = settings_path();
    fs::create_dir_all(path.parent().unwrap())?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(val)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

fn local_base_url(port: u16) -> String {
    format!("http://localhost:{}/anthropic", port)
}

const MANAGED_ENV_KEYS: [&str; 3] = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_MODEL",
];

/// 注入代理：把 env.ANTHROPIC_BASE_URL 指到本地代理，同时写入 ANTHROPIC_AUTH_TOKEN。模型固定为 "freemodel-auto"，实际模型由代理层 rewrite。
pub fn inject_proxy(port: u16, auth_token: &str) -> Result<()> {
    let mut val = read_settings()?;

    let already_injected = val
        .get("env")
        .and_then(|e| e.get("ANTHROPIC_BASE_URL"))
        .and_then(|v| v.as_str())
        == Some(local_base_url(port).as_str());

    if !val.get(BACKUP_KEY).map(|v| v.is_object()).unwrap_or(false) && !already_injected {
        let mut backup = serde_json::Map::new();

        let mut env_backup = serde_json::Map::new();
        if let Some(env) = val.get("env").and_then(|e| e.as_object()) {
            for k in MANAGED_ENV_KEYS {
                if let Some(v) = env.get(k) {
                    env_backup.insert(k.to_string(), v.clone());
                }
            }
        }
        backup.insert("env".to_string(), Value::Object(env_backup));

        if let Some(v) = val.get("apiBaseUrl") {
            backup.insert("apiBaseUrl".to_string(), v.clone());
        }

        val.as_object_mut()
            .unwrap()
            .insert(BACKUP_KEY.to_string(), Value::Object(backup));
    }

    {
        let obj = val.as_object_mut().unwrap();
        let env = obj
            .entry("env".to_string())
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        if let Some(env_obj) = env.as_object_mut() {
            env_obj.insert(
                "ANTHROPIC_BASE_URL".to_string(),
                Value::String(local_base_url(port)),
            );
            env_obj.insert(
                "ANTHROPIC_AUTH_TOKEN".to_string(),
                Value::String(auth_token.to_string()),
            );
            env_obj.insert(
                "ANTHROPIC_MODEL".to_string(),
                Value::String("freemodel-auto".to_string()),
            );
        }
        obj.remove("apiBaseUrl");
    }

    write_settings(&val)?;
    Ok(())
}

/// 队列首项变更后，仅刷新 ANTHROPIC_AUTH_TOKEN，模型始终为 "freemodel-auto"。
/// 不动 base url，也不重新写备份。仅在已注入状态下应该被调用。
pub fn update_active(auth_token: &str) -> Result<()> {
    let mut val = read_settings()?;
    let injected = val
        .get("env")
        .and_then(|e| e.get("ANTHROPIC_BASE_URL"))
        .and_then(|v| v.as_str())
        .map(|s| s.starts_with("http://localhost:") || s.starts_with("http://127.0.0.1:"))
        .unwrap_or(false);
    if !injected {
        return Ok(());
    }
    if let Some(env) = val.get_mut("env").and_then(|e| e.as_object_mut()) {
        env.insert(
            "ANTHROPIC_AUTH_TOKEN".to_string(),
            Value::String(auth_token.to_string()),
        );
        env.insert(
            "ANTHROPIC_MODEL".to_string(),
            Value::String("freemodel-auto".to_string()),
        );
    }
    write_settings(&val)?;
    Ok(())
}

/// 撤销注入：从 env 中拿掉本地代理地址，并尽可能从备份还原原值。
pub fn remove_proxy() -> Result<()> {
    let path = settings_path();
    if !path.exists() {
        return Ok(());
    }
    let mut val = read_settings()?;
    apply_restore(&mut val);
    write_settings(&val)?;
    Ok(())
}

/// 主动还原备份（用于「恢复原配置」按钮）。无备份则视为 no-op。
pub fn restore_backup() -> Result<()> {
    let path = settings_path();
    if !path.exists() {
        return Ok(());
    }
    let mut val = read_settings()?;
    apply_restore(&mut val);
    write_settings(&val)?;
    Ok(())
}

fn apply_restore(val: &mut Value) {
    let backup = val.as_object().and_then(|o| o.get(BACKUP_KEY).cloned());

    {
        let obj = val.as_object_mut().unwrap();
        if let Some(env) = obj.get_mut("env").and_then(|e| e.as_object_mut()) {
            for k in MANAGED_ENV_KEYS {
                env.remove(k);
            }
        }
        obj.remove("apiBaseUrl");
    }

    if let Some(Value::Object(backup_obj)) = backup {
        let obj = val.as_object_mut().unwrap();

        if let Some(Value::Object(env_backup)) = backup_obj.get("env") {
            if !env_backup.is_empty() {
                let env = obj
                    .entry("env".to_string())
                    .or_insert_with(|| Value::Object(serde_json::Map::new()));
                if let Some(env_obj) = env.as_object_mut() {
                    for (k, v) in env_backup {
                        env_obj.insert(k.clone(), v.clone());
                    }
                }
            }
        }

        if let Some(api_base) = backup_obj.get("apiBaseUrl") {
            obj.insert("apiBaseUrl".to_string(), api_base.clone());
        }
    }

    val.as_object_mut().unwrap().remove(BACKUP_KEY);
}

/// 当前 settings.json 是否存在备份节点（即处于"已被本应用修改"状态）。
pub fn has_backup() -> bool {
    read_settings()
        .map(|v| v.get(BACKUP_KEY).map(|b| b.is_object()).unwrap_or(false))
        .unwrap_or(false)
}

/// 当前 env.ANTHROPIC_BASE_URL 是否已经指向本地代理。
pub fn is_injected(port: u16) -> bool {
    read_settings()
        .map(|v| {
            v.get("env")
                .and_then(|e| e.get("ANTHROPIC_BASE_URL"))
                .and_then(|s| s.as_str())
                .map(|s| s == local_base_url(port))
                .unwrap_or(false)
        })
        .unwrap_or(false)
}
