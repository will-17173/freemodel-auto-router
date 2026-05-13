# 多队列与应用映射功能设计

日期：2026-05-13

## 背景

当前 freemodel-auto-router 只有一个全局路由队列，所有应用（Claude Code、Codex、OpenClaw、Hermes）共享同一个模型切换序列。用户希望为不同应用分配不同的队列，实现更灵活的路由策略。

## 需求

1. **动态队列**：用户可自由创建、编辑、删除队列
2. **应用识别**：代理通过请求特征（如 User-Agent）自动识别来源应用
3. **队列分配**：将应用映射到特定队列
4. **默认队列**：未识别请求有兜底队列
5. **向后兼容**：自动迁移旧配置，无破坏性变更

## 方案选择

采用**方案 A：队列优先 + 应用映射表**。

核心设计理念：
- 队列与应用解耦，一个队列可被多个应用共用
- 灵活的匹配规则（User-Agent、自定义 header、路径等）
- 配置清晰，易于维护

## 配置结构设计

### 新增字段

```json
{
  "queues": {
    "default": {
      "id": "default",
      "name": "默认队列",
      "items": [{ "provider_id": "...", "model_id": "..." }]
    },
    "queue-claude": {
      "id": "queue-claude",
      "name": "Claude Code",
      "items": [...]
    },
    "queue-codex": {
      "id": "queue-codex",
      "name": "Codex",
      "items": [...]
    }
  },
  "app_mapping": [
    {
      "app_id": "claude-code",
      "display_name": "Claude Code",
      "match_rules": [
        { "type": "user_agent_contains", "pattern": "claude-code" }
      ],
      "queue_id": "queue-claude"
    },
    {
      "app_id": "codex",
      "display_name": "Codex",
      "match_rules": [
        { "type": "user_agent_contains", "pattern": "codex" }
      ],
      "queue_id": "queue-codex"
    }
  ],
  "default_queue_id": "default",
  "providers": [...],
  "retry": {...}
}
```

### 迁移策略

启动时检测旧配置中的 `queue` 字段：
- 如果存在，自动迁移到 `queues.default.items`
- 保留旧字段以兼容旧版本（写入时忽略）

## 代理处理逻辑

### 请求流程

```
请求进入 → 提取识别特征 → 匹配 app_mapping → 确定 queue_id
         ↓
         未匹配 → 使用 default_queue_id
         ↓
         从 RouterState 获取对应队列的活跃项
         ↓
         转发请求 + 注入 API Key + 重写 model 字段
```

### RouterState 变化

```rust
pub struct RouterState {
    pub queues: HashMap<String, QueueState>,
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    pub auth_map: HashMap<String, String>,
}

pub struct QueueState {
    pub active_idx: usize,
    pub items: Vec<QueueItem>,
    pub fail_counts: Vec<u32>,
    pub exhausted_indices: Vec<usize>,
}
```

### 应用识别函数

```rust
fn identify_app(headers: &HeaderMap, app_mapping: &[AppMapping]) -> Option<&str> {
    // 1. 检查自定义 header: x-app-id
    if let Some(app_id) = headers.get("x-app-id") {
        if let Some(mapping) = app_mapping.iter().find(|m| m.app_id == app_id.to_str().unwrap_or("")) {
            return Some(&mapping.queue_id);
        }
    }

    // 2. 检查 User-Agent
    let ua = headers.get("user-agent")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    for mapping in app_mapping {
        for rule in &mapping.match_rules {
            if rule.matches(ua, headers) {
                return Some(&mapping.queue_id);
            }
        }
    }

    None
}
```

### MatchRule 类型

