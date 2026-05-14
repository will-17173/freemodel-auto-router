use anyhow::Result;
use serde_json::Map;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

const PROVIDER_ID: &str = "freemodel";
const MODEL_ID: &str = "freemodel-auto";

fn openclaw_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw")
        .join("openclaw.json")
}

fn write_config(path: &PathBuf, doc: &Value) -> Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(doc)?)?;

    #[cfg(windows)]
    {
        fs::copy(&tmp, path)?;
        fs::remove_file(&tmp)?;
    }

    #[cfg(not(windows))]
    {
        fs::rename(&tmp, path)?;
    }

    Ok(())
}

fn ensure_object<'a>(parent: &'a mut Map<String, Value>, key: &str) -> &'a mut Map<String, Value> {
    parent
        .entry(key.to_string())
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .expect("inserted object")
}

pub fn inject(api_key: &str, port: u16) -> Result<()> {
    let path = openclaw_config_path();
    fs::create_dir_all(path.parent().unwrap())?;

    let mut doc: Value = if path.exists() {
        let content = fs::read_to_string(&path)?;
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    let provider_entry = json!({
        "api": "openai-completions",
        "baseUrl": format!("http://localhost:{}/openai", port),
        "apiKey": api_key,
        "models": [
            {
                "id": MODEL_ID,
                "name": MODEL_ID,
                "input": ["text"],
                "contextWindow": 200000,
                "maxTokens": 16384,
                "reasoning": false,
            }
        ],
    });

    let obj = doc.as_object_mut().unwrap();
    let models_obj = ensure_object(obj, "models");
    models_obj
        .entry("mode".to_string())
        .or_insert_with(|| json!("merge"));
    let providers_obj = ensure_object(models_obj, "providers");
    providers_obj.insert(PROVIDER_ID.to_string(), provider_entry);

    let agents_obj = ensure_object(obj, "agents");
    let defaults_obj = ensure_object(agents_obj, "defaults");
    let model_obj = ensure_object(defaults_obj, "model");
    model_obj.insert(
        "primary".to_string(),
        Value::String(format!("{PROVIDER_ID}/{MODEL_ID}")),
    );

    let default_models_obj = ensure_object(defaults_obj, "models");
    default_models_obj
        .entry(format!("{PROVIDER_ID}/{MODEL_ID}"))
        .or_insert_with(|| json!({}));

    write_config(&path, &doc)?;
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
        providers.remove(PROVIDER_ID);
    }

    if let Some(default_models) = doc
        .get_mut("agents")
        .and_then(|a| a.get_mut("defaults"))
        .and_then(|d| d.get_mut("models"))
        .and_then(|m| m.as_object_mut())
    {
        let prefix = format!("{PROVIDER_ID}/");
        default_models.retain(|key, _| !key.starts_with(&prefix));
    }

    if let Some(model) = doc
        .get_mut("agents")
        .and_then(|a| a.get_mut("defaults"))
        .and_then(|d| d.get_mut("model"))
        .and_then(|m| m.as_object_mut())
    {
        let prefix = format!("{PROVIDER_ID}/");
        let should_remove_primary = model
            .get("primary")
            .and_then(|v| v.as_str())
            .map(|primary| primary.starts_with(&prefix))
            .unwrap_or(false);
        if should_remove_primary {
            model.remove("primary");
        }
    }

    write_config(&path, &doc)?;
    Ok(())
}
