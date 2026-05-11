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
    pub base_url: String,
    pub protocol: Protocol,
    pub api_key: String,
    pub models: Vec<Model>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub priority: u32,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    #[serde(default)]
    pub queue: Vec<QueueItem>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            providers: vec![Provider {
                id: "openrouter".to_owned(),
                name: "OpenRouter".to_owned(),
                base_url: "https://openrouter.ai/api".to_owned(),
                protocol: Protocol::Anthropic,
                api_key: String::new(),
                models: vec![Model {
                    id: "baidu/cobuddy:free".to_owned(),
                    name: "Baidu Cobuddy (Free)".to_owned(),
                    enabled: true,
                }],
                enabled: true,
                priority: 100,
            }],
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
