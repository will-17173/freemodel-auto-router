# 配置文件在线更新功能设计

## 概述

将供应商配置与其他用户配置分离，支持从线上自动同步预设供应商信息，同时保留用户自定义数据。

## 文件结构

```
/Volumes/T7/Code/freemodel-auto-router/
├── config.json              # 用户配置（queues、retry、app_mapping、port 等）
├── providers.json           # 预设供应商（从线上同步）
├── custom_providers.json    # 用户自定义数据
└── src-tauri/builtin_providers.json  # 内置默认（首次启动无本地文件时使用）
```

## 线上地址

```
https://www.coding-plan.xyz/freemodel-auto-router/v1/providers.json
```

格式版本随应用版本升级：v1 → v2 → v3...

## 文件格式

### providers.json（线上同步）

预设供应商列表，从线上自动同步，用户不可直接编辑。

```json
{
  "version": 1747123200,
  "format_version": 1,
  "providers": [
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "anthropic_url": "https://openrouter.ai/api",
      "openai_url": "https://openrouter.ai/api",
      "dual_protocol": true,
      "protocol": "Anthropic",
      "auth_scheme": "Bearer",
      "models": [
        { "id": "nvidia/nemotron-3-super", "name": "NVIDIA: Nemotron 3 Super", "is_custom": false }
      ],
      "priority": 100,
      "is_custom": false
    }
  ]
}
```

字段说明：
- `version`: 时间戳，用于判断是否需要更新
- `format_version`: 格式版本号，决定请求哪个 URL（v1/v2/v3...）
- `providers`: 预设供应商数组，所有供应商 `is_custom: false`

### custom_providers.json（用户数据）

用户自定义数据，完全本地保存，线上同步时永不覆盖。

```json
{
  "custom_providers": [
    {
      "id": "my-provider",
      "name": "My Provider",
      "anthropic_url": "...",
      "openai_url": "...",
      "dual_protocol": false,
      "protocol": "Anthropic",
      "auth_scheme": "Bearer",
      "models": [
        { "id": "my-model", "name": "My Model", "is_custom": true }
      ],
      "priority": 50,
      "is_custom": true
    }
  ],
  "custom_models_in_builtin": {
    "openrouter": [
      { "id": "my-custom-model", "name": "My Custom Model", "is_custom": true }
    ],
    "modelscope": [
      { "id": "another-model", "name": "Another Model", "is_custom": true }
    ]
  }
}
```

字段说明：
- `custom_providers`: 用户完全自定义的供应商数组
- `custom_models_in_builtin`: 用户在预设供应商里添加的自定义模型，按 provider_id 分组

### config.json（用户配置）

移除 providers 字段，只保留用户配置。

```json
{
  "retry": { "max_retries": 2, "retry_delay_secs": 3 },
  "queues": { ... },
  "app_mapping": [],
  "default_queue_id": "default",
  "port": 7860
}
```

## 启动流程

```
1. 加载本地 providers.json（不存在则用 builtin_providers.json）
2. 加载 custom_providers.json（不存在则为空对象）
3. 异步检查线上版本
   - 请求 https://www.coding-plan.xyz/freemodel-auto-router/v{CURRENT_FORMAT_VERSION}/providers.json
   - 仅获取 version 字段进行比较（轻量请求）
4. 若线上 version > 本地 version：
   - 下载完整数据覆盖 providers.json
5. 合并数据返回给前端：
   - 预设供应商 models += custom_models_in_builtin[provider_id]
   - providers = 预设供应商 + custom_providers
```

## 更新逻辑

### 供应商层面

| 来源 | is_custom | 更新行为 |
|---|---|---|
| providers.json | false | 完全从线上同步，覆盖本地 |
| custom_providers.json | true | 完全保留，永不覆盖 |

### 模型层面

| 来源 | is_custom | 更新行为 |
|---|---|---|
| providers.json providers[].models | false | 完全从线上同步 |
| custom_models_in_builtin[provider_id] | true | 保留，追加到对应预设供应商的 models |
| custom_providers[].models | true | 保留（属于用户自定义供应商） |

### 合并示例

线上 providers.json:
```json
{
  "providers": [
    { "id": "openrouter", "models": [{ "id": "model-a", "is_custom": false }] }
  ]
}
```

本地 custom_providers.json:
```json
{
  "custom_models_in_builtin": {
    "openrouter": [{ "id": "my-model", "is_custom": true }]
  }
}
```

合并后返回给前端:
```json
[
  { "id": "openrouter", "models": [
    { "id": "model-a", "is_custom": false },
    { "id": "my-model", "is_custom": true }
  ]}
]
```

