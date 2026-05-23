use anyhow::Result;
use serde::{Deserialize, Serialize};

// Re-export Provider and Model for use by other modules that import from providers
pub use crate::config::config_dir;
pub use crate::config::{Model, Provider};

// 格式版本常量，决定请求哪个 URL
pub const CURRENT_FORMAT_VERSION: u32 = 1;

/// 线上配置的基础 URL
pub const REMOTE_BASE_URL: &str = "https://www.coding-plan.xyz/freemodel-auto-router";

/// 预设供应商配置（内置 + 远程同步）
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

/// 获取 custom_providers.json 文件路径
pub fn custom_providers_path() -> std::path::PathBuf {
    config_dir().join("custom_providers.json")
}

/// 加载内置默认供应商配置（从 builtin_providers.json）
pub fn load_builtin_providers() -> Vec<Provider> {
    const BUILTIN_PROVIDERS_JSON: &str = include_str!("../builtin_providers.json");
    let config: ProvidersConfig = serde_json::from_str(BUILTIN_PROVIDERS_JSON)
        .expect("builtin_providers.json should be valid JSON");
    config.providers
}

/// 加载本地 custom_providers.json，不存在则返回空对象
pub fn load_custom_providers() -> CustomProvidersConfig {
    let path = custom_providers_path();
    if let Ok(s) = std::fs::read_to_string(&path) {
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
    std::fs::create_dir_all(path.parent().unwrap())?;
    let s = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, s)?;
    Ok(())
}

/// 合并预设供应商与用户自定义数据，返回完整供应商列表
pub fn merge_providers(
    preset: Vec<Provider>,
    custom_providers: Vec<Provider>,
    custom_models_in_builtin: std::collections::HashMap<String, Vec<Model>>,
) -> Vec<Provider> {
    // 1. 处理预设供应商：追加自定义模型
    let merged_preset: Vec<Provider> = preset
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
    let mut all_providers = merged_preset;
    all_providers.extend(custom_providers);

    // 3. 用内置配置补充缺失的 description（远程配置可能未包含）
    let builtin_defaults = load_builtin_providers();
    for provider in &mut all_providers {
        if provider.description.is_none() {
            if let Some(default) = builtin_defaults.iter().find(|p| p.id == provider.id) {
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
/// 数据来源：内置 + 远程同步（远程 version 更高时替换内置）+ 用户自定义
pub fn get_all_providers_with_preset(preset: Vec<Provider>) -> Vec<Provider> {
    let custom_config = load_custom_providers();

    merge_providers(
        preset,
        custom_config.custom_providers,
        custom_config.custom_models_in_builtin,
    )
}

/// 异步同步线上供应商配置
/// 返回 (是否请求成功, 远程 ProvidersConfig 如果有更新)
pub async fn sync_providers() -> (bool, Option<ProvidersConfig>) {
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
            return (false, None);
        }
    };

    let response = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => {
            log::warn!("[sync] network error: {e}, using builtin providers");
            return (false, None);
        }
    };

    if !response.status().is_success() {
        log::warn!("[sync] remote returned status {}", response.status());
        return (false, None);
    }

    let body = match response.text().await {
        Ok(t) => t,
        Err(e) => {
            log::error!("[sync] read response error: {e}");
            return (false, None);
        }
    };

    let remote_config = match serde_json::from_str::<ProvidersConfig>(&body) {
        Ok(c) => c,
        Err(e) => {
            log::error!("[sync] parse remote json error: {e}");
            return (false, None);
        }
    };

    let builtin_version = get_builtin_version();

    if remote_config.version > builtin_version {
        log::info!(
            "[sync] remote version {} > builtin version {}, using remote",
            remote_config.version,
            builtin_version
        );
        (true, Some(remote_config))
    } else {
        log::info!(
            "[sync] remote version {} <= builtin version {}, keeping builtin",
            remote_config.version,
            builtin_version
        );
        (true, None)
    }
}

/// 获取内置配置的版本号
fn get_builtin_version() -> u64 {
    const BUILTIN_PROVIDERS_JSON: &str = include_str!("../builtin_providers.json");
    serde_json::from_str::<ProvidersConfig>(BUILTIN_PROVIDERS_JSON)
        .map(|c| c.version)
        .unwrap_or(0)
}

/// 迁移旧配置：将旧 config.json 中的 providers 分离到 custom_providers.json
pub fn migrate_legacy_config(old_providers: Vec<Provider>) -> Result<()> {
    if old_providers.is_empty() {
        log::info!("[migrate] no legacy providers, nothing to migrate");
        return Ok(());
    }

    log::info!(
        "[migrate] migrating {} providers from legacy config",
        old_providers.len()
    );

    // 分离自定义供应商（预设供应商不再写入文件，由内置+远程统一管理）
    let custom_providers: Vec<Provider> = old_providers
        .into_iter()
        .filter(|p| p.is_custom)
        .collect();

    // 从自定义供应商中分离自定义模型
    let mut custom_models_in_builtin: std::collections::HashMap<String, Vec<Model>> =
        std::collections::HashMap::new();

    let custom_providers_cleaned: Vec<Provider> = custom_providers
        .into_iter()
        .map(|provider| {
            let (builtin_models, custom_models): (Vec<Model>, Vec<Model>) =
                provider.models.into_iter().partition(|m| !m.is_custom);

            if !custom_models.is_empty() {
                custom_models_in_builtin.insert(provider.id.clone(), custom_models);
            }

            Provider {
                models: builtin_models,
                ..provider
            }
        })
        .collect();

    let custom_config = CustomProvidersConfig {
        custom_providers: custom_providers_cleaned,
        custom_models_in_builtin,
    };

    save_custom_providers(&custom_config)?;

    log::info!("[migrate] migration completed");
    Ok(())
}

/// 从旧 config.json 读取 providers 字段（迁移用）
pub(crate) fn read_legacy_providers() -> Vec<Provider> {
    // 旧版 config.json 在应用目录
    let path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("config.json");

    let Ok(s) = std::fs::read_to_string(&path) else {
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
                .is_some_and(|link| link.startsWith("https://")));

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
