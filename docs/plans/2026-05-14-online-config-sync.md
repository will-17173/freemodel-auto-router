# 配置文件在线更新功能实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 将供应商配置与用户配置分离，支持从线上自动同步预设供应商信息，同时保留用户自定义数据。

**Architecture:** 新增 providers.rs 模块管理供应商数据，config.rs 只保留用户配置。启动时异步检查线上版本，合并预设供应商与用户自定义数据后返回前端。

**Tech Stack:** Rust (Tauri), TypeScript (React), reqwest (HTTP client)

---

## Phase 1: 后端数据结构重构

### Task 1: 创建 providers.rs 模块基础结构

**Objective:** 新建 providers.rs 模块，定义核心数据结构

**Files:**
- Create: `src-tauri/src/providers.rs`

**Step 1: 创建 providers.rs 文件**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use anyhow::Result;
use crate::config::{Provider, Model};

/// 格式版本常量，决定请求哪个 URL
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
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("providers.json")
}

/// 获取 custom_providers.json 文件路径
pub fn custom_providers_path() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("custom_providers.json")
}
```

**Step 2: 在 lib.rs 中添加 mod providers**

在 `src-tauri/src/lib.rs` 第 6 行附近添加：

```rust
mod providers;
```

**Step 3: 运行构建验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tauri dev`
Expected: 编译成功，无错误

**Step 4: Commit**

```bash
git add src-tauri/src/providers.rs src-tauri/src/lib.rs
git commit -m "feat: 创建 providers.rs 模块基础结构"
```

---

### Task 2: 实现加载本地配置函数

**Objective:** 实现 load_providers 和 load_custom_providers 函数

**Files:**
- Modify: `src-tauri/src/providers.rs` (追加代码)

**Step 1: 添加加载函数**

追加到 `src-tauri/src/providers.rs`：

```rust
/// 加载内置默认供应商（从 builtin_providers.json）
fn load_builtin_providers() -> Vec<Provider> {
    const BUILTIN_PROVIDERS_JSON: &str = include_str!("../builtin_providers.json");
    serde_json::from_str(BUILTIN_PROVIDERS_JSON)
        .expect("builtin_providers.json should be valid JSON")
}

/// 加载本地 providers.json，不存在则用内置默认
pub fn load_providers() -> ProvidersConfig {
    let path = providers_path();
    if let Ok(s) = fs::read_to_string(&path) {
        match serde_json::from_str::<ProvidersConfig>(&s) {
            Ok(cfg) => cfg,
            Err(e) => {
                log::error!("[providers] parse error: {e}, using builtin defaults");
                ProvidersConfig {
                    version: 0,
                    format_version: CURRENT_FORMAT_VERSION,
                    providers: load_builtin_providers(),
                }
            }
        }
    } else {
        log::info!("[providers] file not found, using builtin defaults");
        ProvidersConfig {
            version: 0,
            format_version: CURRENT_FORMAT_VERSION,
            providers: load_builtin_providers(),
        }
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
```

**Step 2: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 3: Commit**

```bash
git add src-tauri/src/providers.rs
git commit -m "feat: 实现加载本地 providers 和 custom_providers 函数"
```

---

### Task 3: 实现合并供应商函数

**Objective:** 实现 merge_providers 函数，合并预设供应商与用户自定义数据

**Files:**
- Modify: `src-tauri/src/providers.rs` (追加代码)

**Step 1: 添加合并函数**

追加到 `src-tauri/src/providers.rs`：

```rust
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
            
            // 合并 models：预设模型 + 自定义模型
            let mut models = provider.models;
            models.extend(custom_models);
            
            Provider {
                models,
                ..provider
            }
        })
        .collect();
    
    // 2. 合并预设供应商 + 用户自定义供应商
    let mut all_providers = merged_builtin;
    all_providers.extend(custom_providers);
    
    // 3. 按 priority 排序（降序）
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
```

**Step 2: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 3: Commit**

```bash
git add src-tauri/src/providers.rs
git commit -m "feat: 实现 merge_providers 和 get_all_providers 函数"
```

