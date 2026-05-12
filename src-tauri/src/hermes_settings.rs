use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use crate::config::Provider;

fn hermes_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".hermes")
        .join("config.yaml")
}

pub fn inject(provider: &Provider) -> Result<()> {
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

    // Build the provider entry
    let mut provider_entry = serde_yaml::Mapping::new();
    provider_entry.insert(
        serde_yaml::Value::String("name".into()),
        serde_yaml::Value::String(provider.id.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("base_url".into()),
        serde_yaml::Value::String(provider.base_url.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("api_key".into()),
        serde_yaml::Value::String(provider.api_key.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("model".into()),
        serde_yaml::Value::String(model_id.clone()),
    );

    // models map
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

    // Upsert into custom_providers sequence
    let root = doc.as_mapping_mut().unwrap();
    let key = serde_yaml::Value::String("custom_providers".into());
    if let Some(seq) = root.get_mut(&key).and_then(|v| v.as_sequence_mut()) {
        // Replace existing entry with same name, or push
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
            key,
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
    let key = serde_yaml::Value::String("custom_providers".into());
    if let Some(seq) = root.get_mut(&key).and_then(|v| v.as_sequence_mut()) {
        let name_key = serde_yaml::Value::String("name".into());
        let name_val = serde_yaml::Value::String(provider_id.to_string());
        seq.retain(|e| {
            e.as_mapping()
                .and_then(|m| m.get(&name_key))
                != Some(&name_val)
        });
    }

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_yaml::to_string(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
