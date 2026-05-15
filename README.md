# freemodel-auto-router

> 一个 Tauri 桌面应用，作为 Claude Code / Codex / Hermes / OpenClaw 的 AI 供应商路由代理 —— 在多个免费模型供应商之间自动切换，避免单个供应商触发限流后中断会话。

## 它解决的问题

不少免费 / 低价 AI 模型供应商都提供 OpenAI 或 Anthropic 兼容的 API，但它们普遍存在：

- 频繁返回 `429 Too Many Requests` 或 `503 Service Unavailable`
- 单个 Key 配额有限，跑一会就要换
- 不同供应商的 base_url、鉴权头、可用模型都不一样

freemodel-auto-router 在本地启动一个 HTTP 代理（默认端口 `7860`），把客户端的请求代理到当前活跃的供应商，遇到 429 / 503 自动切换到队列中的下一个，全程无需手动干预。

## 支持的客户端

| 客户端 | 配置注入方式 | 端点 |
|---|---|---|
| **Claude Code** | `~/.claude/settings.json` 环境变量注入 | `/anthropic` |
| **Codex** | `~/.codex/auth.json` + `config.toml` | `/openai` |
| **Hermes** | `~/.hermes/config.yaml` 自定义供应商配置 | `/openai` |
| **OpenClaw** | `~/.openclaw/openclaw.json` providers 配置 | `/openai` |

应用启动时可选注入各客户端配置，退出时自动清理恢复原始配置。

## 工作原理

```
Claude Code / Codex / Hermes / OpenClaw
           ↓ http://localhost:{port}/anthropic 或 /openai
      axum proxy (proxy.rs)
           ↓
      RouterState (RwLock)
      读取 queues[default_queue_id].items[active_idx]
           ↓
      转发到 Provider 的 anthropic_url 或 openai_url
      自动注入 API Key，重写 model 字段
           ↓
      429/503 → record_failure() → 切换下一队列项
      → watch channel → Tauri emit "provider-switched"
```

- **多队列系统**：支持创建多个队列，通过 `default_queue_id` 指定活跃队列
- **队列首项即活跃路由**：`queues[default_queue_id].items[active_idx]` 是当前正在使用的 `(provider_id, model_id)`
- **双协议端点**：`/anthropic` 端点转发到 `anthropic_url`，`/openai` 端点转发到 `openai_url`
- **协议自动适配**：`OpenAI` 协议用 `Authorization: Bearer <key>`；`Anthropic` 协议用 `x-api-key` + `anthropic-version: 2023-06-01`
- **model 字段重写**：客户端传什么 model 名都不重要，代理会改写为队列项指定的 `model_id`

## 功能特性

- 黑白编辑风的供应商卡片网格 UI（Figma 风格设计系统，见 `DESIGN.md`）
- **多队列管理**：创建/编辑/删除队列，通过标签栏快速切换
- `@dnd-kit` 拖拽排序路由队列项
- OpenAI / Anthropic 双协议支持，供应商可配置独立的 `anthropic_url` 和 `openai_url`
- 重试次数、重试间隔可配置
- 可配置代理端口（默认 7860），修改后重启生效
- 实时代理日志面板，自动过滤敏感字段（`authorization` / `api-key` / `token` → `[redacted]`）
- 添加自定义供应商 / 添加模型 Modal
- 关闭窗口时收起到系统托盘，进程退出时自动清理客户端配置
- 供应商切换时弹出系统通知（`tauri-plugin-notification`）
- **应用映射规则**：按 User-Agent / Header / Path 自动路由到指定队列

## 安装与运行

### 环境要求

- Node.js 18+ 和 pnpm
- Rust 工具链（Tauri 2 要求）
- macOS / Windows / Linux

### 开发

```bash
# 安装依赖
pnpm install

# 启动 Tauri 开发环境（前端 + Rust 后端）
pnpm tauri dev

# 仅启动前端 Vite（不带 Tauri 桌面壳）
pnpm dev

# TypeScript 类型检查
pnpm tsc --noEmit
```

### 构建

```bash
# 构建生产版本（生成桌面安装包）
pnpm tauri build

# 仅构建前端
pnpm build
```

## 使用流程

1. 启动应用，在顶部状态栏点击对应客户端开关注入配置
2. 在供应商页面添加供应商：填写名称、`anthropic_url` / `openai_url`、协议、API Key、可用模型列表
3. 创建队列，把要使用的 `(供应商, 模型)` 拖入队列，队列顶部即当前活跃项
4. 正常使用客户端 —— 请求会被透明转发到队列首项；触发 429 / 503 后自动切换到下一项

## 配置文件

配置存储在 `~/.config/freemodel/config.json`：

