use anyhow::Result;
use std::fs;
use std::path::PathBuf;

const BACKUP_KEY: &str = "_fm_backup";

fn yaml_key(key: &str) -> serde_yaml::Value {
    serde_yaml::Value::String(key.to_string())
}

fn hermes_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".hermes")
        .join("config.yaml")
}

fn write_config(path: &PathBuf, doc: &serde_yaml::Value) -> Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_yaml::to_string(doc)?)?;

    #[cfg(windows)]
    {
        // std::fs::rename cannot replace an existing destination on Windows.
        // Hermes normally already has config.yaml, so copy over it instead.
        fs::copy(&tmp, path)?;
        fs::remove_file(&tmp)?;
    }

    #[cfg(not(windows))]
    {
        fs::rename(&tmp, path)?;
    }

    Ok(())
}

/// 检查 model 节点是否已经指向我们的代理
fn is_model_injected(doc: &serde_yaml::Value, port: u16) -> bool {
    doc.get("model")
        .and_then(|m| m.get("default"))
        .and_then(|v| v.as_str())
        .map(|s| s == "freemodel-auto")
        .unwrap_or(false)
        && doc
            .get("model")
            .and_then(|m| m.get("base_url"))
            .and_then(|v| v.as_str())
            .map(|s| s == format!("http://localhost:{}/openai/v1", port))
            .unwrap_or(false)
}

/// 需要备份的 model 子字段
const MODEL_KEYS_TO_BACKUP: &[&str] = &["default", "provider", "base_url", "api_mode"];

pub fn inject(provider_id: &str, api_key: &str, port: u16) -> Result<()> {
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
    let already_has_backup = doc.get(BACKUP_KEY).is_some();
    let model_backup_data: Option<serde_yaml::Mapping> = if !already_has_backup && !already_injected
    {
        doc.get("model")
            .and_then(|m| m.as_mapping())
            .map(|model_map| {
                let mut model_backup = serde_yaml::Mapping::new();
                for k in MODEL_KEYS_TO_BACKUP {
                    if let Some(v) = model_map.get(&serde_yaml::Value::String(k.to_string())) {
                        model_backup.insert(serde_yaml::Value::String(k.to_string()), v.clone());
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
                serde_yaml::Value::String(provider_id.to_string()),
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
        serde_yaml::Value::String(provider_id.to_string()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("base_url".into()),
        serde_yaml::Value::String(base_url),
    );
    provider_entry.insert(
        serde_yaml::Value::String("api_key".into()),
        serde_yaml::Value::String(api_key.to_string()),
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
        let name_val = serde_yaml::Value::String(provider_id.to_string());
        if let Some(pos) = seq
            .iter()
            .position(|e| e.as_mapping().and_then(|m| m.get(&name_key)) == Some(&name_val))
        {
            seq[pos] = provider_value;
        } else {
            seq.push(provider_value);
        }
    } else {
        root.insert(cp_key, serde_yaml::Value::Sequence(vec![provider_value]));
    }

    write_config(&path, &doc)?;
    Ok(())
}

pub fn remove(provider_id: &str) -> Result<()> {
    let path = hermes_config_path();
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path)?;
    let mut doc: serde_yaml::Value = serde_yaml::from_str(&content)?;
    remove_from_doc(&mut doc, provider_id);

    write_config(&path, &doc)?;
    Ok(())
}

fn remove_from_doc(doc: &mut serde_yaml::Value, provider_id: &str) {
    let Some(root) = doc.as_mapping_mut() else {
        return;
    };
    // --- 从 custom_providers 中移除 ---
    let cp_key = yaml_key("custom_providers");
    if let Some(seq) = root.get_mut(&cp_key).and_then(|v| v.as_sequence_mut()) {
        let name_key = yaml_key("name");
        let name_val = yaml_key(provider_id);
        seq.retain(|e| e.as_mapping().and_then(|m| m.get(&name_key)) != Some(&name_val));
    }

    // --- 恢复 model 节点（从备份） ---
    let backup = root.get(&yaml_key(BACKUP_KEY)).cloned();
    let mut restored_from_backup = false;
    if let Some(serde_yaml::Value::Mapping(backup_obj)) = backup {
        if let Some(serde_yaml::Value::Mapping(model_backup)) = backup_obj.get(&yaml_key("model")) {
            if let Some(model) = root
                .get_mut(&yaml_key("model"))
                .and_then(|m| m.as_mapping_mut())
            {
                clear_model_injection(model);
                for (k, v) in model_backup {
                    model.insert(k.clone(), v.clone());
                }
                restored_from_backup = true;
            }
        }
        root.remove(&yaml_key(BACKUP_KEY));
    }

    // Older injected configs, or configs created while already injected, may not
    // have a backup. In that case the UI would turn off optimistically, then the
    // next status poll would see model.default == freemodel-auto and turn it on
    // again. Clear our model fields when no backup restored them.
    if !restored_from_backup {
        if let Some(model) = root
            .get_mut(&yaml_key("model"))
            .and_then(|m| m.as_mapping_mut())
        {
            let is_freemodel = model
                .get(&yaml_key("default"))
                .and_then(|v| v.as_str())
                .map(|s| s == "freemodel-auto")
                .unwrap_or(false);
            if is_freemodel {
                clear_model_injection(model);
            }
        }
    }
}

fn clear_model_injection(model: &mut serde_yaml::Mapping) {
    for k in MODEL_KEYS_TO_BACKUP {
        model.remove(&yaml_key(k));
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remove_restores_model_from_backup() {
        let mut doc: serde_yaml::Value = serde_yaml::from_str(
            r#"
model:
  default: freemodel-auto
  provider: test-provider
  base_url: http://localhost:7860/openai/v1
  api_mode: chat_completions
custom_providers:
  - name: test-provider
    base_url: http://localhost:7860/openai/v1
    api_key: test
    model: freemodel-auto
_fm_backup:
  model:
    default: original-model
    provider: original-provider
    base_url: https://example.com/v1
    api_mode: responses
"#,
        )
        .unwrap();

        remove_from_doc(&mut doc, "test-provider");

        assert_eq!(doc["model"]["default"].as_str(), Some("original-model"));
        assert_eq!(doc["model"]["provider"].as_str(), Some("original-provider"));
        assert!(doc.get(BACKUP_KEY).is_none());
        assert!(doc["custom_providers"].as_sequence().unwrap().is_empty());
    }

    #[test]
    fn remove_clears_model_when_backup_is_missing() {
        let mut doc: serde_yaml::Value = serde_yaml::from_str(
            r#"
model:
  default: freemodel-auto
  provider: test-provider
  base_url: http://localhost:7860/openai/v1
  api_mode: chat_completions
  keep_me: true
custom_providers:
  - name: test-provider
    base_url: http://localhost:7860/openai/v1
    api_key: test
    model: freemodel-auto
"#,
        )
        .unwrap();

        remove_from_doc(&mut doc, "test-provider");

        assert!(doc["model"].get("default").is_none());
        assert!(doc["model"].get("provider").is_none());
        assert!(doc["model"].get("base_url").is_none());
        assert!(doc["model"].get("api_mode").is_none());
        assert_eq!(doc["model"]["keep_me"].as_bool(), Some(true));
        assert!(doc["custom_providers"].as_sequence().unwrap().is_empty());
    }
}