## 格式版本升级机制

应用内置常量 `CURRENT_FORMAT_VERSION`：

```rust
const CURRENT_FORMAT_VERSION: u32 = 1;
```

请求 URL 模板：
```
https://www.coding-plan.xyz/freemodel-auto-router/v{CURRENT_FORMAT_VERSION}/providers.json
```

升级流程：
1. 应用发布新版本，格式变更时更新 `CURRENT_FORMAT_VERSION = 2`
2. 新版本应用请求 `v2/providers.json`
3. 旧版本应用继续请求 `v1/providers.json`（向后兼容）

线上维护多版本文件：
- v1/providers.json — 旧格式，供旧版本应用使用
- v2/providers.json — 新格式，供新版本应用使用

## 错误处理

| 场景 | 行为 |
|---|---|
| 网络请求失败 | 使用本地 providers.json，不阻塞启动 |
| 本地 providers.json 不存在 | 使用内置 builtin_providers.json |
| 本地 custom_providers.json 不存在 | 初始化为空对象 `{}` |
| 线上 JSON 解析失败 | 使用本地数据，记录警告日志 |
| 本地 JSON 解析失败 | 使用内置默认，记录错误日志 |

## Rust 后端实现

### 新增模块

`src-tauri/src/providers.rs`:
- `ProvidersConfig` 结构体（对应 providers.json）
- `CustomProvidersConfig` 结构体（对应 custom_providers.json）
- `load_providers()` — 加载本地 providers.json
- `load_custom_providers()` — 加载本地 custom_providers.json
- `sync_providers()` — 线上同步逻辑
- `merge_providers()` — 合并预设 + 用户自定义
- `get_all_providers()` — 返回合并后的完整列表

### 修改模块

`src-tauri/src/config.rs`:
- 移除 `providers` 字段
- 移除 `load_builtin_providers()` 相关逻辑
- `AppConfig` 只保留用户配置

`src-tauri/src/lib.rs`:
- 启动时调用 `sync_providers()`
- 注册新命令 `get_providers_cmd`

### Tauri 命令

```rust
#[tauri::command]
fn get_providers_cmd() -> Result<Vec<Provider>, String> {
    // 返回合并后的完整供应商列表
}

#[tauri::command]
fn save_custom_provider_cmd(provider: Provider) -> Result<(), String> {
    // 保存用户自定义供应商
}

#[tauri::command]
fn add_custom_model_to_builtin_cmd(provider_id: String, model: Model) -> Result<(), String> {
    // 向预设供应商添加自定义模型
}

#[tauri::command]
fn delete_custom_model_from_builtin_cmd(provider_id: String, model_id: String) -> Result<(), String> {
    // 从预设供应商删除自定义模型
}
```

## 前端改动

### api.ts

新增调用：
- `getProviders()` — 获取合并后的供应商列表
- `saveCustomProvider(provider)` — 保存自定义供应商
- `addCustomModelToBuiltin(providerId, model)` — 添加自定义模型到预设供应商

### ProvidersPage.tsx

- 调用 `getProviders()` 获取数据
- 区分预设供应商和自定义供应商的 UI 展示（预设供应商可标识"预设"标签）
- 预设供应商的编辑功能限制（只能添加/删除自定义模型）

## 迁移策略

首次运行新版本时：
1. 检测旧 config.json 是否包含 providers 字段
2. 若有，分离数据：
   - `is_custom: false` 的供应商 → providers.json
   - `is_custom: true` 的供应商 → custom_providers.json
   - 预设供应商里 `is_custom: true` 的模型 → custom_models_in_builtin
3. 移除 config.json 的 providers 字段
4. 保存新格式文件

迁移代码：
```rust
fn migrate_legacy_config() {
    let old_config = load_old_config();
    if old_config.providers.is_some() {
        // 分离逻辑...
        save_providers_config(...);
        save_custom_providers_config(...);
        save_new_config(...);  // 不含 providers
    }
}
```

## 数据流图

```
启动
  │
  ├─→ 加载 providers.json (本地或内置)
  │
  ├─→ 加载 custom_providers.json
  │
  ├─→ 异步检查线上版本
  │     │
  │     ├─→ version 更新? → 下载覆盖 providers.json
  │     │
  │     └─→ 失败? → 使用本地数据
  │
  └─→ 合并数据 → 返回给前端
        │
        ├─→ 预设供应商 + custom_models_in_builtin
        │
        └─→ + custom_providers
```