---

### Task 4: 实现线上同步函数

**Objective:** 实现 sync_providers 函数，异步检查线上版本并更新

**Files:**
- Modify: `src-tauri/src/providers.rs` (追加代码)

**Step 1: 添加同步函数**

追加到 `src-tauri/src/providers.rs`：

```rust
/// 异步同步线上供应商配置
/// 返回 (是否更新成功, 是否有更新)
pub async fn sync_providers() -> (bool, bool) {
    let url = format!("{}/v{}/providers.json", REMOTE_BASE_URL, CURRENT_FORMAT_VERSION);
    
    log::info!("[sync] checking remote: {}", url);
    
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build();
    
    let client = match client {
        Ok(c) => c,
        Err(e) => {
            log::error!("[sync] client build error: {e}");
            return (false, false);
        }
    };
    
    // 获取线上配置
    let response = client.get(&url).send().await;
    
    match response {
        Ok(resp) => {
            if !resp.status().is_success() {
                log::warn!("[sync] remote returned status {}", resp.status());
                return (false, false);
            }
            
            let text = resp.text().await;
            match text {
                Ok(body) => {
                    match serde_json::from_str::<ProvidersConfig>(&body) {
                        Ok(remote_config) => {
                            let local_config = load_providers();
                            
                            // 比较版本
                            if remote_config.version > local_config.version {
                                log::info!(
                                    "[sync] remote version {} > local version {}, updating",
                                    remote_config.version,
                                    local_config.version
                                );
                                
                                // 保存更新
                                if let Err(e) = save_providers(&remote_config) {
                                    log::error!("[sync] save error: {e}");
                                    return (false, false);
                                }
                                
                                log::info!("[sync] providers.json updated successfully");
                                return (true, true);
                            } else {
                                log::info!(
                                    "[sync] remote version {} <= local version {}, no update needed",
                                    remote_config.version,
                                    local_config.version
                                );
                                return (true, false);
                            }
                        }
                        Err(e) => {
                            log::error!("[sync] parse remote json error: {e}");
                            return (false, false);
                        }
                    }
                }
                Err(e) => {
                    log::error!("[sync] read response error: {e}");
                    return (false, false);
                }
            }
        }
        Err(e) => {
            log::warn!("[sync] network error: {e}, using local data");
            return (false, false);
        }
    }
}
```

**Step 2: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 3: Commit**

```bash
git add src-tauri/src/providers.rs
git commit -m "feat: 实现线上同步 sync_providers 函数"
```

---

## Phase 2: 迁移逻辑

### Task 5: 实现旧配置迁移函数

**Objective:** 实现从旧 config.json 迁移供应商数据到新文件结构的函数

**Files:**
- Modify: `src-tauri/src/providers.rs` (追加代码)

**Step 1: 添加迁移函数**

追加到 `src-tauri/src/providers.rs`：

```rust
use crate::config::AppConfig;

/// 迁移旧配置：将 config.json 中的 providers 分离到新文件
pub fn migrate_legacy_config(old_config: &AppConfig) -> Result<()> {
    // 检查是否需要迁移（providers 字段非空）
    if old_config.providers.is_empty() {
        return Ok(());
    }
    
    log::info!("[migrate] migrating {} providers from legacy config", old_config.providers.len());
    
    // 分离预设供应商和自定义供应商
    let (builtin_providers, custom_providers): (Vec<Provider>, Vec<Provider>) = 
        old_config.providers.iter().cloned().partition(|p| !p.is_custom);
    
    // 分离预设供应商中的自定义模型
    let mut custom_models_in_builtin: std::collections::HashMap<String, Vec<Model>> = 
        std::collections::HashMap::new();
    
    let builtin_providers_cleaned: Vec<Provider> = builtin_providers
        .into_iter()
        .map(|provider| {
            // 分离自定义模型
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
    
    // 创建新的 providers.json（使用时间戳作为初始版本）
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    
    let providers_config = ProvidersConfig {
        version: timestamp,
        format_version: CURRENT_FORMAT_VERSION,
        providers: builtin_providers_cleaned,
    };
    
    // 创建 custom_providers.json
    let custom_config = CustomProvidersConfig {
        custom_providers,
        custom_models_in_builtin,
    };
    
    // 保存文件
    save_providers(&providers_config)?;
    save_custom_providers(&custom_config)?;
    
    log::info!("[migrate] migration completed");
    Ok(())
}

/// 检查是否需要迁移（providers.json 是否存在）
pub fn needs_migration() -> bool {
    !providers_path().exists()
}
```

