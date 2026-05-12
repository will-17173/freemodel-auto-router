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
    // 旧字段，迁移兼容（不再序列化输出）
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub base_url: String,
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
            Ok(cfg) => {
                // 迁移检查：如果有 base_url 但没有 anthropic_url
                let needs_migration = cfg.providers.iter().any(|p| {
                    !p.base_url.is_empty() && p.anthropic_url.is_empty()
                });

                if needs_migration {
                    let migrated = migrate_config(&cfg);
                    if let Err(e) = save_config(&migrated) {
                        eprintln!("[config] migration save error: {e}");
                    }
                    return migrated;
                }
                cfg
            }
            Err(e) => {
                eprintln!("[config] parse error: {e}");
                AppConfig::default()
            }
        }
    } else {
        AppConfig::default()
    }
}

fn migrate_config(cfg: &AppConfig) -> AppConfig {
    let migrated_providers = cfg.providers.iter().map(|p| {
        if !p.base_url.is_empty() && p.anthropic_url.is_empty() {
            Provider {
                id: p.id.clone(),
                name: p.name.clone(),
                anthropic_url: p.base_url.clone(),
                openai_url: p.base_url.clone(),
                dual_protocol: true,
                base_url: String::new(), // 清空旧字段
                protocol: p.protocol.clone(),
                auth_scheme: p.auth_scheme.clone(),
                api_key: p.api_key.clone(),
                models: p.models.clone(),
                enabled: p.enabled,
                priority: p.priority,
            }
        } else {
            p.clone()
        }
    }).collect();

    AppConfig {
        providers: migrated_providers,
        retry: cfg.retry.clone(),
        queue: cfg.queue.clone(),
        port: cfg.port,
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
