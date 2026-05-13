# 多队列与应用映射功能实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 实现多个路由队列，支持按应用（Claude Code、Codex、OpenClaw、Hermes）分配不同队列，通过请求特征自动识别应用。

**Architecture:** 配置层新增 `queues` 和 `app_mapping` 字段；RouterState 从单一队列改为 HashMap<String, QueueState>；代理层新增应用识别逻辑；前端新增队列管理和应用映射配置面板。

**Tech Stack:** Rust (Tauri), TypeScript (React), serde JSON serialization

---

## Phase 1: Rust 后端 - 配置结构重构

### Task 1: 新增 Queue 结构体

**Objective:** 在 config.rs 中定义新的 Queue 结构体，包含 id、name、items 字段。

**Files:**
- Modify: `src-tauri/src/config.rs`

**Step 1: 添加 Queue 结构体定义**

在 `QueueItem` 结构体之后添加：

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Queue {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub items: Vec<QueueItem>,
}
```

**Step 2: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 无错误输出

**Step 3: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): add Queue struct for multi-queue support"
```

---

### Task 2: 新增 MatchRule 和 AppMapping 结构体

**Objective:** 定义应用识别规则和应用映射结构体。

**Files:**
- Modify: `src-tauri/src/config.rs`

**Step 1: 添加 MatchRuleType 枚举**

在 `Queue` 结构体之后添加：

```rust
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
                let header_name = self.header_name.as_ref().unwrap_or(&self.pattern);
                headers.get(header_name)
                    .and_then(|v| v.to_str().ok())
                    .map(|v| v == self.pattern)
                    .unwrap_or(false)
            },
            MatchRuleType::PathContains => path.contains(&self.pattern),
        }
    }
}
```

**Step 2: 添加 AppMapping 结构体**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppMapping {
    pub app_id: String,
    pub display_name: String,
    #[serde(default)]
    pub match_rules: Vec<MatchRule>,
    pub queue_id: String,
}
```

**Step 3: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 无错误输出

**Step 4: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): add MatchRule and AppMapping structs for app identification"
```

---

### Task 3: 扩展 AppConfig 结构体

**Objective:** 在 AppConfig 中新增 queues、app_mapping、default_queue_id 字段，保留旧 queue 字段以兼容迁移。

**Files:**
- Modify: `src-tauri/src/config.rs`

**Step 1: 修改 AppConfig 结构体**

替换现有的 `AppConfig` 结构体（约第84-92行）：

```rust
fn default_port() -> u16 { 7860 }

fn default_queues() -> std::collections::HashMap<String, Queue> {
    let mut map = std::collections::HashMap::new();
    map.insert("default".to_string(), Queue {
        id: "default".to_string(),
        name: "默认队列".to_string(),
        items: vec![],
    });
    map
}

fn default_queue_id() -> String { "default".to_string() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    // 新字段
    #[serde(default = "default_queues")]
    pub queues: std::collections::HashMap<String, Queue>,
    #[serde(default)]
    pub app_mapping: Vec<AppMapping>,
    #[serde(default = "default_queue_id")]
    pub default_queue_id: String,
    // 保留旧字段用于迁移检测（序列化时跳过）
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub queue: Vec<QueueItem>,
    #[serde(default = "default_port")]
    pub port: u16,
}
```

**Step 2: 修改 Default 实现**

替换 `Default` 实现（约第101-110行）：

```rust
impl Default for AppConfig {
    fn default() -> Self {
        Self {
            port: default_port(),
            providers: load_builtin_providers(),
            retry: RetryConfig::default(),
            queues: default_queues(),
            app_mapping: vec![],
            default_queue_id: default_queue_id(),
            queue: vec![],
        }
    }
}
```

**Step 3: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 无错误输出

**Step 4: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): extend AppConfig with queues, app_mapping, and default_queue_id"
```

---

### Task 4: 实现配置迁移逻辑

**Objective:** 在 load_config 中检测旧 queue 字段，自动迁移到 queues.default。

**Files:**
- Modify: `src-tauri/src/config.rs`

**Step 1: 修改 load_config 函数**

替换 `load_config` 函数（约第120-133行）：

```rust
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
                            log::info!("[config] migrated legacy queue to queues.default ({} items)", cfg.queue.len());
                        }
                    }
                    cfg.queue.clear();  // 清空旧字段
                }
                cfg
            },
            Err(e) => {
                eprintln!("[config] parse error: {e}");
                AppConfig::default()
            }
        }
    } else {
        AppConfig::default()
    }
}
```

**Step 2: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 无错误输出

**Step 3: Commit**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): add migration logic from legacy queue to queues.default"
```

---

## Phase 2: Rust 后端 - RouterState 重构

### Task 5: 创建 QueueState 结构体

**Objective:** 在 router.rs 中定义 QueueState，管理单个队列的状态。

**Files:**
- Modify: `src-tauri/src/router.rs`

**Step 1: 添加 QueueState 结构体**

在 `RouterState` 结构体之前添加：

```rust
#[derive(Debug, Clone)]
pub struct QueueState {
    pub active_idx: usize,
    pub items: Vec<crate::config::QueueItem>,
    pub fail_counts: Vec<u32>,
    pub exhausted_indices: Vec<usize>,
}

impl QueueState {
    pub fn from_items(items: Vec<crate::config::QueueItem>) -> Self {
        let n = items.len();
        Self {
            active_idx: 0,
            items,
            fail_counts: vec![0; n],
            exhausted_indices: vec![],
        }
    }

    pub fn is_exhausted(&self) -> bool {
        self.exhausted_indices.len() >= self.items.len()
    }

    pub fn get_active_entry(&self) -> Option<(usize, &crate::config::QueueItem)> {
        if self.items.is_empty() || self.is_exhausted() {
            return None;
        }
        // 找到第一个未用尽的索引
        for i in self.active_idx..self.items.len() {
            if !self.exhausted_indices.contains(&i) {
                return Some((i, &self.items[i]));
            }
        }
        // 从开头再找
        for i in 0..self.active_idx {
            if !self.exhausted_indices.contains(&i) {
                return Some((i, &self.items[i]));
            }
        }
        None
    }
}
```

**Step 2: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 无错误输出

**Step 3: Commit**

```bash
git add src-tauri/src/router.rs
git commit -m "feat(router): add QueueState struct for single queue management"
```

---

### Task 6: 重构 RouterState 为多队列管理

**Objective:** 将 RouterState 从单一队列改为 HashMap<String, QueueState>。

**Files:**
- Modify: `src-tauri/src/router.rs`

**Step 1: 重构 RouterState 结构体**

替换现有的 `RouterState` 结构体（约第6-15行）：

```rust
use crate::config::{AppConfig, Provider, QueueItem, RetryConfig, Queue, AppMapping};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FailureAction {
    RetryCurrent,
    SwitchProvider,
    Exhausted,
}

#[derive(Debug, Clone)]
pub struct RouterState {
    pub queues: HashMap<String, QueueState>,
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    pub auth_map: HashMap<String, String>,
    pub app_mapping: Vec<AppMapping>,
    pub default_queue_id: String,
}
```

