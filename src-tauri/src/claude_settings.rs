use anyhow::Result;
use std::path::PathBuf;
use std::fs;

fn settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("settings.json")
}

pub fn inject_proxy(port: u16) -> Result<()> {
    let path = settings_path();
    let mut val: serde_json::Value = if path.exists() {
        let s = fs::read_to_string(&path)?;
        serde_json::from_str(&s).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    val["apiBaseUrl"] = serde_json::Value::String(
        format!("http://localhost:{}", port)
    );

    fs::create_dir_all(path.parent().unwrap())?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&val)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn remove_proxy() -> Result<()> {
    let path = settings_path();
    if !path.exists() { return Ok(()); }
    let s = fs::read_to_string(&path)?;
    let mut val: serde_json::Value = serde_json::from_str(&s).unwrap_or(serde_json::json!({}));
    if let Some(obj) = val.as_object_mut() {
        obj.remove("apiBaseUrl");
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&val)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
