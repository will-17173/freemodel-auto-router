# freemodel-auto-router 设计文档

**日期**：2026-05-11  
**技术栈**：Tauri 2 + React 19 + TypeScript + Rust  
**目标**：为 Claude Code 提供多模型供应商自动路由切换工具

---

## 一、项目概述

freemodel-auto-router 是一个桌面应用，在本地运行一个 HTTP 代理服务，Claude Code 将请求发往该代理，代理负责转发到当前活跃的模型供应商。当供应商出现错误时，自动按优先级切换到下一个供应商并通过系统通知告知用户。

用户通过系统托盘常驻应用，点击托盘图标弹出主界面进行配置管理。

---

## 二、架构

```
Claude Code
    │  请求 → http://localhost:7860
    ▼
[Rust 本地代理服务]  ←── Tauri 主进程常驻
    │
    ├── proxy 模块        HTTP 代理，透传请求，捕获错误触发切换
    ├── router 模块       供应商优先级队列，重试与切换逻辑
    └── config 模块       配置持久化，写入 ~/.claude/settings.json

[React 前端]  ←── 系统托盘点击弹出
    ├── 主界面            供应商卡片网格 + 拖拽排序
    ├── 供应商卡片        模型标签直接点击启用/禁用
    └── 设置面板          重试次数、间隔秒数配置
```

**启动流程**：应用启动时代理服务自动运行，并将 `~/.claude/settings.json` 中的 `api_url_override` 写为 `http://localhost:7860`。应用退出时清空该字段。

---

## 三、数据模型

### 供应商配置（持久化至 `~/.config/freemodel/config.json`）

```rust
struct Provider {
    id: String,           // 唯一标识，如 "openrouter"
    name: String,         // 显示名称
    base_url: String,     // API 基础 URL
    protocol: Protocol,   // OpenAI | Anthropic
    api_key: String,
    models: Vec<Model>,
    enabled: bool,        // 供应商总开关
    priority: u32,        // 越小优先级越高，由拖拽排序写入
}

struct Model {
    id: String,           // 如 "claude-3-5-sonnet-20241022"
    name: String,         // 显示名称
    enabled: bool,        // 单模型开关，卡片上直接点击切换
}

enum Protocol {
    OpenAI,
    Anthropic,
}
```

### 重试配置（持久化）

```rust
struct RetryConfig {
    max_retries: u32,      // 默认 2，切换前对当前供应商的重试次数
    retry_delay_secs: u32, // 默认 3，每次重试的等待秒数
}
```

### 运行时状态（内存，不持久化）

```rust
struct RouterState {
    active_provider_id: String,
    providers: Vec<Provider>,  // 按 priority 升序排列
}
```

---

## 四、核心逻辑

### 自动切换流程

1. 代理收到上游 HTTP 错误（429、401、503）或响应体含关键词（`quota`、`rate_limit`、`insufficient_credits`）
2. 等待 `retry_delay_secs` 秒后，对**当前供应商**重试同一请求
3. 重试次数达到 `max_retries` 仍失败 → 将当前供应商标记为暂时不可用
4. 从队列中取下一个 `enabled = true` 的供应商，切换并重试原始请求
5. 触发 macOS 系统通知，告知切换到了哪个供应商
6. 若所有供应商均不可用，返回最后一次原始错误给 Claude Code

### 模型选择

代理转发请求时，从当前活跃供应商中选取第一个 `enabled = true` 的模型作为实际请求模型。若请求中已指定 model 字段，保持原值透传（用户显式指定优先）。

---

## 五、前端界面

### 主界面

- **窗口形态**：系统托盘常驻，点击弹出主窗口（约 560×580px）
- **风格**：深色极简，`#0f0f0f` 背景，monospace 字体
- **顶部栏**：代理运行状态指示灯 + 端口显示 + 设置入口
- **活跃 banner**：当前活跃供应商名称、模型、今日请求计数
- **供应商卡片网格**：3列，卡片顶部边框颜色表示状态（绿=活跃、灰=待机、暗=禁用）

### 供应商卡片

每张卡片包含：
- 供应商名称 + 拖拽手柄（调整优先级）
- 状态标签（活跃 / 待机 / 已禁用）
- 模型标签列表：**直接点击切换启用/禁用**（亮蓝+✓=启用，暗灰=禁用）
- 编辑按钮（修改名称、URL、API Key）
- 供应商总开关

### 设置面板

- 重试次数（默认 2）
- 重试间隔秒数（默认 3）

---

## 六、供应商配置

内置供应商列表留待后续专门讨论，用户可手动添加自定义供应商（填写名称、URL、协议、API Key、模型列表）。

---

## 七、错误处理

- 代理启动失败（端口占用）：弹出提示，允许用户修改端口
- API Key 无效（401）：标记该供应商为"认证失败"状态，不计入重试次数，直接跳过
- 所有供应商不可用：返回错误给 Claude Code，主界面显示"全部不可用"警告状态

---

## 八、待定事项

- 内置供应商列表（后续专门讨论）
- 代理端口是否允许用户自定义（默认 7860）
- 是否需要请求日志面板