```rust
pub enum MatchRuleType {
    UserAgentContains,
    HeaderEquals { header_name: String },
    PathContains,
}

pub struct MatchRule {
    pub type: MatchRuleType,
    pub pattern: String,
}

impl MatchRule {
    fn matches(&self, ua: &str, headers: &HeaderMap, path: &str) -> bool {
        match &self.type {
            MatchRuleType::UserAgentContains => ua.contains(&self.pattern),
            MatchRuleType::HeaderEquals { header_name } => {
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

## 前端 UI 设计

### 布局结构

```
┌─────────────────────────────────────────────────────┐
│  Provider Cards（现有）                              │
├─────────────────────────────────────────────────────┤
│  队列管理                                            │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐              │
│  │ 默认队列 │  │ Claude  │  │ Codex   │  [+新建]    │
│  │ (活跃)  │  │         │  │         │              │
│  └─────────┘  └─────────┘  └─────────┘              │
├─────────────────────────────────────────────────────┤
│  当前队列详情（点击队列卡片后显示）                    │
│  [1] OpenRouter/claude-3.5 [当前]                    │
│  [2] Groq/llama-3                                   │
├─────────────────────────────────────────────────────┤
│  应用映射                                            │
│  Claude Code → queue-claude                         │
│  Codex      → queue-codex                           │
│  未识别     → default                               │
├─────────────────────────────────────────────────────┤
│  代理日志（现有）                                    │
└─────────────────────────────────────────────────────┘
```

### 新增组件

1. **QueueManagerPanel**：队列管理面板
   - 显示所有队列卡片
   - 支持创建、编辑、删除队列
   - 点击队列卡片展开详情

2. **QueueDetailPanel**：队列详情视图
   - 显示队列内的模型排序（可拖拽）
   - 显示当前活跃项和已用尽项
   - 重置按钮

3. **AppMappingPanel**：应用映射配置
   - 配置识别规则
   - 分配队列

## Tauri Commands 设计

### 新增 Commands

```rust
// 队列管理
#[tauri::command]
fn create_queue(name: String) -> Result<Queue, String>;

#[tauri::command]
fn delete_queue(queue_id: String) -> Result<(), String>;

#[tauri::command]
fn update_queue(queue_id: String, name: String, items: Vec<QueueItem>) -> Result<(), String>;

#[tauri::command]
fn reorder_queue(queue_id: String, items: Vec<QueueItem>) -> Result<(), String>;

// 应用映射管理
#[tauri::command]
fn get_app_mappings() -> Vec<AppMapping>;

#[tauri::command]
fn update_app_mapping(app_id: String, queue_id: String) -> Result<(), String>;

#[tauri::command]
fn add_app_mapping(mapping: AppMapping) -> Result<(), String>;

#[tauri::command]
fn remove_app_mapping(app_id: String) -> Result<(), String>;

// 运行时状态
#[tauri::command]
fn get_queue_states() -> HashMap<String, QueueStateInfo>;

#[tauri::command]
fn reset_queue_exhausted(queue_id: String) -> Result<(), String>;
```

### 事件推送变化

现有 `provider-switched` 事件增加 `queue_id` 字段：
```json
{
  "event": "provider-switched",
  "payload": {
    "queue_id": "queue-claude",
    "provider_name": "OpenRouter",
    "model_id": "claude-3.5-sonnet"
  }
}
```

新增 `queue-exhausted` 事件：
```json
{
  "event": "queue-exhausted",
  "payload": {
    "queue_id": "queue-claude",
    "app_id": "claude-code"
  }
}
```

## TypeScript 类型定义

```typescript
export interface Queue {
  id: string;
  name: string;
  items: QueueItem[];
}

export interface MatchRule {
  type: "user_agent_contains" | "header_equals" | "path_contains";
  pattern: string;
  header_name?: string;  // 仅 header_equals 使用
}

export interface AppMapping {
  app_id: string;
  display_name: string;
  match_rules: MatchRule[];
  queue_id: string;
}

export interface AppConfig {
  queues: Record<string, Queue>;
  app_mapping: AppMapping[];
  default_queue_id: string;
  providers: Provider[];
  retry: RetryConfig;
  port: number;
}

export interface QueueStateInfo {
  active_idx: number;
  exhausted_indices: number[];
  items: QueueItem[];
}
```

## 实现步骤概要

1. **Rust 层**：
   - 新增 `Queue`、`AppMapping`、`MatchRule` 结构体
   - 重构 `RouterState` 为多队列管理
   - 新增应用识别逻辑
   - 新增 Tauri commands
   - 实现配置迁移逻辑

2. **前端层**：
   - 新增 TypeScript 类型定义
   - 新增 `QueueManagerPanel` 组件
   - 新增 `QueueDetailPanel` 组件
   - 新增 `AppMappingPanel` 组件
   - 修改 `App.tsx` 状态管理
   - 修改事件监听逻辑

3. **测试**：
   - 配置迁移单元测试
   - 应用识别逻辑测试
   - 多队列路由测试

## 待后续调整

- 实际应用（Claude Code、Codex、OpenClaw、Hermes）的请求特征需要实测后调整识别规则
- 可能需要支持更多 MatchRule 类型