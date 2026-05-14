use anyhow::Result;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

fn auth_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("auth.json")
}

pub fn load_auth() -> HashMap<String, String> {
    let path = auth_path();
    if let Ok(s) = fs::read_to_string(&path) {
        serde_json::from_str(&s).unwrap_or_default()
    } else {
        HashMap::new()
    }
}

pub fn save_auth(auth: &HashMap<String, String>) -> Result<()> {
    let path = auth_path();
    if auth.is_empty() {
        if path.exists() {
            fs::remove_file(&path)?;
        }
        return Ok(());
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(auth)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn get_api_key(provider_id: &str) -> Option<String> {
    load_auth().get(provider_id).cloned()
}

pub fn save_api_key(provider_id: &str, api_key: &str) -> Result<()> {
    let mut auth = load_auth();
    auth.insert(provider_id.to_string(), api_key.to_string());
    save_auth(&auth)
}

pub fn delete_api_key(provider_id: &str) -> Result<()> {
    let mut auth = load_auth();
    auth.remove(provider_id);
    save_auth(&auth)
}

/// 返回所有 provider_id 及是否有 key（不返回实际值）
pub fn has_auth_map() -> HashMap<String, bool> {
    load_auth()
        .into_iter()
        .map(|(k, v)| (k, v.trim().len() > 0))
        .collect()
}
