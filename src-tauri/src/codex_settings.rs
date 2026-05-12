use anyhow::Result;
use std::fs;
use std::path::PathBuf;

fn codex_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".codex")
}

pub fn inject(provider_id: &str, api_key: &str, port: u16) -> Result<()> {
    let dir = codex_dir();
    fs::create_dir_all(&dir)?;

    // auth.json
    let auth_path = dir.join("auth.json");
    let auth_tmp = auth_path.with_extension("tmp");
    let auth_json = serde_json::json!({ "OPENAI_API_KEY": api_key });
    fs::write(&auth_tmp, serde_json::to_string_pretty(&auth_json)?)?;
    fs::rename(&auth_tmp, &auth_path)?;

    // config.toml
    let model_id = "freemodel-auto";
    let config_content = format!(
        "model = \"{}\"\n\n[provider]\nbase_url = \"http://localhost:{}/openai\"\n",
        model_id, port
    );
    let config_path = dir.join("config.toml");
    let config_tmp = config_path.with_extension("tmp");
    fs::write(&config_tmp, &config_content)?;
    fs::rename(&config_tmp, &config_path)?;

    Ok(())
}

pub fn remove() -> Result<()> {
    let dir = codex_dir();

    // Delete auth.json entirely (don't leave {} which means "no auth")
    let auth_path = dir.join("auth.json");
    if auth_path.exists() {
        fs::remove_file(&auth_path)?;
    }

    // Restore config.toml to a clean state (remove our injected model + [provider] section)
    let config_path = dir.join("config.toml");
    if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        let cleaned = content
            .lines()
            .take_while(|line| !line.trim_start().starts_with("[provider]"))
            .collect::<Vec<_>>()
            .join("\n")
            .trim_end()
            .to_string();
        let config_tmp = config_path.with_extension("tmp");
        if cleaned.is_empty() || cleaned == "model = \"freemodel-auto\"" {
            // Nothing meaningful left — remove the file entirely
            fs::remove_file(&config_path)?;
        } else {
            fs::write(&config_tmp, cleaned)?;
            fs::rename(&config_tmp, &config_path)?;
        }
    }

    Ok(())
}