**Step 2: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 3: Commit**

```bash
git add src-tauri/src/providers.rs
git commit -m "feat: 实现旧配置迁移函数 migrate_legacy_config"
```

---

## Phase 3: 修改 config.rs

### Task 6: 移除 config.rs 的 providers 字段

**Objective:** 从 AppConfig 移除 providers 字段，只保留用户配置

**Files:**
- Modify: `src-tauri/src/config.rs`

**Step 1: 修改 AppConfig 结构体**

修改 `src-tauri/src/config.rs`，移除 providers 相关代码：

1. 移除 `Provider` 和 `Model` 结构体定义（它们现在在 providers.rs 中通过 pub use 重新导出）
2. 修改 `AppConfig` 移除 `providers` 字段
3. 移除 `load_builtin_providers()` 函数和 `BUILTIN_PROVIDERS_JSON` 常量
4. 修改 `Default` 实现

修改后的 `AppConfig`：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub retry: RetryConfig,
    #[serde(default = "default_queues")]
    pub queues: std::collections::HashMap<String, Queue>,
    #[serde(default)]
    pub app_mapping: Vec<AppMapping>,
    #[serde(default = "default_queue_id")]
    pub default_queue_id: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub queue: Vec<QueueItem>,
    #[serde(default = "default_port")]
    pub port: u16,
}
```

移除以下代码：
- `const BUILTIN_PROVIDERS_JSON: &str = include_str!("../builtin_providers.json");`
- `fn load_builtin_providers() -> Vec<Provider> { ... }`
- `Default for AppConfig` 中的 `providers: load_builtin_providers()`

修改 `Default` 实现：

```rust
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            retry: RetryConfig::default(),
            queues: default_queues(),
            app_mapping: vec![],
            default_queue_id: default_queue_id(),
            queue: vec![],
        }
    }
}
```

**Step 2: 在 providers.rs 开头添加 re-export**

在 `src-tauri/src/providers.rs` 开头添加：

```rust
// Re-export Provider 和 Model 供其他模块使用
pub use crate::config::{Provider, Model};
```

**Step 3: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功（可能有未使用的警告，后续会修复）

**Step 4: Commit**

```bash
git add src-tauri/src/config.rs src-tauri/src/providers.rs
git commit -m "refactor: 从 AppConfig 移除 providers 字段"
```

---

## Phase 4: 修改 lib.rs 启动流程

### Task 7: 修改启动流程集成迁移和同步

**Objective:** 在应用启动时执行迁移检查和线上同步

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 修改 run() 函数**

修改 `src-tauri/src/lib.rs` 的 `run()` 函数：

```rust
pub fn run() {
    // 1. 检查是否需要迁移
    if providers::needs_migration() {
        let old_config = config::load_config();
        // 注意：此时 load_config 可能还有 providers 字段（旧格式）
        // 我们需要读取原始 JSON 来判断
        if let Err(e) = providers::migrate_legacy_config(&old_config) {
            log::error!("[migrate] migration failed: {e}");
        }
    }
    
    // 2. 加载配置
    let cfg = config::load_config();
    let port = cfg.port;
    let auth_map = auth::load_auth();
    
    // 3. 获取合并后的供应商列表
    let all_providers = providers::get_all_providers();
    
    // 4. 创建 router state（使用合并后的供应商）
    let shared_router = router::new_router_with_providers(&cfg, all_providers, auth_map);
    let proxy_logs = proxy_log::ProxyLogStore::new(200);
    
    // ... 后续代码保持不变，但需要在 setup 中添加异步同步
```

**Step 2: 添加异步同步到 setup**

在 `setup` block 中添加：

```rust
.setup(move |app| {
    // ... 现有代码 ...
    
    // 启动后异步检查线上版本
    tauri::async_runtime::spawn(async move {
        let (success, updated) = providers::sync_providers().await;
        if updated {
            log::info!("[sync] providers updated, notifying frontend");
            // 如果有更新，可以通知前端刷新（可选）
        }
    });
    
    // ... 现有代码 ...
```

**Step 3: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: 启动流程集成迁移检查和线上同步"
```

---

### Task 8: 修改 router.rs 支持新的供应商加载方式

**Objective:** 修改 RouterState 和相关函数，支持从 providers 模块获取供应商

**Files:**
- Modify: `src-tauri/src/router.rs`

**Step 1: 添加新的构造函数**

在 `RouterState` 中添加新方法：

```rust
pub fn from_config_with_providers(
    cfg: &AppConfig, 
    providers: Vec<Provider>, 
    auth: HashMap<String, String>
) -> Self {
    let queues: HashMap<String, QueueState> = cfg
        .queues
        .iter()
        .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
        .collect();
    Self {
        queues,
        providers,
        retry: cfg.retry.clone(),
        auth_map: auth,
        app_mapping: cfg.app_mapping.clone(),
        default_queue_id: cfg.default_queue_id.clone(),
    }
}
```

**Step 2: 添加新的工厂函数**

```rust
pub fn new_router_with_providers(
    cfg: &AppConfig, 
    providers: Vec<Provider>, 
    auth: HashMap<String, String>
) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config_with_providers(cfg, providers, auth)))
}
```

**Step 3: 修改 replace_config 方法**

```rust
pub fn replace_config_and_providers(&mut self, cfg: &AppConfig, providers: Vec<Provider>) {
    self.queues = cfg
        .queues
        .iter()
        .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
        .collect();
    self.providers = providers;
    self.retry = cfg.retry.clone();
    self.app_mapping = cfg.app_mapping.clone();
    self.default_queue_id = cfg.default_queue_id.clone();
}
```

**Step 4: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 5: Commit**

```bash
git add src-tauri/src/router.rs
git commit -m "feat: RouterState 支持新的供应商加载方式"
```

---

## Phase 5: 新增 Tauri 命令

### Task 9: 添加获取供应商命令

**Objective:** 新增 get_providers_cmd 命令，返回合并后的供应商列表

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 添加命令函数**

在 `lib.rs` 命令区域添加：

```rust
#[tauri::command]
fn get_providers_cmd() -> Vec<config::Provider> {
    providers::get_all_providers()
}
```

**Step 2: 注册命令到 invoke_handler**

在 `invoke_handler` 中添加：

```rust
.invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    get_providers_cmd,
])
```

**Step 3: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: 添加 get_providers_cmd 命令"
```

---

### Task 10: 添加保存自定义供应商命令

**Objective:** 新增保存和更新自定义供应商的命令

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/src/providers.rs`

**Step 1: 在 providers.rs 添加保存函数**

追加到 `providers.rs`：

```rust
/// 添加或更新自定义供应商
pub fn save_custom_provider(provider: &Provider) -> Result<()> {
    let mut config = load_custom_providers();
    
    // 查找是否已存在
    let existing = config.custom_providers.iter().position(|p| p.id == provider.id);
    
    match existing {
        Some(idx) => {
            config.custom_providers[idx] = provider.clone();
        }
        None => {
            config.custom_providers.push(provider.clone());
        }
    }
    
    save_custom_providers(&config)?;
    Ok(())
}

/// 删除自定义供应商
pub fn delete_custom_provider(provider_id: &str) -> Result<()> {
    let mut config = load_custom_providers();
    config.custom_providers.retain(|p| p.id != provider_id);
    save_custom_providers(&config)?;
    Ok(())
}

/// 添加自定义模型到预设供应商
pub fn add_custom_model_to_builtin(provider_id: &str, model: &Model) -> Result<()> {
    let mut config = load_custom_providers();
    
    config.custom_models_in_builtin
        .entry(provider_id.to_string())
        .or_insert_with(Vec::new)
        .push(model.clone());
    
    save_custom_providers(&config)?;
    Ok(())
}

/// 从预设供应商删除自定义模型
pub fn delete_custom_model_from_builtin(provider_id: &str, model_id: &str) -> Result<()> {
    let mut config = load_custom_providers();
    
    if let Some(models) = config.custom_models_in_builtin.get_mut(provider_id) {
        models.retain(|m| m.id != model_id);
        // 如果列表为空，移除整个 entry
        if models.is_empty() {
            config.custom_models_in_builtin.remove(provider_id);
        }
    }
    
    save_custom_providers(&config)?;
    Ok(())
}
```

**Step 2: 在 lib.rs 添加命令**

```rust
#[tauri::command]
fn save_custom_provider_cmd(provider: config::Provider) -> Result<(), String> {
    providers::save_custom_provider(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_custom_provider_cmd(
    provider_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // 删除 auth
    auth::delete_api_key(&provider_id).map_err(|e| e.to_string())?;
    
    // 更新 router state
    {
        let mut r = router.write().await;
        r.providers.retain(|p| p.id != provider_id);
        let auth_map = auth::load_auth();
        r.update_auth(auth_map);
    }
    
    providers::delete_custom_provider(&provider_id).map_err(|e| e.to_string())?;
    
    // 从队列中移除
    let mut cfg = config::load_config();
    for queue in cfg.queues.values_mut() {
        queue.items.retain(|item| item.provider_id != provider_id);
    }
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn add_custom_model_to_builtin_cmd(provider_id: String, model: config::Model) -> Result<(), String> {
    let mut model = model;
    model.is_custom = true;
    providers::add_custom_model_to_builtin(&provider_id, &model).map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_custom_model_from_builtin_cmd(
    provider_id: String,
    model_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // 更新 router state
    {
        let mut r = router.write().await;
        if let Some(provider) = r.providers.iter_mut().find(|p| p.id == provider_id) {
            provider.models.retain(|m| m.id != model_id);
        }
    }
    
    providers::delete_custom_model_from_builtin(&provider_id, &model_id).map_err(|e| e.to_string())?;
    
    // 从队列中移除
    let mut cfg = config::load_config();
    for queue in cfg.queues.values_mut() {
        queue.items.retain(|item| item.provider_id != provider_id || item.model_id != model_id);
    }
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    
    Ok(())
}
```

**Step 3: 注册命令**

```rust
.invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    get_providers_cmd,
    save_custom_provider_cmd,
    delete_custom_provider_cmd,
    add_custom_model_to_builtin_cmd,
    delete_custom_model_from_builtin_cmd,
])
```

**Step 4: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/providers.rs
git commit -m "feat: 添加供应商管理相关命令"
```

---

## Phase 6: 前端改动

### Task 11: 更新 types.ts

**Objective:** 更新 TypeScript 类型定义，添加新的数据结构

**Files:**
- Modify: `src/types.ts`

**Step 1: 添加新的类型定义**

追加到 `types.ts`：

```typescript
// providers.json 结构
export interface ProvidersConfig {
  version: number;
  format_version: number;
  providers: Provider[];
}

// custom_providers.json 结构
export interface CustomProvidersConfig {
  custom_providers: Provider[];
  custom_models_in_builtin: Record<string, Model[]>;
}
```

**Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: 添加 ProvidersConfig 和 CustomProvidersConfig 类型"
```

---

### Task 12: 更新 api.ts

**Objective:** 添加新的 API 调用函数

**Files:**
- Modify: `src/api.ts`

**Step 1: 添加新的 API 函数**

追加到 `api.ts`：

```typescript
// Provider API (new)
export const getProviders = (): Promise<Provider[]> => invoke("get_providers_cmd");
export const saveCustomProvider = (provider: Provider): Promise<void> =>
  invoke("save_custom_provider_cmd", { provider });
export const deleteCustomProvider = (providerId: string): Promise<void> =>
  invoke("delete_custom_provider_cmd", { providerId });
export const addCustomModelToBuiltin = (providerId: string, model: Model): Promise<void> =>
  invoke("add_custom_model_to_builtin_cmd", { providerId, model });
export const deleteCustomModelFromBuiltin = (providerId: string, modelId: string): Promise<void> =>
  invoke("delete_custom_model_from_builtin_cmd", { providerId, modelId });
```

**Step 2: 移除旧的 deleteProvider 和 deleteModel（已被新命令替代）**

删除或注释旧的：
```typescript
// 这些被新的命令替代
// export const deleteProvider = ...
// export const deleteModel = ...
```

**Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat: 添加新的供应商 API 函数"
```

---

### Task 13: 更新 App.tsx 使用新的供应商 API

**Objective:** 修改 App.tsx，使用 getProviders 获取供应商数据

**Files:**
- Modify: `src/App.tsx`

**Step 1: 导入新的 API**

修改导入：

```typescript
import {
  getConfig, saveConfig, injectProxy, updateActive, restoreBackup, isInjected, restartProxy,
  injectCodex, removeCodex, injectHermes, removeHermes, isHermesInjected,
  injectOpenclaw, removeOpenclaw,
  getQueueStates, resetQueueExhausted, createQueue, deleteQueue, updateQueue, setDefaultQueue,
  getAuth, saveAuth, getAllAuth,
  getProviders, saveCustomProvider, deleteCustomProvider,
  addCustomModelToBuiltin, deleteCustomModelFromBuiltin,
} from "./api";
```

**Step 2: 添加 providers 状态**

```typescript
const [providers, setProviders] = useState<Provider[]>([]);
```

**Step 3: 修改初始化 useEffect**

```typescript
useEffect(() => {
  getConfig().then(setConfig);
  getProviders().then(setProviders);  // 新增
  getAllAuth().then(setAuthMap);
}, []);
```

**Step 4: 修改 handleDeleteProvider**

```typescript
function handleDeleteProvider(providerId: string) {
  deleteCustomProvider(providerId).then(() => {
    setProviders((prev) => prev.filter((p) => p.id !== providerId));
    // ... 队列更新逻辑 ...
  }).catch((e) => {
    alert(`删除失败: ${e}`);
  });
}
```

**Step 5: 修改 handleDeleteModel**

```typescript
function handleDeleteModel(providerId: string, modelId: string) {
  // 判断是预设供应商还是自定义供应商
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return;
  
  if (provider.is_custom) {
    // 自定义供应商的模型：直接从 provider 的 models 中删除
    // 需要保存整个 provider
    const updatedModels = provider.models.filter((m) => m.id !== modelId);
    saveCustomProvider({ ...provider, models: updatedModels }).then(() => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId ? { ...p, models: updatedModels } : p
        )
      );
    }).catch((e) => alert(`删除失败: ${e}`));
  } else {
    // 预设供应商的自定义模型
    deleteCustomModelFromBuiltin(providerId, modelId).then(() => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, models: p.models.filter((m) => m.id !== modelId) }
            : p
        )
      );
    }).catch((e) => alert(`删除失败: ${e}`));
  }
  
  // 从队列中移除
  // ... 保持现有逻辑 ...
}
```

**Step 6: 修改 addModel**

```typescript
function addModel(providerId: string, modelId: string) {
  const provider = providers.find((p) => p.id === providerId);
  if (!provider) return;
  
  const newModel: Model = { id: modelId, name: modelId, is_custom: true };
  
  if (provider.is_custom) {
    // 自定义供应商：保存整个 provider
    const updatedModels = [...provider.models, newModel];
    saveCustomProvider({ ...provider, models: updatedModels }).then(() => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId ? { ...p, models: updatedModels } : p
        )
      );
    }).catch(console.error);
  } else {
    // 预设供应商：添加到 custom_models_in_builtin
    addCustomModelToBuiltin(providerId, newModel).then(() => {
      setProviders((prev) =>
        prev.map((p) =>
          p.id === providerId
            ? { ...p, models: [...p.models, newModel] }
            : p
        )
      );
    }).catch(console.error);
  }
  
  setAddingModelProviderId(null);
}
```

**Step 7: 修改 addProvider**

```typescript
async function addProvider(input: AddProviderPayload) {
  const nextProvider: Provider = {
    id: createProviderId(input.name, providers),
    name: input.name,
    anthropic_url: input.anthropicUrl,
    openai_url: input.openaiUrl,
    dual_protocol: input.dualProtocol,
    protocol: "Anthropic",
    auth_scheme: "ApiKey",
    models: input.modelIds.map((modelId) => ({
      id: modelId,
      name: modelId,
      is_custom: true,
    })),
    priority: Math.max(0, ...providers.map((p) => p.priority)) + 1,
    is_custom: true,
  };

  saveCustomProvider(nextProvider).then(() => {
    setProviders((prev) => [...prev, nextProvider]);
  }).catch(console.error);
  
  if (input.apiKey.trim().length > 0) {
    await saveAuth(nextProvider.id, input.apiKey);
    setAuthMap((prev) => ({ ...prev, [nextProvider.id]: true }));
  }
}
```

**Step 8: 修改 ProvidersPage props**

修改 ProvidersPage 调用，将 config.providers 改为 providers：

```typescript
<ProvidersPage
  providers={providers}  // 改为使用 providers state
  // ... 其他 props 保持不变 ...