**Step 2: 重构 RouterState 的方法**

替换 `RouterState` 的实现（约第24-140行）：

```rust
impl RouterState {
    pub fn from_config(cfg: &AppConfig) -> Self {
        let queues: HashMap<String, QueueState> = cfg.queues.iter()
            .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
            .collect();
        Self {
            queues,
            providers: cfg.providers.clone(),
            retry: cfg.retry.clone(),
            auth_map: HashMap::new(),
            app_mapping: cfg.app_mapping.clone(),
            default_queue_id: cfg.default_queue_id.clone(),
        }
    }

    pub fn from_config_with_auth(cfg: &AppConfig, auth: HashMap<String, String>) -> Self {
        let queues: HashMap<String, QueueState> = cfg.queues.iter()
            .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
            .collect();
        Self {
            queues,
            providers: cfg.providers.clone(),
            retry: cfg.retry.clone(),
            auth_map: auth,
            app_mapping: cfg.app_mapping.clone(),
            default_queue_id: cfg.default_queue_id.clone(),
        }
    }

    pub fn replace_config(&mut self, cfg: &AppConfig) {
        self.queues = cfg.queues.iter()
            .map(|(id, queue)| (id.clone(), QueueState::from_items(queue.items.clone())))
            .collect();
        self.providers = cfg.providers.clone();
        self.retry = cfg.retry.clone();
        self.app_mapping = cfg.app_mapping.clone();
        self.default_queue_id = cfg.default_queue_id.clone();
        // auth_map 保持不变
    }

    pub fn update_auth(&mut self, auth: HashMap<String, String>) {
        self.auth_map = auth;
    }

    pub fn get_api_key(&self, provider_id: &str) -> Option<&str> {
        self.auth_map.get(provider_id).map(|s| s.as_str())
    }

    /// 根据请求特征识别队列 ID
    pub fn identify_queue(&self, headers: &axum::http::HeaderMap, path: &str) -> String {
        // 1. 检查自定义 header: x-app-id
        if let Some(app_id) = headers.get("x-app-id") {
            if let Some(mapping) = self.app_mapping.iter().find(|m| m.app_id == app_id.to_str().unwrap_or("")) {
                return mapping.queue_id.clone();
            }
        }

        // 2. 检查 User-Agent
        let ua = headers.get("user-agent")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        for mapping in &self.app_mapping {
            for rule in &mapping.match_rules {
                if rule.matches(ua, headers, path) {
                    return mapping.queue_id.clone();
                }
            }
        }

        // 3. 返回默认队列
        self.default_queue_id.clone()
    }

    /// 获取指定队列的活跃项
    pub fn active_entry_for_queue(&self, queue_id: &str) -> Option<(&Provider, &str)> {
        let queue_state = self.queues.get(queue_id)?;
        let (_, item) = queue_state.get_active_entry()?;
        let provider = self.providers.iter().find(|p| p.id == item.provider_id)?;
        Some((provider, &item.model_id))
    }

    /// 记录指定队列的失败
    pub fn record_failure_for_queue(&mut self, queue_id: &str) -> FailureAction {
        let queue_state = self.queues.get_mut(queue_id)?;
        if queue_state.items.is_empty() {
            return FailureAction::Exhausted;
        }
        
        let active_idx = queue_state.active_idx;
        if active_idx < queue_state.fail_counts.len() {
            queue_state.fail_counts[active_idx] += 1;
            if queue_state.fail_counts[active_idx] > self.retry.max_retries {
                queue_state.fail_counts[active_idx] = 0;
                queue_state.exhausted_indices.push(active_idx);
                
                // 更新 active_idx 到下一个未用尽的
                if let Some((next_idx, _)) = queue_state.get_active_entry() {
                    queue_state.active_idx = next_idx;
                    if queue_state.is_exhausted() {
                        return FailureAction::Exhausted;
                    }
                    return FailureAction::SwitchProvider;
                }
                return FailureAction::Exhausted;
            }
        }
        FailureAction::RetryCurrent
    }

    /// 重置指定队列的用尽状态
    pub fn reset_queue_exhausted(&mut self, queue_id: &str) {
        if let Some(queue_state) = self.queues.get_mut(queue_id) {
            queue_state.exhausted_indices.clear();
            queue_state.fail_counts = vec![0; queue_state.items.len()];
            queue_state.active_idx = 0;
        }
    }

    /// 获取指定队列的状态信息
    pub fn get_queue_state_info(&self, queue_id: &str) -> Option<QueueStateInfo> {
        let q = self.queues.get(queue_id)?;
        Some(QueueStateInfo {
            active_idx: q.active_idx,
            exhausted_indices: q.exhausted_indices.clone(),
            items: q.items.clone(),
        })
    }

    /// 获取所有队列的状态信息
    pub fn get_all_queue_states(&self) -> HashMap<String, QueueStateInfo> {
        self.queues.iter()
            .map(|(id, q)| (id.clone(), QueueStateInfo {
                active_idx: q.active_idx,
                exhausted_indices: q.exhausted_indices.clone(),
                items: q.items.clone(),
            }))
            .collect()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct QueueStateInfo {
    pub active_idx: usize,
    pub exhausted_indices: Vec<usize>,
    pub items: Vec<QueueItem>,
}

pub type SharedRouter = Arc<RwLock<RouterState>>;

pub fn new_router(cfg: &AppConfig) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config(cfg)))
}

pub fn new_router_with_auth(cfg: &AppConfig, auth: HashMap<String, String>) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config_with_auth(cfg, auth)))
}
```

**Step 3: 移除旧的测试代码**

删除旧的测试模块（约第152-314行），后续会重写。

**Step 4: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 可能有一些编译错误，需要修复

**Step 5: Commit**

```bash
git add src-tauri/src/router.rs
git commit -m "refactor(router): change RouterState to multi-queue HashMap"
```

---

### Task 7: 更新 lib.rs 中的 RouterState 相关调用

