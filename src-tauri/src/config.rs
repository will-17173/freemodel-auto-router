use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 获取应用配置目录 (~/.config/freemodel/)
pub fn config_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("freemodel")
}

fn config_path() -> PathBuf {
    config_dir().join("config.json")
}

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
    #[serde(default)]
    pub is_custom: bool,
}

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
    pub models: Vec<Model>,
    pub priority: u32,
    #[serde(default)]
    pub is_custom: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
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
        Self {
            max_retries: 2,
            retry_delay_secs: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueueItem {
    pub provider_id: String,
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Queue {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub items: Vec<QueueItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MatchRuleType {
    UserAgentContains,
    HeaderEquals,
    PathContains,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchRule {
    #[serde(rename = "type")]
    pub rule_type: MatchRuleType,
    pub pattern: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header_name: Option<String>,
}

impl MatchRule {
    pub fn matches(&self, ua: &str, headers: &axum::http::HeaderMap, path: &str) -> bool {
        match &self.rule_type {
            MatchRuleType::UserAgentContains => ua.contains(&self.pattern),
            MatchRuleType::HeaderEquals => {
                let Some(header_name) = self.header_name.as_ref() else {
                    return false;
                };
                headers
                    .get(header_name.as_str())
                    .and_then(|v| v.to_str().ok())
                    .map(|v| v == self.pattern)
                    .unwrap_or(false)
            }
            MatchRuleType::PathContains => path.contains(&self.pattern),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppMapping {
    pub app_id: String,
    pub display_name: String,
    #[serde(default)]
    pub match_rules: Vec<MatchRule>,
    pub queue_id: String,
}

/// Scenario for model routing based on request content.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum Scenario {
    LongContext,
    Complex,
    Think,
    Background,
    Default,
    Fast,
}

/// Configuration for scenario-based model routing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScenarioRoutingConfig {
    pub long_context_model: String,
    pub complex_model: String,
    pub think_model: String,
    pub background_model: String,
    pub default_model: String,
    pub fast_model: String,
    /// Token count threshold for LongContext scenario (default: 80000)
    pub long_context_threshold: usize,
}

impl Default for ScenarioRoutingConfig {
    fn default() -> Self {
        Self {
            long_context_model: "minimax-m2.5".to_string(),
            complex_model: "glm-5.1".to_string(),
            think_model: "glm-5".to_string(),
            background_model: "qwen3.5-plus".to_string(),
            default_model: "kimi-k2.6".to_string(),
            fast_model: "qwen3.6-plus".to_string(),
            long_context_threshold: 80000,
        }
    }
}

fn default_port() -> u16 {
    7860
}

fn default_queues() -> std::collections::HashMap<String, Queue> {
    let mut map = std::collections::HashMap::new();
    map.insert(
        "default".to_string(),
        Queue {
            id: "default".to_string(),
            name: "默认队列".to_string(),
            items: vec![],
        },
    );
    map
}

fn default_queue_id() -> String {
    "default".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub retry: RetryConfig,
    // 新字段
    #[serde(default = "default_queues")]
    pub queues: std::collections::HashMap<String, Queue>,
    #[serde(default)]
    pub app_mapping: Vec<AppMapping>,
    #[serde(default = "default_queue_id")]
    pub default_queue_id: String,
    // 场景路由配置
    #[serde(default)]
    pub scenario_routing: ScenarioRoutingConfig,
    /// If true, respect the model requested by the client instead of scenario detection
    #[serde(default)]
    pub respect_requested_model: bool,
    // 保留旧字段用于迁移检测（序列化时跳过）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub queue: Vec<QueueItem>,
    #[serde(default = "default_port")]
    pub port: u16,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            retry: RetryConfig::default(),
            queues: default_queues(),
            app_mapping: vec![],
            default_queue_id: default_queue_id(),
            scenario_routing: ScenarioRoutingConfig::default(),
            respect_requested_model: true,
            queue: vec![],
        }
    }
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if let Ok(s) = fs::read_to_string(&path) {
        match serde_json::from_str::<AppConfig>(&s) {
            Ok(cfg) => {
                // 迁移旧 queue 到 queues.default
                let mut cfg = cfg;
                if !cfg.queue.is_empty() {
                    if let Some(default_queue) = cfg.queues.get_mut("default") {
                        if default_queue.items.is_empty() {
                            default_queue.items = cfg.queue.clone();
                            log::info!(
                                "[config] migrated legacy queue to queues.default ({} items)",
                                cfg.queue.len()
                            );
                        }
                    }
                    cfg.queue.clear(); // 清空旧字段
                                       // Persist migration so it doesn't repeat on next startup
                    if let Err(e) = save_config(&cfg) {
                        log::warn!("[config] failed to persist migration: {e}");
                    }
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
    fn openrouter_uses_bearer_auth_scheme() {
        // Test that provider with id "openrouter" and no explicit auth_scheme returns Bearer
        let openrouter = Provider {
            id: "openrouter".to_string(),
            name: "OpenRouter".to_string(),
            anthropic_url: "https://openrouter.ai/api".to_string(),
            openai_url: String::new(),
            dual_protocol: false,
            protocol: Protocol::Anthropic,
            auth_scheme: None,
            models: vec![],
            priority: 100,
            is_custom: false,
            link: None,
            description: None,
        };
        assert_eq!(openrouter.protocol, Protocol::Anthropic);
        assert_eq!(openrouter.effective_auth_scheme(), AuthScheme::Bearer);
    }
}
