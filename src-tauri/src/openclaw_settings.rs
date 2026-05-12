use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use serde_json::{json, Value};
use crate::config::Provider;

fn openclaw_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw")
        .join("openclaw.json")
}

pub fn inject(provider: &Provider) -> Result<()> {
    let path = openclaw_config_path();
    fs::create_dir_all(path.parent().unwrap())?;

    let mut doc: Value = if path.exists() {
        let content = fs::read_to_string(&path)?;
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    let models: Vec<Value> = provider
        .models
        .iter()
        .map(|m| json!({ "id": m.id }))
        .collect();

    let provider_entry = json!({
        "baseUrl": provider.base_url,
        "apiKey": provider.api_key,
        "models": models,
    });

    // Ensure nested path exists: doc.models.providers
    let obj = doc.as_object_mut().unwrap();
    let models_obj = obj
        .entry("models")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .unwrap()
        .entry("providers")
        .or_insert_with(|| json!({}));

    models_obj
        .as_object_mut()
        .unwrap()
        .insert(provider.id.clone(), provider_entry);

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn remove(provider_id: &str) -> Result<()> {
    let path = openclaw_config_path();
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path)?;
    let mut doc: Value = serde_json::from_str(&content).unwrap_or_else(|_| json!({}));

    if let Some(providers) = doc
        .get_mut("models")
        .and_then(|m| m.get_mut("providers"))
        .and_then(|p| p.as_object_mut())
    {
        providers.remove(provider_id);
    }

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