/>
```

**Step 9: 运行前端验证**

Run: `pnpm tauri dev`
Expected: 应用正常运行，供应商页面显示正确

**Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "feat: App.tsx 使用新的供应商 API"
```

---

### Task 14: 更新 ProvidersPage.tsx 标识预设供应商

**Objective:** 在 UI 上区分预设供应商和自定义供应商

**Files:**
- Modify: `src/components/ProvidersPage.tsx`

**Step 1: 修改 BUILTIN_PROVIDER_IDS**

```typescript
// 判断供应商是否为预设供应商
function isBuiltinProvider(provider: Provider): boolean {
  return !provider.is_custom;
}
```

**Step 2: 修改 canDeleteProvider**

```typescript
function canDeleteProvider(provider: Provider): boolean {
  return provider.is_custom;  // 只有自定义供应商可删除
}
```

**Step 3: 添加预设供应商标识**

在供应商卡片头部添加标识：

```tsx
{/* Card header */}
<div className="flex items-center justify-between mb-4">
  <div className="flex items-center gap-2">
    {authMap[provider.id] && (
      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
    )}
    <span className="font-semibold text-sm text-foreground">{provider.name}</span>
    {!provider.is_custom && (
      <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
        预设
      </span>
    )}
  </div>
  // ...
</div>
```

