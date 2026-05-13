# AI 工具配置注入方法

本文档说明 freemodel-auto-router 如何向 Claude Code、Codex、OpenClaw、Hermes 四个 AI 工具写入代理配置。

---

## Claude Code

**配置文件**: `~/.claude/settings.json`

**注入方式**: 通过 `env` 对象注入环境变量

### 注入内容

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:{port}/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "{auth_token}",
    "ANTHROPIC_MODEL": "freemodel-auto"
  }
}
```

- 移除顶层的 `apiBaseUrl`（避免冲突）
- 代理端点路径为 `/anthropic`（Anthropic 协议）
- 模型固定为 `freemodel-auto`，实际模型由代理层 rewrite

### 备份机制

首次注入时，在 `_fm_backup` 节点保存原始配置：

```json
{
  "_fm_backup": {
    "env": {
      "ANTHROPIC_BASE_URL": "...",
      "ANTHROPIC_AUTH_TOKEN": "...",
      "ANTHROPIC_MODEL": "..."
    },
    "apiBaseUrl": "..."
  }
}
```

备份的环境变量键：`ANTHROPIC_BASE_URL`、`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_MODEL`

### 撤销注入

- 从 `env` 中移除三个注入的环境变量
- 从 `_fm_backup` 恢复原始值
- 移除 `_fm_backup` 节点

### 核心函数

| 函数 | 作用 |
|---|---|
| `inject_proxy(port, auth_token)` | 注入代理配置 |
| `update_active(auth_token)` | 仅更新 `ANTHROPIC_AUTH_TOKEN`（队列切换时） |
| `remove_proxy()` | 撤销注入 |
| `restore_backup()` | 恢复备份（用户手动触发） |
| `has_backup()` | 检查是否存在备份节点 |
| `is_injected(port)` | 检查是否已注入 |

---

## Codex

**配置目录**: `~/.codex/`

**注入方式**: 写入 `auth.json` 和 `config.toml`

### auth.json

```json
{
  "OPENAI_API_KEY": "{api_key}"
}
```

### config.toml

```toml
model = "freemodel-auto"

[provider]
base_url = "http://localhost:{port}/openai"
```

- 代理端点路径为 `/openai`（OpenAI 协议）
- 模型固定为 `freemodel-auto`

### 撤销注入

- **auth.json**: 直接删除文件
- **config.toml**: 移除 `model = "freemodel-auto"` 行和 `[provider]` section，保留用户原有配置

### 注意事项

- **无备份机制**: Codex 的注入是覆盖式的
- 撤销时如果 `config.toml` 内容只剩空或 `model = "freemodel-auto"`，则删除整个文件
- **`remove()` 会删除整个 auth.json**: 如果用户原本有其他 auth 配置，撤销后会丢失

### 核心函数

| 函数 | 作用 |
|---|---|
| `inject(_provider_id, api_key, port)` | 写入两个配置文件（`_provider_id` 参数未使用） |
| `remove()` | 删除注入内容 |

---

## Hermes

**配置文件**: `~/.hermes/config.yaml`

**注入方式**: 修改 `model` 节点 + 添加 `custom_providers`

### model 节点注入

```yaml
model:
  default: "freemodel-auto"
  provider: "{provider_id}"
  base_url: "http://localhost:{port}/openai/v1"
  api_mode: "chat_completions"
```

- 代理端点路径为 `/openai/v1`（OpenAI 协议，带 `/v1` 后缀）
- `api_mode` 固定为 `chat_completions`

### custom_providers 条目

```yaml
custom_providers:
  - name: "{provider_id}"
    base_url: "http://localhost:{port}/openai/v1"
    api_key: "{api_key}"
    model: "freemodel-auto"
    models:
      freemodel-auto:
        context_length: 200000
```

- 在 `custom_providers` 数组中添加/更新一个条目
- `models` 子节点定义模型参数

### 备份机制

首次注入时，在 `_fm_backup` 节点保存原始 model 配置：

```yaml
_fm_backup:
  model:
    default: ...
    provider: ...
    base_url: ...
    api_mode: ...
```

备份的 model 字段：`default`、`provider`、`base_url`、`api_mode`

### 撤销注入

- 从 `custom_providers` 中移除匹配的 provider
- 从 `_fm_backup` 恢复原始 model 配置
- 移除 `_fm_backup` 节点

### 核心函数

| 函数 | 作用 |
|---| ---|
| `inject(provider_id, api_key, port)` | 修改 model + 添加 custom_providers |
| `remove(provider_id)` | 移除注入内容 |
| `is_injected(_provider_id)` | 检查 `model.default == "freemodel-auto"`（`_provider_id` 参数未使用） |

---

## OpenClaw

**配置文件**: `~/.openclaw/openclaw.json`

**注入方式**: 在 `models.providers` 下添加 provider 条目

### 注入内容

```json
{
  "models": {
    "providers": {
      "{provider_id}": {
        "baseUrl": "http://localhost:{port}/openai",
        "apiKey": "{api_key}",
        "models": [
          { "id": "model-1" },
          { "id": "model-2" }
        ]
      }
    }
  }
}
```

- 代理端点路径为 `/openai`（OpenAI 协议）
- `models` 数组来自当前队列项配置的模型列表

### 撤销注入

- 从 `models.providers` 中移除 `{provider_id}` 条目
- **无备份机制**: 仅添加/移除 provider 条目

### 核心函数

| 函数 | 作用 |
|---| ---|
| `inject(provider_id, api_key, models, port)` | 添加 provider 条目 |
| `remove(provider_id)` | 移除 provider 条目 |

---

## 代理端点路径对比

| 工具 | 协议 | 代理端点 | 说明 |
|---|---|---|---|
| Claude Code | Anthropic | `/anthropic` | 直接转发到 Anthropic API |
| Codex | OpenAI | `/openai` | 标准 OpenAI API 格式 |
| Hermes | OpenAI | `/openai/v1` | 带 `/v1` 后缀 |
| OpenClaw | OpenAI | `/openai` | 标准 OpenAI API 格式 |

---

## 文件写入安全机制

所有配置文件写入都采用原子写入模式：

1. 先写入 `.tmp` 临时文件
2. 调用 `fs::rename(&tmp, &path)` 原子替换

这避免了写入过程中应用崩溃导致配置文件损坏。

---

## Tauri Commands 映射

| Command | 模块 | 函数 |
|---|---|---|
| `inject_proxy_cmd` | claude_settings | `inject_proxy` |
| `update_active_cmd` | claude_settings | `update_active` |
| `remove_proxy_cmd` | claude_settings | `remove_proxy` |
| `restore_backup_cmd` | claude_settings | `restore_backup` |
| `has_backup_cmd` | claude_settings | `has_backup` |
| `is_injected_cmd` | claude_settings | `is_injected` |
| `inject_codex_cmd` | codex_settings | `inject` |
| `remove_codex_cmd` | codex_settings | `remove` |
| `inject_hermes_cmd` | hermes_settings | `inject` |
| `remove_hermes_cmd` | hermes_settings | `remove` |
| `is_hermes_injected_cmd` | hermes_settings | `is_injected` |
| `inject_openclaw_cmd` | openclaw_settings | `inject` |
| `remove_openclaw_cmd` | openclaw_settings | `remove` |

---

## 代码位置

| 模块 | 文件路径 |
|---|---|
| claude_settings | `src-tauri/src/claude_settings.rs` |
| codex_settings | `src-tauri/src/codex_settings.rs` |
| hermes_settings | `src-tauri/src/hermes_settings.rs` |
| openclaw_settings | `src-tauri/src/openclaw_settings.rs` |