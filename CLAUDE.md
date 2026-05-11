# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**freemodel-auto-router** 是一个 Tauri 桌面应用，作为 Claude Code 的 AI 供应商路由代理。用户配置多个免费模型供应商（填入 API Key），应用在本地启动 HTTP 代理服务（端口 7860），自动将 Claude Code 的请求转发到当前活跃供应商，当某个供应商返回 429/503 时自动切换队列中的下一个。

## 开发命令

```bash
# 安装依赖
pnpm install

# 前端开发模式（仅 Vite，无 Tauri）
pnpm dev

# 启动完整 Tauri 开发环境（前端 + Rust 后端）
pnpm tauri dev

# 构建生产版本
pnpm tauri build

# 仅构建前端
pnpm build

# TypeScript 类型检查
pnpm tsc --noEmit
```

## 架构

### 数据流

```
Claude Code → http://localhost:7860 (axum proxy)
                    ↓
             RouterState (RwLock)
             读取 active_entry() → 当前队列第一项
                    ↓
             转发到 Provider.base_url
             (自动注入 API Key，重写请求体中的 model 字段)
                    ↓
             429/503 → record_failure() → 切换下一队列项
             → 发送 watch channel 消息
             → Tauri emit "provider-switched" → 前端系统通知
```

### 启动流程（`src-tauri/src/lib.rs`）

1. 从 `~/.config/freemodel/config.json` 加载配置
2. 构建 `RouterState`（持有队列和失败计数）
3. 异步启动 axum 代理服务器（`proxy::start_proxy`）
4. 调用 `claude_settings::inject_proxy(7860)` — 往 `~/.claude/settings.json` 写入 `apiBaseUrl: "http://localhost:7860"`
5. 注册 watch channel 监听供应商切换事件，通过 Tauri Event 推送到前端
6. 关闭窗口时隐藏到系统托盘（不退出）；进程退出时调用 `remove_proxy()` 清理 `~/.claude/settings.json`

### 后端模块（`src-tauri/src/`）

| 文件 | 职责 |
|---|---|
| `config.rs` | `AppConfig` / `Provider` / `QueueItem` 结构体，读写 `~/.config/freemodel/config.json` |
| `router.rs` | `RouterState` — 维护 `active_idx` 和 `fail_counts`；`record_failure()` 超过 `max_retries` 后自增索引 |
| `proxy.rs` | axum HTTP 代理；`rewrite_model_field()` 替换请求体中的 `model` 字段；重试状态码：429、503 |
| `claude_settings.rs` | 原子写入 `~/.claude/settings.json`（先写 `.tmp` 再 rename），注入/移除 `apiBaseUrl` |
| `lib.rs` | Tauri 应用入口；注册两个 commands：`get_config`、`save_config_cmd` |

### 前端（`src/`）

- **`types.ts`** — 与后端 Rust 结构体一一对应的 TypeScript 类型（`Protocol` 为 `"OpenAI" | "Anthropic"`）
- **`api.ts`**（从 App.tsx import）— 封装 `invoke("get_config")` / `invoke("save_config_cmd")`
- **`App.tsx`** — 唯一状态容器，通过 `updateAndSave()` 同步更新本地状态和持久化配置
- **`components/ProviderCard.tsx`** — 供应商卡片，显示状态/模型列表，触发加入队列或配置 API Key
- **`components/QueuePanel.tsx`** — 路由队列，支持 `@dnd-kit` 拖拽排序
- **`components/SettingsModal.tsx`** — 重试次数/间隔设置
- **`components/ApiKeyModal.tsx`** — 供应商 API Key 输入

### 关键设计约束

- **队列第 0 项是活跃路由**：`config.queue[0]` 即当前使用的 `(provider_id, model_id)`，前端展示时以此为准
- **协议差异**：`OpenAI` 协议用 `Authorization: Bearer <key>`；`Anthropic` 协议用 `x-api-key` + `anthropic-version: 2023-06-01` 头
- **model 字段重写**：代理会将请求体中的 `model` 字段覆盖为队列项指定的 `model_id`，客户端传什么值无关紧要
- **配置持久化**：前端每次变更都即时调用 `save_config_cmd`，无"保存"按钮（乐观更新）

## UI 设计系统

前端采用 Figma 风格的黑白编辑风设计系统（见 `DESIGN.md`），CSS 变量前缀 `--fm-`，自定义 class 前缀 `fm-`。色块使用 `fm-block-lime`（活跃状态）等 CSS class。Tailwind v4 用于布局和间距。
