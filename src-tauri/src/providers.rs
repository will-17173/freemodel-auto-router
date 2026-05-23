use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// Re-export Provider and Model for use by other modules that import from providers
pub use crate::config::config_dir;
pub use crate::config::{Model, Provider};

// 格式版本常量，决定请求哪个 URL
pub const CURRENT_FORMAT_VERSION: u32 = 1;

/// 线上配置的基础 URL
pub const REMOTE_BASE_URL: &str = "https://www.coding-plan.xyz/freemodel-auto-router";

/// providers.json 结构（预设供应商，从线上同步）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvidersConfig {
    /// 时间戳版本，用于判断是否需要更新
    pub version: u64,
    /// 格式版本号
    pub format_version: u32,
    /// 预设供应商列表（所有供应商 is_custom: false）
    pub providers: Vec<Provider>,
}

impl Default for ProvidersConfig {
    fn default() -> Self {
        Self {
            version: 0,
            format_version: CURRENT_FORMAT_VERSION,
            providers: vec![],
        }
    }
}

/// custom_providers.json 结构（用户自定义数据）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomProvidersConfig {
    /// 用户完全自定义的供应商
    #[serde(default)]
    pub custom_providers: Vec<Provider>,
    /// 用户在预设供应商里添加的自定义模型，按 provider_id 分组
    #[serde(default)]
    pub custom_models_in_builtin: std::collections::HashMap<String, Vec<Model>>,
}

/// 获取 providers.json 文件路径
pub fn providers_path() -> PathBuf {
    config_dir().join("providers.json")
}

/// 获取 custom_providers.json 文件路径
pub fn custom_providers_path() -> PathBuf {
    config_dir().join("custom_providers.json")
}

/// 加载内置默认供应商配置（从 builtin_providers.json）
fn load_builtin_providers_config() -> ProvidersConfig {
    const BUILTIN_PROVIDERS_JSON: &str = include_str!("../builtin_providers.json");
    serde_json::from_str(BUILTIN_PROVIDERS_JSON)
        .expect("builtin_providers.json should be valid JSON")
}

/// 加载本地 providers.json，不存在则用内置默认
pub fn load_providers() -> ProvidersConfig {
    let path = providers_path();
    if let Ok(s) = fs::read_to_string(&path) {
        match serde_json::from_str::<ProvidersConfig>(&s) {
            Ok(cfg) => {
                log::info!(
                    "[providers] loaded {} providers from {:?}",
                    cfg.providers.len(),
                    path
                );
                cfg
            }
            Err(e) => {
                log::error!("[providers] parse error: {e}, using builtin defaults");
                load_builtin_providers_config()
            }
        }
    } else {
        log::info!(
            "[providers] file not found at {:?}, using builtin defaults",
            path
        );
        load_builtin_providers_config()
    }
}

/// 保存 providers.json
pub fn save_providers(config: &ProvidersConfig) -> Result<()> {
    let path = providers_path();
    fs::create_dir_all(path.parent().unwrap())?;
    let s = serde_json::to_string_pretty(config)?;
    fs::write(&path, s)?;
    Ok(())
}

/// 加载本地 custom_providers.json，不存在则返回空对象
pub fn load_custom_providers() -> CustomProvidersConfig {
    let path = custom_providers_path();
    if let Ok(s) = fs::read_to_string(&path) {
        match serde_json::from_str::<CustomProvidersConfig>(&s) {
            Ok(cfg) => cfg,
            Err(e) => {
                log::error!("[custom_providers] parse error: {e}, using empty default");
                CustomProvidersConfig::default()
            }
        }
    } else {
        CustomProvidersConfig::default()
    }
}

/// 保存 custom_providers.json
pub fn save_custom_providers(config: &CustomProvidersConfig) -> Result<()> {
    let path = custom_providers_path();
    fs::create_dir_all(path.parent().unwrap())?;
    let s = serde_json::to_string_pretty(config)?;
    fs::write(&path, s)?;
    Ok(())
}