**Objective:** 修复 lib.rs 中因 RouterState 重构导致的编译错误。

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 检查编译错误**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check 2>&1`

观察并修复 `lib.rs` 中的错误。主要变化点：
- `get_exhausted_indices_cmd` 需要改为 `get_queue_state_cmd`
- `get_active_idx_cmd` 需要改为 `get_queue_states_cmd`
- `reset_exhausted_cmd` 需要改为 `reset_queue_exhausted_cmd` 并接收 `queue_id` 参数

**Step 2: 更新 commands**

替换 `get_exhausted_indices_cmd`、`get_active_idx_cmd`、`reset_exhausted_cmd`（约第438-458行）：

```rust
#[tauri::command]
async fn get_queue_states_cmd(
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<std::collections::HashMap<String, router::QueueStateInfo>, String> {
    Ok(router.read().await.get_all_queue_states())
}

#[tauri::command]
async fn reset_queue_exhausted_cmd(
    queue_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    router.write().await.reset_queue_exhausted(&queue_id);
    Ok(())
}
```

**Step 3: 更新 invoke_handler**

替换 `invoke_handler` 中的旧命令名（约第97-123行）：

```rust
.invoke_handler(tauri::generate_handler![
    get_config,
    save_config_cmd,
    inject_proxy_cmd,
    update_active_cmd,
    remove_proxy_cmd,
    restore_backup_cmd,
    has_backup_cmd,
    is_injected_cmd,
    get_proxy_logs_cmd,
    restart_proxy_cmd,
    inject_codex_cmd,
    remove_codex_cmd,
    inject_hermes_cmd,
    remove_hermes_cmd,
    is_hermes_injected_cmd,
    inject_openclaw_cmd,
    remove_openclaw_cmd,
    get_queue_states_cmd,
    reset_queue_exhausted_cmd,
    get_auth_cmd,
    save_auth_cmd,
    has_auth_cmd,
    get_all_auth_cmd,
    test_provider_connection_cmd,
])
```

**Step 4: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: lib.rs 编译通过

**Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "refactor(lib): update commands for multi-queue RouterState"
```

---

### Task 8: 新增队列管理 Tauri Commands

**Objective:** 在 lib.rs 中添加创建、删除、更新队列的 commands。

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 添加队列管理 commands**

在 `test_provider_connection_cmd` 之后添加：

```rust
// 队列管理
#[tauri::command]
async fn create_queue_cmd(
    name: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<config::Queue, String> {
    let id = format!("queue-{}", uuid::Uuid::new_v4().to_string().split('-').next().unwrap_or("new"));
    let queue = config::Queue {
        id: id.clone(),
        name,
        items: vec![],
    };
    
    // 更新 router 状态
    router.write().await.queues.insert(id.clone(), router::QueueState::from_items(vec![]));
    
    // 保存配置
    let mut cfg = config::load_config();
    cfg.queues.insert(id, queue.clone());
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    
    Ok(queue)
}

#[tauri::command]
async fn delete_queue_cmd(
    queue_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // 不能删除默认队列
    let cfg = config::load_config();
    if queue_id == cfg.default_queue_id {
        return Err("不能删除默认队列".to_string());
    }
    
    // 更新 router 状态
    router.write().await.queues.remove(&queue_id);
    
    // 保存配置
    let mut cfg = config::load_config();
    cfg.queues.remove(&queue_id);
    // 移除关联的 app_mapping
    cfg.app_mapping.retain(|m| m.queue_id != queue_id);
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
async fn update_queue_cmd(
    queue_id: String,
    name: String,
    items: Vec<config::QueueItem>,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // 更新 router 状态
    if let Some(queue_state) = router.write().await.queues.get_mut(&queue_id) {
        queue_state.items = items.clone();
        queue_state.fail_counts = vec![0; items.len()];
        queue_state.exhausted_indices.clear();
        queue_state.active_idx = 0;
    }
    
    // 保存配置
    let mut cfg = config::load_config();
    if let Some(queue) = cfg.queues.get_mut(&queue_id) {
        queue.name = name;
        queue.items = items;
    }
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
fn get_app_mappings_cmd() -> Vec<config::AppMapping> {
    config::load_config().app_mapping
}

#[tauri::command]
async fn update_app_mapping_cmd(
    app_id: String,
    queue_id: String,
    router: tauri::State<'_, router::SharedRouter>,
) -> Result<(), String> {
    // 保存配置
    let mut cfg = config::load_config();
    if let Some(mapping) = cfg.app_mapping.iter_mut().find(|m| m.app_id == app_id) {
        mapping.queue_id = queue_id;
    } else {
        // 新增映射
        cfg.app_mapping.push(config::AppMapping {
            app_id,
            display_name: app_id.clone(),
            match_rules: vec![],
            queue_id,
        });
    }
    
    // 更新 router 状态
    router.write().await.app_mapping = cfg.app_mapping.clone();
    
    config::save_config(&cfg).map_err(|e| e.to_string())?;
    Ok(())
}
```

**Step 2: 添加 uuid 依赖**

检查 Cargo.toml 是否有 uuid 依赖，如果没有则添加：

Run: `grep uuid /Volumes/T7/Code/freemodel-auto-router/src-tauri/Cargo.toml`

如果没有，在 `[dependencies]` 中添加：

```toml
uuid = { version = "1.0", features = ["v4"] }
```

**Step 3: 更新 invoke_handler**

将新命令添加到 invoke_handler：

```rust
.invoke_handler(tauri::generate_handler![
    // ... 现有命令 ...
    create_queue_cmd,
    delete_queue_cmd,
    update_queue_cmd,
    get_app_mappings_cmd,
    update_app_mapping_cmd,
])
```

**Step 4: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译通过

**Step 5: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/Cargo.toml
git commit -m "feat(commands): add queue management and app mapping commands"
```

---

## Phase 3: Rust 后端 - 代理层重构

### Task 9: 更新 proxy.rs 使用多队列

**Objective:** 修改 proxy_handler 使用新的 identify_queue 和 active_entry_for_queue 方法。

**Files:**
- Modify: `src-tauri/src/proxy.rs`

**Step 1: 修改 proxy_handler 函数**

在 `proxy_handler` 函数开头（约第79行后），添加队列识别逻辑：

替换原有的活跃项获取代码：

```rust
async fn proxy_handler(State(state): State<ProxyState>, req: Request<Body>) -> Response<Body> {
    let (parts, body) = req.into_parts();
    let body_bytes = match body.collect().await {
        Ok(collected) => collected.to_bytes(),
        Err(_) => return error_response(StatusCode::BAD_REQUEST, "failed to read request body"),
    };

    let method = parts.method.clone();
    let path = parts
        .uri
        .path_and_query()
        .map(|pq| pq.as_str().to_owned())
        .unwrap_or_else(|| "/".to_owned());
    let original_headers = parts.headers.clone();

    // 解析路径前缀
    let (route_prefix, stripped_path) = match parse_route_prefix(&path) {
        Some(result) => result,
        None => {
            return error_response(
                StatusCode::BAD_REQUEST,
                "path must start with /anthropic or /openai",
            );
        }
    };
    let stripped_path = stripped_path.to_owned();

    // ===== 新增：队列识别 =====
    let queue_id = {
        let r = state.router.read().await;
        r.identify_queue(&original_headers, &stripped_path)
    };

    log::debug!(
        "[proxy] inbound {} {} | queue_id={} has_auth={}",
        method,
        path,
        queue_id,
        original_headers.contains_key("authorization"),
    );
    state.logs.push(
        LogLevel::Info,
        "inbound request",
        [
            ("method", method.as_str().to_owned()),
            ("path", path.clone()),
            ("queue_id", queue_id.clone()),
        ],
    );

    let retry_delay = {
        let r = state.router.read().await;
        r.retry.retry_delay_secs
    };

    loop {
        // ===== 修改：使用队列识别后的活跃项 =====
        let (target_url, protocol, auth_scheme, model_id, provider_name, provider_id) = {
            let r = state.router.read().await;
            match r.active_entry_for_queue(&queue_id) {
                Some((p, mid)) => {
                    // ... 原有的 URL 选择逻辑保持不变 ...
                    let target_url = match route_prefix {
                        RoutePrefix::Anthropic => {
                            if p.anthropic_url.is_empty() {
                                return error_response(
                                    StatusCode::SERVICE_UNAVAILABLE,
                                    "provider has no anthropic_url configured",
                                );
                            }
                            p.anthropic_url.clone()
                        }
                        RoutePrefix::OpenAI => {
                            if p.openai_url.is_empty() {
                                return error_response(
                                    StatusCode::SERVICE_UNAVAILABLE,
                                    "provider has no openai_url configured",
                                );
                            }
                            p.openai_url.clone()
                        }
                    };
                    (
                        target_url,
                        p.protocol.clone(),
                        p.effective_auth_scheme(),
                        mid.to_owned(),
                        p.name.clone(),
                        p.id.clone(),
                    )
                }
                None => {
                    return error_response(
                        StatusCode::SERVICE_UNAVAILABLE,
                        format!("no available provider in queue '{}'", queue_id),
                    )
                }
            }
        };

        // ... 后续代码基本保持不变，只需修改 record_failure 调用 ...
```

**Step 2: 修改 record_failure 调用**

将所有 `r.record_failure()` 改为 `r.record_failure_for_queue(&queue_id)`。

找到两处调用：
- 第243行附近（成功响应后的重试判断）
- 第312行附近（请求错误后的处理）

**Step 3: 修改通知事件**

将 `notify_tx.send(next_name)` 改为发送包含队列信息的 JSON：

```rust
// 构造通知 payload
let payload = serde_json::json!({
    "queue_id": queue_id,
    "provider_name": next_name.clone(),
});
let _ = state.notify_tx.send(payload.to_string());
```

**Step 4: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译通过

**Step 5: Commit**

```bash
git add src-tauri/src/proxy.rs
git commit -m "refactor(proxy): use queue identification and per-queue routing"
```

---

### Task 10: 更新 lib.rs 事件监听逻辑

**Objective:** 修改事件监听，解析 JSON payload 并发送结构化事件。

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 定义事件 payload 结构体**

在 lib.rs 开头添加：

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct ProviderSwitchedPayload {
    pub queue_id: String,
    pub provider_name: String,
    pub model_id: String,
}
```

**Step 2: 修改事件监听逻辑**

替换 setup 中的事件监听代码（约第56-65行）：

```rust
// Listen for provider switch notifications and emit to frontend
let app_handle = app.handle().clone();
tauri::async_runtime::spawn(async move {
    while notify_rx.changed().await.is_ok() {
        let payload_str = notify_rx.borrow().clone();
        if !payload_str.is_empty() {
            // 解析 JSON payload
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&payload_str) {
                let event_payload = ProviderSwitchedPayload {
                    queue_id: json["queue_id"].as_str().unwrap_or("default").to_string(),
                    provider_name: json["provider_name"].as_str().unwrap_or("").to_string(),
                    model_id: json["model_id"].as_str().unwrap_or("").to_string(),
                };
                use tauri::Emitter;
                let _ = app_handle.emit("provider-switched", &event_payload);
            }
        }
    }
});
```

**Step 3: 运行编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译通过

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "refactor(lib): emit structured provider-switched events with queue_id"
```

---

## Phase 4: TypeScript 前端 - 类型定义更新

### Task 11: 更新 TypeScript 类型定义

**Objective:** 在 types.ts 中新增 Queue、AppMapping、MatchRule 类型，修改 AppConfig。

**Files:**
- Modify: `src/types.ts`

**Step 1: 替换整个 types.ts 文件**

```typescript
export type Protocol = "OpenAI" | "Anthropic";
export type AuthScheme = "Bearer" | "ApiKey";

export interface Model {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Provider {
  id: string;
  name: string;
  anthropic_url: string;
  openai_url: string;
  dual_protocol: boolean;
  protocol: Protocol;
  auth_scheme?: AuthScheme;
  models: Model[];
  enabled: boolean;
  priority: number;
}

export interface RetryConfig {
  max_retries: number;
  retry_delay_secs: number;
}

export interface QueueItem {
  provider_id: string;
  model_id: string;
}

// ===== 新增类型 =====

export interface Queue {
  id: string;
  name: string;
  items: QueueItem[];
}

export type MatchRuleType = "user_agent_contains" | "header_equals" | "path_contains";

export interface MatchRule {
  type: MatchRuleType;
  pattern: string;
  header_name?: string;
}

export interface AppMapping {
  app_id: string;
  display_name: string;
  match_rules: MatchRule[];
  queue_id: string;
}

export interface QueueStateInfo {
  active_idx: number;
  exhausted_indices: number[];
  items: QueueItem[];
}

// ===== 修改后的 AppConfig =====

export interface AppConfig {
  providers: Provider[];
  retry: RetryConfig;
  queues: Record<string, Queue>;
  app_mapping: AppMapping[];
  default_queue_id: string;
  queue: QueueItem[];  // 保留用于迁移检测
  port: number;
}

export type ProxyLogLevel = "info" | "warn" | "error";

export interface ProxyLogEntry {
  id: number;
  timestamp_ms: number;
  level: ProxyLogLevel;
  message: string;
  fields: Record<string, string>;
}

// ===== 事件 payload 类型 =====

export interface ProviderSwitchedPayload {
  queue_id: string;
  provider_name: string;
  model_id: string;
}
```

**Step 2: 运行 TypeScript 类型检查**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit`
Expected: 类型检查通过（可能有 App.tsx 的错误，后续修复）

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add Queue, AppMapping, and update AppConfig types"
```

---

### Task 12: 更新 api.ts 函数

**Objective:** 更新 api.ts 中的函数以匹配新的 Rust commands。

**Files:**
- Modify: `src/api.ts`

**Step 1: 替换整个 api.ts 文件**

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, ProxyLogEntry, Model, Queue, AppMapping, QueueStateInfo } from "./types";

export const getConfig = (): Promise<AppConfig> => invoke("get_config");
export const saveConfig = (cfg: AppConfig): Promise<void> => invoke("save_config_cmd", { cfg });
export const injectProxy = (port: number, authToken: string): Promise<void> =>
  invoke("inject_proxy_cmd", { port, authToken });
export const updateActive = (authToken: string): Promise<void> =>
  invoke("update_active_cmd", { authToken });
export const removeProxy = (): Promise<void> => invoke("remove_proxy_cmd");
export const restoreBackup = (): Promise<void> => invoke("restore_backup_cmd");
export const hasBackup = (): Promise<boolean> => invoke("has_backup_cmd");
export const isInjected = (port: number): Promise<boolean> => invoke("is_injected_cmd", { port });
export const getProxyLogs = (): Promise<ProxyLogEntry[]> => invoke("get_proxy_logs_cmd");
export const restartProxy = (port: number): Promise<void> => invoke("restart_proxy_cmd", { port });

// Auth API
export const getAuth = (providerId: string): Promise<string | null> => invoke("get_auth_cmd", { providerId });
export const saveAuth = (providerId: string, apiKey: string): Promise<void> => invoke("save_auth_cmd", { providerId, apiKey });
export const hasAuth = (providerId: string): Promise<boolean> => invoke("has_auth_cmd", { providerId });
export const getAllAuth = (): Promise<Record<string, boolean>> => invoke("get_all_auth_cmd");

// Injection API
export const injectCodex = (providerId: string, apiKey: string, port: number): Promise<void> =>
  invoke("inject_codex_cmd", { providerId, apiKey, port });
export const removeCodex = (): Promise<void> => invoke("remove_codex_cmd");
export const injectHermes = (providerId: string, apiKey: string, port: number): Promise<void> =>
  invoke("inject_hermes_cmd", { providerId, apiKey, port });
export const removeHermes = (providerId: string): Promise<void> => invoke("remove_hermes_cmd", { providerId });
export const isHermesInjected = (providerId: string): Promise<boolean> => invoke("is_hermes_injected_cmd", { providerId });
export const injectOpenclaw = (providerId: string, apiKey: string, models: Model[], port: number): Promise<void> =>
  invoke("inject_openclaw_cmd", { providerId, apiKey, models, port });
export const removeOpenclaw = (providerId: string): Promise<void> => invoke("remove_openclaw_cmd", { providerId });

// ===== 队列状态 API（新） =====
export const getQueueStates = (): Promise<Record<string, QueueStateInfo>> => invoke("get_queue_states_cmd");
export const resetQueueExhausted = (queueId: string): Promise<void> => invoke("reset_queue_exhausted_cmd", { queueId });

// ===== 队列管理 API（新） =====
export const createQueue = (name: string): Promise<Queue> => invoke("create_queue_cmd", { name });
export const deleteQueue = (queueId: string): Promise<void> => invoke("delete_queue_cmd", { queueId });
export const updateQueue = (queueId: string, name: string, items: QueueItem[]): Promise<void> =>
  invoke("update_queue_cmd", { queueId, name, items });

// ===== 应用映射 API（新） =====
export const getAppMappings = (): Promise<AppMapping[]> => invoke("get_app_mappings_cmd");
export const updateAppMapping = (appId: string, queueId: string): Promise<void> =>
  invoke("update_app_mapping_cmd", { appId, queueId });

// Test connection
export interface TestConnectionResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
}
export const testProviderConnection = (providerId: string): Promise<TestConnectionResult> =>
  invoke("test_provider_connection_cmd", { providerId });
```

**Step 2: 运行 TypeScript 类型检查**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit`
Expected: 类型检查通过

**Step 3: Commit**

```bash
git add src/api.ts
git commit -m "feat(api): add queue management and app mapping API functions"
```

---

## Phase 5: TypeScript 前端 - 组件重构

### Task 13: 创建 QueueManagerPanel 组件

**Objective:** 创建队列管理面板组件，显示所有队列卡片。

**Files:**
- Create: `src/components/QueueManagerPanel.tsx`

**Step 1: 创建组件文件**

```typescript
import type { Queue, QueueStateInfo, Provider } from "../types";

interface Props {
  queues: Record<string, Queue>;
  queueStates: Record<string, QueueStateInfo>;
  providers: Provider[];
  defaultQueueId: string;
  selectedQueueId: string | null;
  onSelectQueue: (queueId: string) => void;
  onCreateQueue: (name: string) => void;
  onDeleteQueue: (queueId: string) => void;
}

export function QueueManagerPanel({
  queues,
  queueStates,
  providers,
  defaultQueueId,
  selectedQueueId,
  onSelectQueue,
  onCreateQueue,
  onDeleteQueue,
}: Props) {
  const queueList = Object.values(queues);

  return (
    <div style={{
      padding: "12px 24px 18px",
      borderBottom: "1px solid var(--fm-color-hairline)",
      background: "var(--fm-color-surface-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span className="fm-eyebrow">队列管理</span>
        <button
          className="fm-btn-text"
          style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
          onClick={() => {
            const name = prompt("输入队列名称")?.trim();
            if (name) onCreateQueue(name);
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M8 2v12M2 8h12"/>
          </svg>
          新建
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {queueList.map((queue) => {
          const state = queueStates[queue.id];
          const isActive = queue.id === defaultQueueId;
          const isSelected = queue.id === selectedQueueId;
          const itemCount = queue.items.length;
          const exhaustedCount = state?.exhausted_indices.length ?? 0;

          return (
            <div
              key={queue.id}
              onClick={() => onSelectQueue(queue.id)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: isSelected ? "2px solid var(--fm-color-ink)" : "1px solid var(--fm-color-hairline)",
                background: isSelected ? "var(--fm-color-surface)" : "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s",
              }}
            >
              <span className="fm-body-sm" style={{ fontWeight: 500 }}>
                {queue.name}
              </span>
              {isActive && (
                <span className="fm-caption" style={{
                  background: "var(--fm-success)",
                  color: "#fff",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "10px",
                }}>
                  默认
                </span>
              )}
              {itemCount > 0 && (
                <span className="fm-caption" style={{
                  background: exhaustedCount >= itemCount ? "var(--fm-magenta)" : "var(--fm-color-surface-soft)",
                  color: exhaustedCount >= itemCount ? "#fff" : "var(--fm-color-ink)",
                  borderRadius: "var(--fm-radius-full)",
                  padding: "2px 6px",
                  fontSize: "11px",
                }}>
                  {exhaustedCount >= itemCount ? "用尽" : `${itemCount}项`}
                </span>
              )}
              {!isActive && itemCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`确定删除队列 "${queue.name}"？`)) {
                      onDeleteQueue(queue.id);
                    }
                  }}
                  style={{
                    marginLeft: "4px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fm-ink-faint)",
                    display: "flex",
                    alignItems: "center",
                    padding: "0",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 4L4 12M4 4l8 8"/>
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: 运行 TypeScript 类型检查**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit`
Expected: 新组件类型检查通过

**Step 3: Commit**

```bash
git add src/components/QueueManagerPanel.tsx
git commit -m "feat(ui): add QueueManagerPanel component"
```

---

### Task 14: 创建 QueueDetailPanel 组件

**Objective:** 创建队列详情面板，显示选中队列的模型列表，支持拖拽排序。

**Files:**
- Create: `src/components/QueueDetailPanel.tsx`

**Step 1: 创建组件文件**

```typescript
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QueueItem, Provider, QueueStateInfo } from "../types";

interface Props {
  queueId: string;
  items: QueueItem[];
  providers: Provider[];
  stateInfo: QueueStateInfo | undefined;
  onReorder: (newItems: QueueItem[]) => void;
  onRemove: (index: number) => void;
  onResetExhausted: () => void;
}

function SortableQueueItem({
  item,
  index,
  label,
  isActive,
  isExhausted,
  onRemove,
}: {
  item: QueueItem;
  index: number;
  label: string;
  isActive: boolean;
  isExhausted: boolean;
  onRemove: (i: number) => void;
}) {
  const uid = `${item.provider_id}::${item.model_id}::${index}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : isExhausted ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isActive ? "fm-queue-chip fm-queue-chip-first" : "fm-queue-chip"}
    >
      <span className="fm-caption" style={{
        fontWeight: 600,
        color: isExhausted ? "var(--fm-ink-faint)" : "var(--fm-color-ink)",
        minWidth: "14px",
        textAlign: "center",
        flexShrink: 0,
      }}>
        {index + 1}
      </span>

      {isActive && !isExhausted && (
        <span className="fm-caption" style={{
          background: "var(--fm-success)",
          color: "#ffffff",
          borderRadius: "4px",
          padding: "2px 6px",
          fontSize: "11px",
          fontWeight: 600,
        }}>
          当前
        </span>
      )}

      {isExhausted && (
        <span className="fm-caption" style={{
          background: "var(--fm-ink-faint)",
          color: "#ffffff",
          borderRadius: "4px",
          padding: "2px 6px",
          fontSize: "11px",
        }}>
          已用尽
        </span>
      )}

      <span
        {...attributes}
        {...listeners}
        style={{
          color: "var(--fm-ink-faint)",
          cursor: "grab",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
        title="拖拽排序"
      >
        <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
          <circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/>
          <circle cx="2" cy="5" r="1"/><circle cx="6" cy="5" r="1"/>
          <circle cx="2" cy="8" r="1"/><circle cx="6" cy="8" r="1"/>
        </svg>
      </span>

      <span className="fm-body-sm" style={{
        fontWeight: 500,
        color: isExhausted ? "var(--fm-ink-faint)" : "var(--fm-color-ink)",
      }}>
        {label}
      </span>

      <button
        onClick={() => onRemove(index)}
        style={{
          marginLeft: "2px",
          color: "var(--fm-ink-faint)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
        }}
        aria-label="从队列移除"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 4L4 12M4 4l8 8"/>
        </svg>
      </button>
    </div>
  );
}

export function QueueDetailPanel({
  queueId,
  items,
  providers,
  stateInfo,
  onReorder,
  onRemove,
  onResetExhausted,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const ids = items.map(
    (item, i) => `${item.provider_id}::${item.model_id}::${i}`
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(active.id);
    const newIdx = ids.indexOf(over.id);
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(arrayMove(items, oldIdx, newIdx));
    }
  }

  function getLabel(item: QueueItem) {
    const provider = providers.find((p) => p.id === item.provider_id);
    const model = provider?.models.find((m) => m.id === item.model_id);
    return `${provider?.name ?? item.provider_id} / ${model?.name ?? item.model_id}`;
  }

  const exhaustedIndices = stateInfo?.exhausted_indices ?? [];
  const activeIdx = stateInfo?.active_idx ?? 0;
  const hasExhausted = exhaustedIndices.length > 0;

  if (items.length === 0) {
    return (
      <div style={{
        padding: "12px 24px",
        borderBottom: "1px solid var(--fm-color-hairline)",
      }}>
        <span className="fm-body-sm" style={{ color: "var(--fm-ink-faint)" }}>
          队列为空，点击模型旁的 + 添加
        </span>
      </div>
    );
  }

  return (
    <div style={{
      padding: "12px 24px 18px",
      borderBottom: "1px solid var(--fm-color-hairline)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span className="fm-caption" style={{ color: "var(--fm-ink-muted)" }}>
          队列内容
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="fm-caption" style={{
            background: "#fff",
            border: "1px solid var(--fm-color-hairline)",
            borderRadius: "var(--fm-radius-full)",
            padding: "2px 8px",
          }}>
            {items.length}
          </span>
          {hasExhausted && (
            <button
              className="fm-btn-text"
              style={{ fontSize: "12px", color: "var(--fm-magenta)" }}
              onClick={onResetExhausted}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 8a6 6 0 1012 0A6 6 0 102 8"/>
                <path d="M8 5v3l2 2"/>
              </svg>
              重置
            </button>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {items.map((item, i) => (
              <SortableQueueItem
                key={ids[i]}
                item={item}
                index={i}
                label={getLabel(item)}
                isActive={i === activeIdx}
                isExhausted={exhaustedIndices.includes(i)}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
```

**Step 2: 运行 TypeScript 类型检查**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit`
Expected: 类型检查通过

**Step 3: Commit**

```bash
git add src/components/QueueDetailPanel.tsx
git commit -m "feat(ui): add QueueDetailPanel component with drag-and-drop"
```

---

### Task 15: 重构 App.tsx 状态管理

**Objective:** 修改 App.tsx 以支持多队列状态管理，替换旧的单一队列逻辑。

**Files:**
- Modify: `src/App.tsx`

这是一个较大的重构任务，需要分步骤进行。

**Step 1: 更新 imports**

替换 imports（第1-31行）：

```typescript
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { sendNotification } from "@tauri-apps/plugin-notification";
import {
  getConfig,
  saveConfig,
  injectProxy,
  updateActive,
  restoreBackup,
  isInjected,
  restartProxy,
  injectCodex, removeCodex,
  injectHermes, removeHermes, isHermesInjected,
  injectOpenclaw, removeOpenclaw,
  getQueueStates,
  resetQueueExhausted,
  createQueue,
  deleteQueue,
  updateQueue,
  getAuth, saveAuth, getAllAuth,
} from "./api";
import { ProviderCard } from "./components/ProviderCard";
import { QueueManagerPanel } from "./components/QueueManagerPanel";
import { QueueDetailPanel } from "./components/QueueDetailPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ProxyLogPanel } from "./components/ProxyLogPanel";
import { AddProviderModal, type AddProviderPayload } from "./components/AddProviderModal";
import { AddModelModal } from "./components/AddModelModal";
import { AppToggle } from "./components/AppToggle";
import type { AppConfig, Provider, QueueItem, QueueStateInfo, Queue, ProviderSwitchedPayload } from "./types";
import hermesImg from "./assets/images/hermes.png";
import openclawImg from "./assets/images/openclaw.png";
import "./App.css";
```

**Step 2: 更新状态变量**

替换状态定义（约第57-71行）：

```typescript
const [config, setConfig] = useState<AppConfig | null>(null);
const [authMap, setAuthMap] = useState<Record<string, boolean>>({});  // provider_id -> hasKey
const [showSettings, setShowSettings] = useState(false);
const [showLogs, setShowLogs] = useState(false);
const [showAddProvider, setShowAddProvider] = useState(false);
const [editingKeyProviderId, setEditingKeyProviderId] = useState<string | null>(null);
const [addingModelProviderId, setAddingModelProviderId] = useState<string | null>(null);
const [appStates, setAppStates] = useState({
  cc: false,
  codex: false,
  hermes: false,
  openclaw: false,
});
// ===== 新增多队列状态 =====
const [queueStates, setQueueStates] = useState<Record<string, QueueStateInfo>>({});
const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);
```

**Step 3: 更新事件监听**

替换 provider-switched 事件监听（约第83-93行）：

```typescript
useEffect(() => {
  const unlisten = listen<ProviderSwitchedPayload>("provider-switched", (e) => {
    sendNotification({
      title: "freemodel router",
      body: `队列 ${e.payload.queue_id} 已切换到 ${e.payload.provider_name}`,
    });
    // 更新所有队列状态
    getQueueStates().then(setQueueStates).catch(console.error);
  });
  return () => { unlisten.then(f => f()); };
}, []);
```

**Step 4: 更新轮询逻辑**

替换轮询用尽状态的 useEffect（约第96-110行）：

```typescript
// 定期轮询队列状态（每 5 秒）
useEffect(() => {
  if (!config) return;
  const interval = setInterval(() => {
    getQueueStates().then(setQueueStates).catch(console.error);
  }, 5000);
  return () => clearInterval(interval);
}, [config]);

// 初始加载队列状态
useEffect(() => {
  if (!config) return;
  getQueueStates().then(setQueueStates).catch(console.error);
  // 默认选中 default 队列
  setSelectedQueueId(config.default_queue_id);
}, [config]);
```

**Step 5: 更新 updateAndSave 函数**

修改 updateAndSave 函数（约第157-160行）：

```typescript
function updateAndSave(next: AppConfig) {
  setConfig(next);
  saveConfig(next);
  // 保存后刷新队列状态
  getQueueStates().then(setQueueStates).catch(console.error);
}
```

**Step 6: 更新 addToQueue 函数**

修改 addToQueue 函数（约第162-166行），添加到选中的队列：

```typescript
function addToQueue(providerId: string, modelId: string) {
  if (!authMap[providerId]) return;  // 需要 API key 才能添加
  if (!selectedQueueId) return;
  const newItem: QueueItem = { provider_id: providerId, model_id: modelId };
  const queue = config!.queues[selectedQueueId];
  if (!queue) return;
  const updatedQueue = { ...queue, items: [...queue.items, newItem] };
  const updatedQueues = { ...config!.queues, [selectedQueueId]: updatedQueue };
  updateAndSave({ ...config!, queues: updatedQueues });
}
```

**Step 7: 更新 removeFromQueue 函数**

修改 removeFromQueue 函数（约第169-178行）：

```typescript
function removeFromQueue(queueId: string, index: number) {
  const queue = config!.queues[queueId];
  if (!queue) return;
  const newItems = queue.items.filter((_, i) => i !== index);
  const updatedQueue = { ...queue, items: newItems };
  const updatedQueues = { ...config!.queues, [queueId]: updatedQueue };
  updateAndSave({ ...config!, queues: updatedQueues });
  
  // 如果默认队列清空，关闭所有注入
  if (queueId === config!.default_queue_id && newItems.length === 0) {
    if (appStates.cc) { restoreBackup().catch(console.error); }
    if (appStates.codex) { removeCodex().catch(console.error); }
    if (appStates.hermes) { removeHermes(activeProvider?.id || "").catch(console.error); }
    if (appStates.openclaw) { removeOpenclaw(activeProvider?.id || "").catch(console.error); }
    setAppStates({ cc: false, codex: false, hermes: false, openclaw: false });
  }
}
```

**Step 8: 新增队列管理函数**

添加队列管理函数：

```typescript
function handleCreateQueue(name: string) {
  createQueue(name).then((newQueue) => {
    const updatedQueues = { ...config!.queues, [newQueue.id]: newQueue };
    setConfig({ ...config!, queues: updatedQueues });
    setSelectedQueueId(newQueue.id);
  }).catch(console.error);
}

function handleDeleteQueue(queueId: string) {
  deleteQueue(queueId).then(() => {
    const updatedQueues = { ...config!.queues };
    delete updatedQueues[queueId];
    setConfig({ ...config!, queues: updatedQueues });
    if (selectedQueueId === queueId) {
      setSelectedQueueId(config!.default_queue_id);
    }
  }).catch(console.error);
}

function handleReorderQueue(queueId: string, newItems: QueueItem[]) {
  const queue = config!.queues[queueId];
  if (!queue) return;
  const updatedQueue = { ...queue, items: newItems };
  const updatedQueues = { ...config!.queues, [queueId]: updatedQueue };
  updateAndSave({ ...config!, queues: updatedQueues });
}

function handleResetQueueExhausted(queueId: string) {
  resetQueueExhausted(queueId).then(() => {
    getQueueStates().then((states) => {
      setQueueStates(states);
    }).catch(console.error);
  }).catch(console.error);
}
```

**Step 9: 更新 activeProvider 计算**

修改 activeProvider 计算（约第232-237行），使用默认队列：

```typescript
// 使用默认队列的活跃项作为全局状态显示
const defaultQueueState = queueStates[config.default_queue_id];
const defaultQueue = config.queues[config.default_queue_id];
const activeQueueItem = defaultQueueState?.items[defaultQueueState?.active_idx ?? 0]
  ?? defaultQueue?.items[0];
const activeProvider = activeQueueItem
  ? config.providers.find((p) => p.id === activeQueueItem.provider_id)
  : undefined;
const activeModel = activeProvider?.models.find((m) => m.id === activeQueueItem?.model_id);
const isActive = !!(activeProvider && activeModel);
```

**Step 10: 更新 JSX - 替换 QueuePanel**

替换 QueuePanel（约第409-420行）为新的队列管理组件：

```typescript
{/* 队列管理面板 */}
<QueueManagerPanel
  queues={config.queues}
  queueStates={queueStates}
  providers={config.providers}
  defaultQueueId={config.default_queue_id}
  selectedQueueId={selectedQueueId}
  onSelectQueue={(id) => setSelectedQueueId(id)}
  onCreateQueue={handleCreateQueue}
  onDeleteQueue={handleDeleteQueue}
/>

{/* 选中队列详情 */}
{selectedQueueId && (
  <QueueDetailPanel
    queueId={selectedQueueId}
    items={config.queues[selectedQueueId]?.items ?? []}
    providers={config.providers}
    stateInfo={queueStates[selectedQueueId]}
    onReorder={(items) => handleReorderQueue(selectedQueueId, items)}
    onRemove={(index) => removeFromQueue(selectedQueueId, index)}
    onResetExhausted={() => handleResetQueueExhausted(selectedQueueId)}
  />
)}
```

**Step 11: 运行 TypeScript 类型检查**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit`
Expected: 类型检查通过

**Step 12: Commit**

```bash
git add src/App.tsx
git commit -m "refactor(App): multi-queue state management with QueueManagerPanel"
```

---

## Phase 6: 测试与验证

### Task 16: 运行完整编译和类型检查

**Objective:** 确保 Rust 后端和 TypeScript 前端都能编译通过。

**Step 1: 编译 Rust 后端**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo build`
Expected: 编译成功，无错误

**Step 2: TypeScript 类型检查**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit`
Expected: 类型检查通过

**Step 3: 如果有错误，修复并重新运行**

**Step 4: Commit**

```bash
git add -A
git commit -m "fix: resolve compilation and type errors"
```

---

### Task 17: 运行 Tauri 开发环境测试

**Objective:** 启动 Tauri 开发环境，验证基本功能。

**Step 1: 启动开发环境**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tauri dev`

**Step 2: 手动验证功能**

- 应用是否正常启动
- 队列管理面板是否显示
- 默认队列是否正确加载
- 点击队列卡片是否切换详情
- 添加模型到队列是否工作
- 拖拽排序是否工作

**Step 3: 如果有问题，修复并重新测试**

---

### Task 18: 添加 Rust 单元测试

**Objective:** 为关键功能添加单元测试。

**Files:**
- Modify: `src-tauri/src/router.rs`
- Modify: `src-tauri/src/config.rs`

**Step 1: 在 router.rs 中添加测试**

在文件末尾添加：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Model, Protocol, Queue, AppMapping, MatchRule, MatchRuleType};

    fn provider(id: &str, model_id: &str) -> Provider {
        Provider {
            id: id.to_owned(),
            name: id.to_owned(),
            anthropic_url: "https://example.com/api".to_owned(),
            openai_url: "https://example.com/api".to_owned(),
            dual_protocol: false,
            protocol: Protocol::Anthropic,
            auth_scheme: None,
            models: vec![Model {
                id: model_id.to_owned(),
                name: model_id.to_owned(),
                enabled: true,
            }],
            enabled: true,
            priority: 100,
        }
    }

    #[test]
    fn test_queue_state_from_items() {
        let items = vec![
            QueueItem { provider_id: "p1".to_owned(), model_id: "m1".to_owned() },
            QueueItem { provider_id: "p2".to_owned(), model_id: "m2".to_owned() },
        ];
        let state = QueueState::from_items(items);
        assert_eq!(state.active_idx, 0);
        assert_eq!(state.fail_counts.len(), 2);
        assert_eq!(state.exhausted_indices.len(), 0);
    }

    #[test]
    fn test_multi_queue_router_state() {
        let mut queues = HashMap::new();
        queues.insert("default".to_string(), Queue {
            id: "default".to_string(),
            name: "默认".to_string(),
            items: vec![QueueItem { provider_id: "p1".to_owned(), model_id: "m1".to_owned() }],
        });
        queues.insert("queue-2".to_string(), Queue {
            id: "queue-2".to_string(),
            name: "队列2".to_string(),
            items: vec![QueueItem { provider_id: "p2".to_owned(), model_id: "m2".to_owned() }],
        });

        let cfg = AppConfig {
            providers: vec![provider("p1", "m1"), provider("p2", "m2")],
            retry: RetryConfig { max_retries: 2, retry_delay_secs: 3 },
            queues,
            app_mapping: vec![],
            default_queue_id: "default".to_string(),
            queue: vec![],
            port: 7860,
        };

        let router = RouterState::from_config(&cfg);
        assert_eq!(router.queues.len(), 2);
        
        // 测试获取默认队列的活跃项
        let (p, m) = router.active_entry_for_queue("default").unwrap();
        assert_eq!(p.id, "p1");
        assert_eq!(m, "m1");
    }

    #[test]
    fn test_identify_queue_with_user_agent() {
        let mut queues = HashMap::new();
        queues.insert("default".to_string(), Queue {
            id: "default".to_string(),
            name: "默认".to_string(),
            items: vec![],
        });
        queues.insert("queue-claude".to_string(), Queue {
            id: "queue-claude".to_string(),
            name: "Claude".to_string(),
            items: vec![],
        });

        let cfg = AppConfig {
            providers: vec![],
            retry: RetryConfig::default(),
            queues,
            app_mapping: vec![AppMapping {
                app_id: "claude-code".to_string(),
                display_name: "Claude Code".to_string(),
                match_rules: vec![MatchRule {
                    rule_type: MatchRuleType::UserAgentContains,
                    pattern: "claude-code".to_string(),
                    header_name: None,
                }],
                queue_id: "queue-claude".to_string(),
            }],
            default_queue_id: "default".to_string(),
            queue: vec![],
            port: 7860,
        };

        let router = RouterState::from_config(&cfg);
        
        // 构造请求 headers
        let mut headers = axum::http::HeaderMap::new();
        headers.insert("user-agent", axum::http::HeaderValue::from_static("claude-code/1.0"));
        
        let queue_id = router.identify_queue(&headers, "/v1/messages");
        assert_eq!(queue_id, "queue-claude");
        
        // 未匹配的 User-Agent
        let mut headers2 = axum::http::HeaderMap::new();
        headers2.insert("user-agent", axum::http::HeaderValue::from_static("other-app/1.0"));
        let queue_id2 = router.identify_queue(&headers2, "/v1/messages");
        assert_eq!(queue_id2, "default");
    }
}
```

**Step 2: 运行测试**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo test`
Expected: 测试通过

**Step 3: Commit**

```bash
git add src-tauri/src/router.rs
git commit -m "test(router): add unit tests for multi-queue and identification"
```

---

### Task 19: 最终集成测试

**Objective:** 验证完整的多队列功能流程。

**Step 1: 启动 Tauri 开发环境**

Run: `cd /Volumes/T7/Code/freemodel-auto-router && pnpm tauri dev`

**Step 2: 测试完整流程**

1. 创建新队列 "Test Queue"
2. 选择新队列
3. 添加模型到新队列
4. 拖拽排序
5. 删除队列
6. 验证默认队列功能正常
7. 验证 Provider 切换通知正确显示队列 ID

**Step 3: 记录测试结果**

如有问题，修复后重新测试。

---

## 完成总结

完成所有任务后，运行最终验证：

```bash
# 1. Rust 编译和测试
cd src-tauri && cargo build && cargo test

# 2. TypeScript 类型检查
pnpm tsc --noEmit

# 3. 启动开发环境验证
pnpm tauri dev
```

---

## 文件变更总结

| 文件 | 变化类型 |
|---|---|
| `src-tauri/src/config.rs` | 新增 Queue, MatchRule, AppMapping 结构体；扩展 AppConfig |
| `src-tauri/src/router.rs` | 重构 RouterState 为多队列；新增 QueueState |
| `src-tauri/src/proxy.rs` | 使用队列识别逻辑 |
| `src-tauri/src/lib.rs` | 新增队列管理 commands；更新事件监听 |
| `src/types.ts` | 新增类型定义 |
| `src/api.ts` | 新增 API 函数 |
| `src/components/QueueManagerPanel.tsx` | 新建 |
| `src/components/QueueDetailPanel.tsx` | 新建 |
| `src/App.tsx` | 重构状态管理 |
| `src-tauri/Cargo.toml` | 新增 uuid 依赖 |