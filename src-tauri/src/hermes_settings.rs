use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use crate::config::Provider;

const BACKUP_KEY: &str = "_fm_backup";

fn hermes_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".hermes")
        .join("config.yaml")
}

/// 检查 model 节点是否已经指向我们的代理
fn is_model_injected(doc: &serde_yaml::Value, port: u16) -> bool {
    doc.get("model")
        .and_then(|m| m.get("default"))
        .and_then(|v| v.as_str())
        .map(|s| s == "freemodel-auto")
        .unwrap_or(false)
        && doc.get("model")
            .and_then(|m| m.get("base_url"))
            .and_then(|v| v.as_str())
            .map(|s| s == format!("http://localhost:{}/openai/v1", port))
            .unwrap_or(false)
}

/// 需要备份的 model 子字段
const MODEL_KEYS_TO_BACKUP: &[&str] = &["default", "provider", "base_url", "api_mode"];

pub fn inject(provider: &Provider, port: u16) -> Result<()> {
    let path = hermes_config_path();
    fs::create_dir_all(path.parent().unwrap())?;

    let content = if path.exists() {
        fs::read_to_string(&path)?
    } else {
        String::new()
    };

    let mut doc: serde_yaml::Value = if content.trim().is_empty() {
        serde_yaml::Value::Mapping(serde_yaml::Mapping::new())
    } else {
        serde_yaml::from_str(&content)?
    };

    let model_id = "freemodel-auto".to_string();
    let base_url = format!("http://localhost:{}/openai/v1", port);

    // --- 在可变借用前读取需要的信息 ---
    let already_injected = is_model_injected(&doc, port);
    let already_has_backup = doc
        .get(BACKUP_KEY)
        .is_some();
    let model_backup_data: Option<serde_yaml::Mapping> = if !already_has_backup && !already_injected {
        doc.get("model")
            .and_then(|m| m.as_mapping())
            .map(|model_map| {
                let mut model_backup = serde_yaml::Mapping::new();
                for k in MODEL_KEYS_TO_BACKUP {
                    if let Some(v) = model_map.get(&serde_yaml::Value::String(k.to_string())) {
                        model_backup.insert(
                            serde_yaml::Value::String(k.to_string()),
                            v.clone(),
                        );
                    }
                }
                model_backup
            })
            .filter(|m| !m.is_empty())
    } else {
        None
    };

    let root = doc.as_mapping_mut().unwrap();

    // --- 备份原始 model 配置（仅首次注入时） ---
    if let Some(model_backup) = model_backup_data {
        let mut backup = serde_yaml::Mapping::new();
        backup.insert(
            serde_yaml::Value::String("model".into()),
            serde_yaml::Value::Mapping(model_backup),
        );
        root.insert(
            serde_yaml::Value::String(BACKUP_KEY.into()),
            serde_yaml::Value::Mapping(backup),
        );
    }

    // --- 修改顶层 model 节点，让 Hermes 真正使用我们的代理 ---
    {
        let model = root
            .entry(serde_yaml::Value::String("model".into()))
            .or_insert_with(|| serde_yaml::Value::Mapping(serde_yaml::Mapping::new()));
        if let Some(model_map) = model.as_mapping_mut() {
            model_map.insert(
                serde_yaml::Value::String("default".into()),
                serde_yaml::Value::String(model_id.clone()),
            );
            model_map.insert(
                serde_yaml::Value::String("provider".into()),
                serde_yaml::Value::String(provider.id.clone()),
            );
            model_map.insert(
                serde_yaml::Value::String("base_url".into()),
                serde_yaml::Value::String(base_url.clone()),
            );
            model_map.insert(
                serde_yaml::Value::String("api_mode".into()),
                serde_yaml::Value::String("chat_completions".into()),
            );
        }
    }

    // --- Upsert custom_providers ---
    let mut provider_entry = serde_yaml::Mapping::new();
    provider_entry.insert(
        serde_yaml::Value::String("name".into()),
        serde_yaml::Value::String(provider.id.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("base_url".into()),
        serde_yaml::Value::String(base_url),
    );
    provider_entry.insert(
        serde_yaml::Value::String("api_key".into()),
        serde_yaml::Value::String(provider.api_key.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("model".into()),
        serde_yaml::Value::String(model_id.clone()),
    );

    let mut models_map = serde_yaml::Mapping::new();
    let mut model_entry = serde_yaml::Mapping::new();
    model_entry.insert(
        serde_yaml::Value::String("context_length".into()),
        serde_yaml::Value::Number(200000.into()),
    );
    models_map.insert(
        serde_yaml::Value::String(model_id),
        serde_yaml::Value::Mapping(model_entry),
    );
    provider_entry.insert(
        serde_yaml::Value::String("models".into()),
        serde_yaml::Value::Mapping(models_map),
    );

    let provider_value = serde_yaml::Value::Mapping(provider_entry);

    let cp_key = serde_yaml::Value::String("custom_providers".into());
    if let Some(seq) = root.get_mut(&cp_key).and_then(|v| v.as_sequence_mut()) {
        let name_key = serde_yaml::Value::String("name".into());
        let name_val = serde_yaml::Value::String(provider.id.clone());
        if let Some(pos) = seq.iter().position(|e| {
            e.as_mapping()
                .and_then(|m| m.get(&name_key))
                == Some(&name_val)
        }) {
            seq[pos] = provider_value;
        } else {
            seq.push(provider_value);
        }
    } else {
        root.insert(
            cp_key,
            serde_yaml::Value::Sequence(vec![provider_value]),
        );
    }

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_yaml::to_string(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn remove(provider_id: &str) -> Result<()> {
    let path = hermes_config_path();
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path)?;
    let mut doc: serde_yaml::Value = serde_yaml::from_str(&content)?;
    let root = doc.as_mapping_mut().unwrap();

    // --- 从 custom_providers 中移除 ---
    let cp_key = serde_yaml::Value::String("custom_providers".into());
    if let Some(seq) = root.get_mut(&cp_key).and_then(|v| v.as_sequence_mut()) {
        let name_key = serde_yaml::Value::String("name".into());
        let name_val = serde_yaml::Value::String(provider_id.to_string());
        seq.retain(|e| {
            e.as_mapping()
                .and_then(|m| m.get(&name_key))
                != Some(&name_val)
        });
    }

    // --- 恢复 model 节点（从备份） ---
    let backup = root
        .get(&serde_yaml::Value::String(BACKUP_KEY.into()))
        .cloned();
    if let Some(serde_yaml::Value::Mapping(backup_obj)) = backup {
        if let Some(serde_yaml::Value::Mapping(model_backup)) = backup_obj.get("model") {
            if let Some(model) = root.get_mut("model").and_then(|m| m.as_mapping_mut()) {
                // 移除我们注入的字段
                for k in MODEL_KEYS_TO_BACKUP {
                    model.remove(&serde_yaml::Value::String(k.to_string()));
                }
                // 恢复备份的原始值
                for (k, v) in model_backup {
                    model.insert(k.clone(), v.clone());
                }
            }
        }
        root.remove(&serde_yaml::Value::String(BACKUP_KEY.into()));
    }

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_yaml::to_string(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

/// Check if Hermes is currently using our proxy (model.default == "freemodel-auto")
pub fn is_injected(_provider_id: &str) -> bool {
    let path = hermes_config_path();
    if !path.exists() {
        return false;
    }

    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return false,
    };

    let doc: serde_yaml::Value = match serde_yaml::from_str(&content) {
        Ok(d) => d,
        Err(_) => return false,
    };

    // 关键：检查 model.default 是否为 freemodel-auto
    doc.get("model")
        .and_then(|m| m.get("default"))
        .and_then(|v| v.as_str())
        .map(|s| s == "freemodel-auto")
        .unwrap_or(false)
}