/// 合并预设供应商与用户自定义数据，返回完整供应商列表
pub fn merge_providers(
    builtin: Vec<Provider>,
    custom_providers: Vec<Provider>,
    custom_models_in_builtin: std::collections::HashMap<String, Vec<Model>>,
) -> Vec<Provider> {
    // 1. 处理预设供应商：追加自定义模型
    let merged_builtin: Vec<Provider> = builtin
        .into_iter()
        .map(|provider| {
            let custom_models = custom_models_in_builtin
                .get(&provider.id)
                .cloned()
                .unwrap_or_default();

            let mut models = provider.models;
            models.extend(custom_models);

            Provider { models, ..provider }
        })
        .collect();

    // 2. 合并预设供应商 + 用户自定义供应商
    let mut all_providers = merged_builtin;
    all_providers.extend(custom_providers);

    // 3. 用内置配置补充缺失的 description（本地/远程配置可能未包含）
    let builtin_defaults = load_builtin_providers_config();
    for provider in &mut all_providers {
        if provider.description.is_none() {
            if let Some(default) = builtin_defaults.providers.iter().find(|p| p.id == provider.id) {
                if default.description.is_some() {
                    provider.description = default.description.clone();
                }
            }
        }
    }

    // 4. 按 priority 排序（降序）
    all_providers.sort_by(|a, b| b.priority.cmp(&a.priority));

    all_providers
}

/// 获取合并后的完整供应商列表（供前端使用）
pub fn get_all_providers() -> Vec<Provider> {
    let providers_config = load_providers();
    let custom_config = load_custom_providers();

    merge_providers(
        providers_config.providers,
        custom_config.custom_providers,
        custom_config.custom_models_in_builtin,
    )
}

/// 异步同步线上供应商配置
/// 返回 (是否请求成功, 是否有版本更新)
pub async fn sync_providers() -> (bool, bool) {
    let url = format!(
        "{}/v{}/providers.json",
        REMOTE_BASE_URL, CURRENT_FORMAT_VERSION
    );

    log::info!("[sync] checking remote: {}", url);

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            log::error!("[sync] client build error: {e}");
            return (false, false);
        }
    };

    let response = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            log::warn!("[sync] network error: {e}, using local data");
            return (false, false);
        }
    };

    if !response.status().is_success() {
        log::warn!("[sync] remote returned status {}", response.status());
        return (false, false);
    }

    let body = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            log::error!("[sync] read response error: {e}");
            return (false, false);
        }
    };

    let remote_config = match serde_json::from_str::<ProvidersConfig>(&body) {
        Ok(c) => c,
        Err(e) => {
            log::error!("[sync] parse remote json error: {e}");
            return (false, false);
        }
    };

    let local_config = load_providers();

    if remote_config.version > local_config.version {
        log::info!(
            "[sync] remote version {} > local version {}, updating",
            remote_config.version,
            local_config.version
        );
        if let Err(e) = save_providers(&remote_config) {
            log::error!("[sync] save error: {e}");
            return (false, false);
        }
        log::info!("[sync] providers.json updated successfully");
        (true, true)
    } else {
        log::info!(
            "[sync] remote version {} <= local version {}, no update needed",
            remote_config.version,
            local_config.version
        );
        (true, false)
    }
}

/// 迁移旧配置：将 config.json 中的 providers 分离到新文件结构
pub fn migrate_legacy_config(old_providers: Vec<Provider>) -> Result<()> {
    if old_providers.is_empty() {
        log::info!("[migrate] no legacy providers, creating default providers.json");
        let providers_config = load_builtin_providers_config();
        return save_providers(&providers_config);
    }

    log::info!(
        "[migrate] migrating {} providers from legacy config",
        old_providers.len()
    );

    // 分离预设供应商和自定义供应商
    let (builtin_providers, custom_providers): (Vec<Provider>, Vec<Provider>) =
        old_providers.into_iter().partition(|p| !p.is_custom);

    // 分离预设供应商中的自定义模型
    let mut custom_models_in_builtin: std::collections::HashMap<String, Vec<Model>> =
        std::collections::HashMap::new();

    let builtin_providers_cleaned: Vec<Provider> = builtin_providers
        .into_iter()
        .map(|provider| {
            let (builtin_models, custom_models): (Vec<Model>, Vec<Model>) =
                provider.models.iter().cloned().partition(|m| !m.is_custom);

            if !custom_models.is_empty() {
                custom_models_in_builtin.insert(provider.id.clone(), custom_models);
            }

            Provider {
                models: builtin_models,
                ..provider
            }
        })
        .collect();

    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let providers_config = ProvidersConfig {
        version: timestamp,
        format_version: CURRENT_FORMAT_VERSION,
        providers: builtin_providers_cleaned,
    };

    let custom_config = CustomProvidersConfig {
        custom_providers,
        custom_models_in_builtin,
    };

    save_providers(&providers_config)?;
    save_custom_providers(&custom_config)?;

    log::info!("[migrate] migration completed");
    Ok(())
}

