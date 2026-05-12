use serde::{Deserialize, Serialize};
use anyhow::Result;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Protocol {
    #[serde(rename = "OpenAI", alias = "openAI", alias = "openAi")]
    OpenAI,
    #[serde(rename = "Anthropic", alias = "anthropic")]
    Anthropic,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AuthScheme {
    #[serde(rename = "Bearer", alias = "bearer")]
    Bearer,
    #[serde(rename = "ApiKey", alias = "apiKey", alias = "api_key")]
    ApiKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    // 新字段
    #[serde(default)]
    pub anthropic_url: String,
    #[serde(default)]
    pub openai_url: String,
    #[serde(default)]
    pub dual_protocol: bool,
    pub protocol: Protocol,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_scheme: Option<AuthScheme>,
    #[serde(default)]
    pub api_key: String,
    pub models: Vec<Model>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub priority: u32,
}

impl Provider {
    pub fn effective_auth_scheme(&self) -> AuthScheme {
        self.auth_scheme.clone().unwrap_or_else(|| {
            if self.id == "openrouter" || self.protocol == Protocol::OpenAI {
                AuthScheme::Bearer
            } else {
                AuthScheme::ApiKey
            }
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub retry_delay_secs: u32,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self { max_retries: 2, retry_delay_secs: 3 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub provider_id: String,
    pub model_id: String,
}

fn default_port() -> u16 { 7860 }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    #[serde(default)]
    pub queue: Vec<QueueItem>,
    #[serde(default = "default_port")]
    pub port: u16,
}

const BUILTIN_PROVIDERS_JSON: &str = include_str!("../builtin_providers.json");

fn load_builtin_providers() -> Vec<Provider> {
    serde_json::from_str(BUILTIN_PROVIDERS_JSON)
        .expect("builtin_providers.json should be valid JSON")
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            providers: load_builtin_providers(),
            retry: RetryConfig::default(),
            queue: vec![],
        }
    }
}

fn config_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("config.json")
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if let Ok(s) = fs::read_to_string(&path) {
        match serde_json::from_str::<AppConfig>(&s) {
            Ok(cfg) => cfg,
            Err(e) => {
                eprintln!("[config] parse error: {e}");
                AppConfig::default()
            }
        }
    } else {
        AppConfig::default()
    }
}

pub fn save_config(config: &AppConfig) -> Result<()> {
    let path = config_path();
    fs::create_dir_all(path.parent().unwrap())?;
    let s = serde_json::to_string_pretty(config)?;
    fs::write(&path, s)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_openrouter_uses_anthropic_protocol_with_bearer_auth() {
        let cfg = AppConfig::default();
        let openrouter = cfg
            .providers
            .iter()
            .find(|provider| provider.id == "openrouter")
            .unwrap();

        assert_eq!(openrouter.protocol, Protocol::Anthropic);
        assert_eq!(openrouter.effective_auth_scheme(), AuthScheme::Bearer);
    }
}
