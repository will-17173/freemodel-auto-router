# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**freemodel-auto-router** 是一个 Tauri 桌面应用，作为 Claude Code / Codex / Hermes / OpenClaw 的 AI 供应商路由代理。用户配置多个免费模型供应商，应用在本地启动 HTTP 代理服务（默认端口 7860），自动将请求转发到当前活跃供应商，遇到 429/503 时自动切换队列下一项。

## 开发命令

```bash
pnpm install          # 安装依赖
pnpm dev              # 前端开发模式（仅 Vite）
pnpm tauri dev        # 完整 Tauri 开发环境
pnpm tauri build      # 构建生产版本
pnpm tsc --noEmit     # TypeScript 类型检查
```

## 架构

### 数据流

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

### 后端模块（`src-tauri/src/`）

| 文件 | 职责 |
|---|---|
| `config.rs` | `AppConfig` / `Provider` / `Queue` / `QueueItem` / `AppMapping` 结构体；多队列支持；读写 `config.json` |
| `router.rs` | `RouterState` — 维护每个队列的 `active_idx` 和 `exhausted_indices`；`record_failure()` 切换逻辑 |
| `proxy.rs` | axum HTTP 代理；`rewrite_model_field()` 替换请求体中的 `model` 字段；支持 `/anthropic` 和 `/openai` 端点 |
| `proxy_log.rs` | `ProxyLogStore` — 环形缓冲日志（默认 200），自动过滤敏感字段 |
| `claude_settings.rs` | 注入 `~/.claude/settings.json` 的 env 三键（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL`）；备份恢复机制 |
| `codex_settings.rs` | 注入 `~/.codex/auth.json` + `config.toml` |
| `hermes_settings.rs` | 注入 `~/.hermes/config.yaml` 的 `model` 节点 + `custom_providers` |
| `openclaw_settings.rs` | 注入 `~/.openclaw/openclaw.json` 的 `models.providers` |
| `auth.rs` | 管理 `~/.config/freemodel/auth.json`（provider_id → API Key 映射） |
| `lib.rs` | Tauri 入口；注册 commands；启动 proxy；系统托盘 |

### 前端（`src/`）

- **`App.tsx`** — 唯一状态容器；管理多页面路由、队列状态、应用注入状态
- **`api.ts`** — 封装所有 Tauri invoke 命令
- **`types.ts`** — TypeScript 类型（与 Rust 结构体对应）
- **`components/`** — 多页面结构：
  - `Sidebar.tsx` — 左侧导航（providers / queue / logs / settings）
  - `TopBar.tsx` — 顶部状态栏 + 应用注入开关（CC / Codex / Hermes / OpenClaw）
  - `ProvidersPage.tsx` — 供应商卡片网格 + DraftQueuePanel
  - `QueuePage.tsx` — 多队列管理（拖拽排序）
  - `LogsPage.tsx` — 代理日志
  - `SettingsPage.tsx` — 重试/端口配置
  - `AddProviderModal.tsx` / `AddModelModal.tsx` / `ApiKeyModal.tsx` — 输入弹窗

### 关键设计约束

- **多队列系统**：`config.queues` 是 `HashMap<String, Queue>`；`default_queue_id` 指定活跃队列
- **队列首项即活跃**：`queues[default_queue_id].items[active_idx]` 是当前路由
- **双协议支持**：`Provider` 有 `anthropic_url` + `openai_url` + `dual_protocol` 字段
- **四种应用注入**：Claude Code（env）、Codex（auth.json + config.toml）、Hermes（config.yaml）、OpenClaw（openclaw.json）
- **配置即真相**：前端每次变更即时调用 `save_config_cmd`
- **端口可配置**：修改后重启生效（`restartProxy` 命令）
- **日志敏感过滤**：`authorization` / `api-key` / `token` → `[redacted]`

## 深入文档

- [配置注入方法](docs/config-injection.md) — 四种工具的配置注入机制细节

## UI 设计系统

见 `DESIGN.md`。CSS 变量前缀 `--fm-`，class 前缀 `fm-`。色块（`fm-block-lime` 等）用于状态区分。