/// 检查是否需要迁移（providers.json 不存在时需要迁移）
pub fn needs_migration() -> bool {
    !providers_path().exists()
}

/// 从旧 config.json 读取 providers 字段（迁移用）
pub(crate) fn read_legacy_providers() -> Vec<Provider> {
    // 旧版 config.json 在应用目录
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("config.json");

    let Ok(s) = fs::read_to_string(&path) else {
        return vec![];
    };

    let Ok(json) = serde_json::from_str::<serde_json::Value>(&s) else {
        return vec![];
    };

    json.get("providers")
        .and_then(|v| serde_json::from_value::<Vec<Provider>>(v.clone()).ok())
        .unwrap_or_default()
}

/// 添加或更新自定义供应商
pub fn save_custom_provider(provider: &Provider) -> Result<()> {
    let mut config = load_custom_providers();

    let existing = config
        .custom_providers
        .iter()
        .position(|p| p.id == provider.id);
    match existing {
        Some(idx) => config.custom_providers[idx] = provider.clone(),
        None => config.custom_providers.push(provider.clone()),
    }

    save_custom_providers(&config)
}

/// 删除自定义供应商
pub fn delete_custom_provider(provider_id: &str) -> Result<()> {
    let mut config = load_custom_providers();
    config.custom_providers.retain(|p| p.id != provider_id);
    save_custom_providers(&config)
}

/// 添加自定义模型到预设供应商
pub fn add_custom_model_to_builtin(provider_id: &str, model: &Model) -> Result<()> {
    let mut config = load_custom_providers();
    config
        .custom_models_in_builtin
        .entry(provider_id.to_string())
        .or_insert_with(Vec::new)
        .push(model.clone());
    save_custom_providers(&config)
}

/// 从预设供应商删除自定义模型
pub fn delete_custom_model_from_builtin(provider_id: &str, model_id: &str) -> Result<()> {
    let mut config = load_custom_providers();

    if let Some(models) = config.custom_models_in_builtin.get_mut(provider_id) {
        models.retain(|m| m.id != model_id);
        if models.is_empty() {
            config.custom_models_in_builtin.remove(provider_id);
        }
    }

    save_custom_providers(&config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_providers_json_uses_providers_config_format() {
        const BUILTIN_PROVIDERS_JSON: &str = include_str!("../builtin_providers.json");

        let config: ProvidersConfig = serde_json::from_str(BUILTIN_PROVIDERS_JSON)
            .expect("builtin_providers.json should match remote providers.json format");

        assert_eq!(config.format_version, CURRENT_FORMAT_VERSION);
        assert!(!config.providers.is_empty());
    }

    #[test]
    fn builtin_providers_json_has_links_and_no_legacy_enabled_fields() {
        const BUILTIN_PROVIDERS_JSON: &str = include_str!("../builtin_providers.json");

        let json: serde_json::Value = serde_json::from_str(BUILTIN_PROVIDERS_JSON)
            .expect("builtin_providers.json should be valid JSON");

        let providers = json["providers"]
            .as_array()
            .expect("providers should be an array");

        for provider in providers {
            assert!(provider.get("enabled").is_none());
            assert_eq!(
                provider.get("is_custom").and_then(|v| v.as_bool()),
                Some(false)
            );
            assert!(provider
                .get("link")
                .and_then(|v| v.as_str())
                .is_some_and(|link| link.starts_with("https://")));

            let models = provider["models"]
                .as_array()
                .expect("models should be an array");
            for model in models {
                assert!(model.get("enabled").is_none());
                assert_eq!(
                    model.get("is_custom").and_then(|v| v.as_bool()),
                    Some(false)
                );
            }
        }
    }
}