**Step 4: 运行前端验证**

Run: `pnpm tauri dev`
Expected: 预设供应商显示"预设"标签

**Step 5: Commit**

```bash
git add src/components/ProvidersPage.tsx
git commit -m "feat: ProvidersPage 区分预设和自定义供应商"
```

---

## Phase 7: 清理旧代码

### Task 15: 移除 lib.rs 中旧的 deleteProvider 和 deleteModel 命令

**Objective:** 移除已被替代的旧命令

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 删除旧的命令函数**

删除 `delete_provider_cmd` 和 `delete_model_cmd` 函数，以及 `BUILTIN_PROVIDER_IDS` 常量和 `is_builtin_provider` 函数。

**Step 2: 从 invoke_handler 移除旧命令**

```rust
.invoke_handler(tauri::generate_handler![
    // 移除 delete_provider_cmd, delete_model_cmd
    // ... 其他命令保持 ...
])
```

**Step 3: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "refactor: 移除旧的 delete_provider_cmd 和 delete_model_cmd"
```

---

### Task 16: 移除 config.rs 中未使用的 Provider/Model 定义

**Objective:** 确保 Provider 和 Model 定义只在 config.rs 中，其他模块通过 re-export 使用

**Files:**
- Modify: `src-tauri/src/config.rs`

**Step 1: 确认 config.rs 中的 Provider/Model 定义保留**

Provider 和 Model 定义保留在 config.rs 中，因为 providers.rs 通过 `pub use crate::config::{Provider, Model}` re-export。

不需要修改，只需确认结构正确。

**Step 2: 运行构建验证**

Run: `pnpm tauri dev`
Expected: 编译成功，无警告

**Step 3: Commit (如有修改)**

```bash
git status
# 如果有修改则 commit
```

---

## Phase 8: 测试与验证

### Task 17: 测试迁移功能

**Objective:** 验证从旧 config.json 迁移数据正确

**Files:**
- Test: 手动测试

**Step 1: 创建测试场景**

1. 备份现有 config.json
2. 删除 providers.json 和 custom_providers.json（如存在）
3. 启动应用，检查迁移是否正确执行

**Step 2: 验证迁移结果**

检查生成的文件：
- providers.json 应包含预设供应商（is_custom: false）
- custom_providers.json 应包含自定义供应商和自定义模型

**Step 3: 验证前端显示**

前端应正确显示合并后的供应商列表。

---

### Task 18: 测试线上同步功能

**Objective:** 验证线上版本检查和更新逻辑

**Files:**
- Test: 手动测试

**Step 1: 测试网络请求**

检查启动日志，确认：
- `[sync] checking remote: https://www.coding-plan.xyz/freemodel-auto-router/v1/providers.json`
- 如果网络失败，应显示 `[sync] network error: ..., using local data`

