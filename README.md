# freemodel-auto-router

> 一个 Tauri 桌面应用，作为 Claude Code 的 AI 供应商路由代理 —— 在多个免费模型供应商之间自动切换，避免单个供应商触发限流后中断会话。

## 它解决的问题

不少免费 / 低价 AI 模型供应商都提供 OpenAI 或 Anthropic 兼容的 API，但它们普遍存在：

- 频繁返回 `429 Too Many Requests` 或 `503 Service Unavailable`
- 单个 Key 配额有限，跑一会就要换
- 不同供应商的 base_url、鉴权头、可用模型都不一样

freemodel-auto-router 在本地启动一个 HTTP 代理（默认端口 `7860`），把 Claude Code 的所有请求代理到当前活跃的供应商，遇到 429 / 503 自动切换到队列中的下一个，全程无需手动干预。

## 工作原理

```
Claude Code  ──►  http://localhost:7860 (axum proxy)
                         │
                         ▼
                  RouterState（队列 + 失败计数）
                         │
                         ▼
                  转发到 Provider.base_url
                  自动注入 API Key
                  重写请求体中的 model 字段
                         │
                429/503  │
                  ▼      ▼
            record_failure() 超过阈值
                  │
                  ▼
            切换队列下一项 + 系统通知
```

- **队列首项即活跃路由**：`config.queue[0]` 是当前正在使用的 `(provider_id, model_id)`
- **协议自动适配**：`OpenAI` 协议用 `Authorization: Bearer <key>`；`Anthropic` 协议用 `x-api-key` + `anthropic-version: 2023-06-01`
- **model 字段重写**：客户端传什么 model 名都不重要，代理会改写为队列项指定的 `model_id`
- **零侵入接入 Claude Code**：应用启动时自动往 `~/.claude/settings.json` 注入 `apiBaseUrl: "http://localhost:7860"`，退出时清理

## 功能特性

- 黑白编辑风的供应商卡片网格 UI（Figma 风格设计系统，见 `DESIGN.md`）
- `@dnd-kit` 拖拽排序路由队列
- OpenAI / Anthropic 双协议支持，可选 `auth_scheme`（Bearer / ApiKey）
- 重试次数、重试间隔可配置
- 可配置代理端口（默认 7860），修改后重启生效
- 实时代理日志面板，自动过滤敏感字段
- 添加自定义供应商 Modal
- 关闭窗口时收起到系统托盘，进程退出时自动清理 Claude Code 配置
- 供应商切换时弹出系统通知（`tauri-plugin-notification`）

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

1. 启动应用，应用会自动把 `apiBaseUrl: "http://localhost:7860"` 写入 `~/.claude/settings.json`
2. 在主界面添加供应商：填写名称、`base_url`、协议（OpenAI / Anthropic）、API Key、可用模型列表
3. 把要使用的 `(供应商, 模型)` 拖入路由队列，队列顶部即当前活跃项
4. 在终端正常使用 `claude` —— 请求会被透明转发到队列首项；触发 429 / 503 后自动切换到下一项

## 配置文件

`config.json`（位于项目根目录）

```json
{
  "providers": [
    {
      "id": "openrouter",
      "name": "OpenRouter",
      "base_url": "https://openrouter.ai/api",
      "protocol": "Anthropic",
      "auth_scheme": "Bearer",
      "api_key": "sk-or-...",
      "models": [
        { "id": "nvidia/nemotron-3-super", "name": "NVIDIA: Nemotron 3 Super", "enabled": true },
        { "id": "baidu/cobuddy", "name": "Baidu Qianfan: CoBuddy", "enabled": false },
        { "id": "minimax/minimax-m2.5", "name": "MiniMax: MiniMax M2.5", "enabled": false }
      ],
      "enabled": true,
      "priority": 100
    }
  ],
  "retry": {
    "max_retries": 2,
    "retry_delay_secs": 3
  },
  "queue": [
    { "provider_id": "openrouter", "model_id": "nvidia/nemotron-3-super" }
  ],
  "port": 7860
}
```

前端任何变更都会即时调用 `save_config_cmd` 持久化（乐观更新，无"保存"按钮）。

## 技术栈

| 层 | 选型 |
|---|---|
| 桌面壳 | Tauri 2 |
| 前端 | React 19 + TypeScript + Tailwind v4 + Vite 7 |
| 拖拽 | `@dnd-kit/core` + `@dnd-kit/sortable` |
| 后端 HTTP | axum 0.7 + hyper 1 + reqwest 0.12 (rustls) |
| 异步运行时 | tokio |
| 通知 | tauri-plugin-notification |

## 项目结构

```
src-tauri/src/
  ├── lib.rs              # Tauri 入口，注册命令，启动代理
  ├── config.rs           # AppConfig / Provider / QueueItem / AuthScheme 结构与读写
  ├── router.rs           # RouterState：队列与失败计数，record_failure 切换逻辑
  ├── proxy.rs            # axum HTTP 代理，rewrite_model_field，重试 429/503/500/502/504
  ├── proxy_log.rs        # ProxyLogStore：环形缓冲日志，敏感字段过滤
  └── claude_settings.rs  # 原子写入 ~/.claude/settings.json，env 三键备份恢复

src/
  ├── App.tsx                       # 唯一状态容器
  ├── api.ts                        # invoke get_config / save_config_cmd / get_proxy_logs
  ├── types.ts                      # 与 Rust 结构体一一对应
  └── components/
      ├── ProviderCard.tsx          # 供应商卡片
      ├── QueuePanel.tsx            # 路由队列（拖拽排序）
      ├── AddProviderModal.tsx      # 添加自定义供应商
      ├── ProxyLogPanel.tsx         # 代理日志面板
      ├── SettingsModal.tsx         # 重试/端口设置
      └── ApiKeyModal.tsx           # API Key 输入
```

更详细的架构说明见 `CLAUDE.md`，UI 设计系统见 `DESIGN.md`。

## 设计约束

- **队列第 0 项 = 活跃路由**：所有切换逻辑都基于这一点
- **配置即真相**：前端不维护额外的"草稿"状态，每次变更都即时落盘
- **shadow-light**：UI 用色块而非阴影做层级；CTA 一律是 pill，按钮永远不出现直角

## 许可

私有项目，暂未开源协议。