```json
{
  "retry": {
    "max_retries": 2,
    "retry_delay_secs": 3
  },
  "queues": {
    "default": {
      "id": "default",
      "name": "默认队列",
      "items": [
        { "provider_id": "openrouter", "model_id": "anthropic/claude-3.5-sonnet" }
      ]
    }
  },
  "default_queue_id": "default",
  "app_mapping": [],
  "port": 7860
}
```

API Key 存储在 `~/.config/freemodel/auth.json`（provider_id → API Key 映射），与配置分离便于多设备同步。

前端任何变更都会即时调用 `save_config_cmd` 持久化（乐观更新，无"保存"按钮）。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Tauri 2 |
| 前端 | React 19 + TypeScript + Tailwind v4 + Vite 7 |
| 拖拽 | `@dnd-kit/core` + `@dnd-kit/sortable` |
| UI 组件 | Radix UI + shadcn/ui 风格 |
| 后端 HTTP | axum 0.7 + hyper 1 + reqwest 0.12 (rustls) |
| 异步运行时 | tokio |
| 通知 | tauri-plugin-notification |

## 项目结构

### 后端（`src-tauri/src/`）

| 文件 | 职责 |
|---|---|
| `lib.rs` | Tauri 入口；注册 commands；启动 proxy；系统托盘 |
| `config.rs` | `AppConfig` / `Provider` / `Queue` / `QueueItem` / `AppMapping` 结构体；多队列支持；读写 `config.json` |
| `router.rs` | `RouterState` — 维护每个队列的 `active_idx` 和 `exhausted_indices`；`record_failure()` 切换逻辑 |
| `proxy.rs` | axum HTTP 代理；`rewrite_model_field()` 替换请求体中的 `model` 字段；支持 `/anthropic` 和 `/openai` 端点 |
| `proxy_log.rs` | `ProxyLogStore` — 环形缓冲日志（默认 200），自动过滤敏感字段 |
| `claude_settings.rs` | 注入 `~/.claude/settings.json` 的 env 三键；备份恢复机制 |
| `codex_settings.rs` | 注入 `~/.codex/auth.json` + `config.toml` |
| `hermes_settings.rs` | 注入 `~/.hermes/config.yaml` 的 `model` 节点 + `custom_providers` |
| `openclaw_settings.rs` | 注入 `~/.openclaw/openclaw.json` 的 `models.providers` |
| `auth.rs` | 管理 `~/.config/freemodel/auth.json`（provider_id → API Key 映射） |
| `app_detection.rs` | 基于 User-Agent / Header 检测客户端类型 |
| `providers.rs` | 预置供应商列表（OpenRouter、Anthropic 等） |

### 前端（`src/`）

| 文件/目录 | 职责 |
|---|---|
| `App.tsx` | 唯一状态容器；管理多页面路由、队列编辑状态、应用注入状态 |
| `api.ts` | 封装所有 Tauri invoke 命令 |
| `types.ts` | TypeScript 类型（与 Rust 结构体对应） |
| `components/` | 多页面结构 |
| `Sidebar.tsx` | 左侧导航（providers / logs / settings） |
| `TopBar.tsx` | 顶部状态栏 + 应用注入开关（CC / Codex / Hermes / OpenClaw） |
| `ProvidersPage.tsx` | 供应商卡片网格 + 队列标签栏 + QueueEditPanel |
| `QueueTabs.tsx` | 队列标签栏组件 |
| `QueueEditPanel.tsx` | 队列编辑面板（新建/编辑模式） |
| `LogsPage.tsx` | 代理日志 |
| `SettingsPage.tsx` | 重试/端口配置 |
| `AddProviderModal.tsx` / `AddModelModal.tsx` / `ApiKeyModal.tsx` | 输入弹窗 |
| `ui/` | 基础 UI 组件（button、dialog、scroll-area 等） |

更详细的架构说明见 `CLAUDE.md`，UI 设计系统见 `DESIGN.md`。

## 设计约束

- **多队列系统**：`config.queues` 是 `HashMap<String, Queue>`；`default_queue_id` 指定活跃队列
- **队列首项即活跃**：`queues[default_queue_id].items[active_idx]` 是当前路由
- **双协议支持**：`Provider` 有 `anthropic_url` + `openai_url` + `dual_protocol` 字段
- **四种应用注入**：Claude Code（env）、Codex（auth.json + config.toml）、Hermes（config.yaml）、OpenClaw（openclaw.json）
- **配置即真相**：前端不维护额外的"草稿"状态，每次变更都即时落盘
- **shadow-light**：UI 用色块而非阴影做层级；CTA 一律是 pill，按钮永远不出现直角

## 许可

私有项目，暂未开源协议。