**Step 2: 测试版本比较**

如果线上版本更新：
- 应显示 `[sync] remote version X > local version Y, updating`
- providers.json 应被更新

---

### Task 19: 最终构建验证

**Objective:** 完整构建并验证功能

**Files:**
- Build: `pnpm tauri build`

**Step 1: 运行完整构建**

Run: `pnpm tauri build`
Expected: 构建成功

**Step 2: 测试构建产物**

运行构建后的应用，验证：
1. 启动正常
2. 供应商列表正确显示
3. 添加/删除供应商正常工作
4. 添加/删除模型正常工作

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: 最终构建验证通过"
```

---

## Phase 9: 更新文档

### Task 20: 更新 CLAUDE.md

**Objective:** 更新项目文档，反映新的架构

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 更新架构描述**

添加新的文件结构描述：

```markdown
### 文件结构

```
/Volumes/T7/Code/freemodel-auto-router/
├── config.json              # 用户配置（queues、retry、app_mapping、port）
├── providers.json           # 预设供应商（从线上同步）
├── custom_providers.json    # 用户自定义数据（自定义供应商 + 预设供应商的自定义模型）
└── src-tauri/builtin_providers.json  # 内置默认
```

### 数据流

```
启动
  │
  ├─→ 检查是否需要迁移（providers.json 不存在时）
  │
  ├─→ 加载 providers.json（不存在则用内置默认）
  │
  ├─→ 加载 custom_providers.json
  │
  ├─→ 异步检查线上版本
  │     └─→ version 更新? → 下载覆盖 providers.json
  │
  └─→ 合并数据 → 返回给前端
        ├─→ 预设供应商 + custom_models_in_builtin
        └─→ + custom_providers
```
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: 更新架构文档"
```

---

## 总结

实现计划包含 20 个任务，分为 9 个阶段：

1. **Phase 1**: 后端数据结构重构（4 tasks）
2. **Phase 2**: 迁移逻辑（1 task）
3. **Phase 3**: 修改 config.rs（1 task）
4. **Phase 4**: 修改启动流程（2 tasks）
5. **Phase 5**: 新增 Tauri 命令（2 tasks）
6. **Phase 6**: 前端改动（4 tasks）
7. **Phase 7**: 清理旧代码（2 tasks）
8. **Phase 8**: 测试与验证（3 tasks）
9. **Phase 9**: 更新文档（1 task）

每个任务都是 bite-sized（2-5 分钟），包含完整的代码示例和验证步骤。