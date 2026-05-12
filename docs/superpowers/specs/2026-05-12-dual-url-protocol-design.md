# 双 URL 协议支持设计

## 背景

当前 freemodel-auto-router 的 Provider 配置只有单一 `base_url` + `protocol` 字段，所有请求都按 Anthropic 协议转发。现已添加 Codex/Hermes/OpenClaw 支持，这三个应用需要 OpenAI 协议。

部分供应商（如 LongCat）有分离的 API URL：
- OpenAI 协议：`https://api.longcat.chat/openai`
- Anthropic 协议：`https://api.longcat.chat/anthropic`

部分供应商（如 OpenRouter）单一 URL 兼容两种协议。

## 目标

- Provider 配置支持双 URL（Anthropic + OpenAI）
- Claude Code 走 Anthropic 协议（`/anthropic` 路径前缀）
- Codex/Hermes/OpenClaw 走 OpenAI 协议（`/openai` 路径前缀）
- 支持双协议兼容供应商的简化配置（单一 URL）

## 协议分配

| 应用 | 协议 | 代理路径前缀 |
|---|---|---|
| Claude Code | Anthropic | `/anthropic` |
| Codex | OpenAI | `/openai` |
| Hermes | OpenAI | `/openai` |
| OpenClaw | OpenAI | `/openai` |

## 设计

### 1. 数据结构变更

#### Provider 结构体

**新增字段：**
- `anthropic_url: String` — Anthropic 协议专用 URL
- `openai_url: String` — OpenAI 协议专用 URL
- `dual_protocol: bool` — 是否双协议兼容，默认 false

**废弃字段：**
- `base_url` — 迁移后删除

**保留字段：**
- `protocol` — 描述 `anthropic_url` 的协议类型（决定认证头格式）

```rust
// config.rs
pub struct Provider {
    pub id: String,
    pub name: String,
    pub anthropic_url: String,
    pub openai_url: String,
    pub dual_protocol: bool,
    pub protocol: Protocol,
    pub auth_scheme: Option<AuthScheme>,
    pub api_key: String,
    pub models: Vec<Model>,
    pub enabled: bool,
    pub priority: u32,
}
```

#### TypeScript 类型定义

```typescript
// types.ts
export interface Provider {
  id: string;
  name: string;
  anthropic_url: string;
  openai_url: string;
  dual_protocol: boolean;
  protocol: Protocol;
  auth_scheme?: AuthScheme;
  api_key: string;
  models: Model[];
  enabled: boolean;
  priority: number;
}
```

#### 配置迁移

启动时自动检测旧格式（有 `base_url` 无 `anthropic_url`）：
- 将 `base_url` 复制到 `anthropic_url` 和 `openai_url`
- 写入新格式配置文件
- 删除 `base_url` 字段

### 2. 代理路由逻辑

#### 路径映射

| 入站路径 | 转发目标 URL | 协议处理 |
|---|---|---|
| `/anthropic/*` | `provider.anthropic_url` + 去掉 `/anthropic` 前缀 | 按 `provider.protocol` 处理认证头，添加 `anthropic-version` |
| `/openai/*` | `provider.openai_url` + 去掉 `/openai` 前缀 | Bearer 认证，不添加 `anthropic-version` |
| 其他路径 | 返回 400 错误 | 提示「路径必须以 /anthropic 或 /openai 开头」 |

#### 示例

**Anthropic 请求：**
```
入站: POST http://localhost:7860/anthropic/v1/messages
转发: POST https://api.longcat.chat/anthropic/v1/messages
```

**OpenAI 请求：**
```
入站: POST http://localhost:7860/openai/v1/chat/completions
转发: POST https://api.longcat.chat/openai/v1/chat/completions
```

#### 认证头处理

- **Anthropic 路径**：沿用现有逻辑，根据 `provider.protocol` + `auth_scheme` 决定
- **OpenAI 路径**：固定使用 `Authorization: Bearer <api_key>`，不添加 `anthropic-version`

### 3. 应用配置注入变更

#### Claude Code

`ANTHROPIC_BASE_URL` 添加路径前缀：

```rust
env_obj.insert(
    "ANTHROPIC_BASE_URL".to_string(),
    Value::String(format!("http://localhost:{}/anthropic", port)),
);
```

#### Codex

`config.toml` 的 `base_url` 改为指向本地代理：

```toml
model = "freemodel-auto"

[provider]
base_url = "http://localhost:7860/openai"
```

#### Hermes

`base_url` 改为指向本地代理：

```yaml
custom_providers:
  - name: "xxx"
    base_url: "http://localhost:7860/openai"
    api_key: "xxx"
    model: "freemodel-auto"
```

#### OpenClaw

`baseUrl` 改为指向本地代理：

```json
{
  "models": {
    "providers": {
      "xxx": {
        "baseUrl": "http://localhost:7860/openai",
        "apiKey": "xxx",
        "models": [...]
      }
    }
  }
}
```

### 4. 前端 UI 变更

#### Provider 配置表单

**URL 输入区域：**
- 默认显示两个独立输入框：Anthropic URL、OpenAI URL
- 顶部有 Checkbox：「双协议兼容（单一 URL）」
- 勾选后：
  - 只显示一个 URL 输入框
  - 值同步填充到 `anthropic_url` 和 `openai_url`
  - `dual_protocol = true`
- 取消勾选后：
  - 恢复两个输入框
  - `dual_protocol = false`

**Protocol 下拉框：**
- 保留，只影响 Anthropic URL 的认证方式
- 显示位置：Anthropic URL 输入框下方

#### 布局示意

```
┌─────────────────────────────────────┐
│ ☑ 双协议兼容（单一 URL）             │
├─────────────────────────────────────┤
│ 勾选时：                             │
│   URL: [https://openrouter.ai/api ] │
│                                      │
│ 未勾选时：                           │
│   Anthropic URL: [https://...      ]│
│   Protocol: [Anthropic ▼]           │
│   OpenAI URL:   [https://...      ] │
└─────────────────────────────────────┤
```

### 5. 边界情况与错误处理

#### 空 URL 处理

- `anthropic_url` 为空但收到 `/anthropic/*` 请求 → 503，「该供应商未配置 Anthropic URL」
- `openai_url` 为空但收到 `/openai/*` 请求 → 503，「该供应商未配置 OpenAI URL」

#### 路径前缀校验

- 不带 `/anthropic` 或 `/openai` 前缀的请求 → 400，「路径必须以 /anthropic 或 /openai 开头」

#### 配置迁移失败

- `base_url` 为空 → 设置空字符串，用户手动填写
- 迁移成功后删除 `base_url` 字段

## 实现范围

- `src-tauri/src/config.rs` — Provider 结构体变更 + 迁移逻辑
- `src-tauri/src/proxy.rs` — 路径前缀路由 + 认证头处理
- `src-tauri/src/claude_settings.rs` — 注入路径前缀
- `src-tauri/src/codex_settings.rs` — base_url 改为本地代理
- `src-tauri/src/hermes_settings.rs` — base_url 改为本地代理
- `src-tauri/src/openclaw_settings.rs` — baseUrl 改为本地代理
- `src-tauri/builtin_providers.json` — 更新内置供应商配置
- `src/types.ts` — TypeScript 类型定义
- `src/components/AddProviderModal.tsx` — UI 变更
- `src/components/ApiKeyModal.tsx` — 可能需要调整（如果涉及 URL 编辑）