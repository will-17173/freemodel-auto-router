use anyhow::Result;
use std::path::PathBuf;
use std::fs;

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
    format!("http://localhost:{}", port)
}

/// 注入代理：把 env.ANTHROPIC_BASE_URL 指到本地代理，
/// 并把会污染鉴权的 ANTHROPIC_AUTH_TOKEN 临时移除。
/// 原值全部备份到顶层 `_fm_backup`，只在第一次注入时记录。
pub fn inject_proxy(port: u16) -> Result<()> {
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
            if let Some(v) = env.get("ANTHROPIC_BASE_URL") {
                env_backup.insert("ANTHROPIC_BASE_URL".to_string(), v.clone());
            }
            if let Some(v) = env.get("ANTHROPIC_AUTH_TOKEN") {
                env_backup.insert("ANTHROPIC_AUTH_TOKEN".to_string(), v.clone());
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
            env_obj.remove("ANTHROPIC_AUTH_TOKEN");
        }
        obj.remove("apiBaseUrl");
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
    let backup = val
        .as_object()
        .and_then(|o| o.get(BACKUP_KEY).cloned());

    {
        let obj = val.as_object_mut().unwrap();
        if let Some(env) = obj.get_mut("env").and_then(|e| e.as_object_mut()) {
            env.remove("ANTHROPIC_BASE_URL");
            env.remove("ANTHROPIC_AUTH_TOKEN");
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
        .map(|v| {
            v.get(BACKUP_KEY)
                .map(|b| b.is_object())
                .unwrap_or(false)
        })
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
