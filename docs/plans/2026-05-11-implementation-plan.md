# freemodel-auto-router 实施计划

> **执行方式：** 使用 subagent-driven-development 技能逐任务执行。

**Goal:** 构建一个 Tauri 桌面应用，本地 HTTP 代理转发 Claude Code 请求到多个模型供应商，支持自动故障切换。

**Architecture:** Rust 后端运行 axum HTTP 代理服务（:7860），维护供应商优先级队列，错误重试 N 次后自动切换并发系统通知。React 前端通过系统托盘弹出，展示供应商卡片网格，支持拖拽排序和模型标签点击开关。

**Tech Stack:** Tauri 2 + React 19 + TypeScript + Rust (axum, tokio, reqwest, serde_json)

---

## Phase 1：Rust 后端基础

### Task 1：添加 Rust 依赖

**Objective:** 在 Cargo.toml 中添加代理服务所需依赖

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: 替换依赖内容**

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "protocol-asset", "image-png"] }
tauri-plugin-opener = "2"
tauri-plugin-notification = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "time", "sync"] }
axum = "0.7"
hyper = { version = "1.0", features = ["full"] }
hyper-util = { version = "0.1", features = ["tokio", "http1", "client-legacy"] }
hyper-rustls = { version = "0.27", features = ["http1", "tls12", "ring", "webpki-tokio"] }
http = "1"
http-body-util = "0.1"
bytes = "1.5"
reqwest = { version = "0.12", features = ["rustls-tls", "json", "stream"] }
tower-http = { version = "0.5", features = ["cors"] }
dirs = "5.0"
anyhow = "1.0"
log = "0.4"
once_cell = "1"
```

**Step 2: 编译验证**

```bash
cd src-tauri && cargo check
```
Expected: 无错误

**Step 3: Commit**
```bash
git add src-tauri/Cargo.toml
git commit -m "chore: add proxy dependencies"
```

---

### Task 2：定义数据模型

**Objective:** 创建 `config` 模块，定义 Provider/Model/RetryConfig 数据结构

**Files:**
- Create: `src-tauri/src/config.rs`

**Step 1: 写配置结构体**

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Protocol {
    OpenAI,
    Anthropic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Model {
    pub id: String,
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool { true }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub base_url: String,
    pub protocol: Protocol,
    pub api_key: String,
    pub models: Vec<Model>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub priority: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetryConfig {
    pub max_retries: u32,
    pub retry_delay_secs: u32,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self { max_retries: 2, retry_delay_secs: 3 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self { providers: vec![], retry: RetryConfig::default() }
    }
}

fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("freemodel")
        .join("config.json")
}

pub fn load_config() -> AppConfig {
    let path = config_path();
    if let Ok(s) = fs::read_to_string(&path) {
        serde_json::from_str(&s).unwrap_or_default()
    } else {
        AppConfig::default()
    }
}

pub fn save_config(config: &AppConfig) -> Result<()> {
    let path = config_path();
    fs::create_dir_all(path.parent().unwrap())?;
    let s = serde_json::to_string_pretty(config)?;
    fs::write(&path, s)?;
    Ok(())
}
```

**Step 2: 在 lib.rs 中声明模块**

在 `src-tauri/src/lib.rs` 顶部添加：
```rust
mod config;
```

**Step 3: 编译验证**
```bash
cd src-tauri && cargo check
```

**Step 4: Commit**
```bash
git add src-tauri/src/config.rs src-tauri/src/lib.rs
git commit -m "feat: add config data model"
```

---

### Task 3：实现 ~/.claude/settings.json 写入

**Objective:** 创建 `claude_settings` 模块，应用启动时将代理地址写入 settings.json，退出时清除

**Files:**
- Create: `src-tauri/src/claude_settings.rs`

**Step 1: 写模块**

```rust
use anyhow::Result;
use std::path::PathBuf;
use std::fs;

fn settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
        .join("settings.json")
}

pub fn inject_proxy(port: u16) -> Result<()> {
    let path = settings_path();
    let mut val: serde_json::Value = if path.exists() {
        let s = fs::read_to_string(&path)?;
        serde_json::from_str(&s).unwrap_or(serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    val["apiBaseUrl"] = serde_json::Value::String(
        format!("http://localhost:{}", port)
    );

    fs::create_dir_all(path.parent().unwrap())?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&val)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn remove_proxy() -> Result<()> {
    let path = settings_path();
    if !path.exists() { return Ok(()); }
    let s = fs::read_to_string(&path)?;
    let mut val: serde_json::Value = serde_json::from_str(&s).unwrap_or(serde_json::json!({}));
    if let Some(obj) = val.as_object_mut() {
        obj.remove("apiBaseUrl");
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&val)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
```

**Step 2: 注册模块**

`lib.rs` 添加 `mod claude_settings;`

**Step 3: Commit**
```bash
git add src-tauri/src/claude_settings.rs src-tauri/src/lib.rs
git commit -m "feat: inject/remove proxy in claude settings.json"
```

---

### Task 4：实现代理路由器（router 模块）

**Objective:** 创建 `router` 模块，维护供应商优先级队列和切换状态

**Files:**
- Create: `src-tauri/src/router.rs`

**Step 1: 写路由器**

```rust
use crate::config::{AppConfig, Provider, RetryConfig};
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct RouterState {
    pub active_idx: usize,
    pub providers: Vec<Provider>,
    pub retry: RetryConfig,
    pub fail_counts: Vec<u32>,
}

impl RouterState {
    pub fn from_config(cfg: &AppConfig) -> Self {
        let mut providers = cfg.providers.clone();
        providers.sort_by_key(|p| p.priority);
        let n = providers.len();
        Self {
            active_idx: 0,
            providers,
            retry: cfg.retry.clone(),
            fail_counts: vec![0; n],
        }
    }

    pub fn active_provider(&self) -> Option<&Provider> {
        self.providers
            .iter()
            .skip(self.active_idx)
            .find(|p| p.enabled)
    }

    /// 记录一次失败，返回是否应该切换到下一供应商
    pub fn record_failure(&mut self) -> bool {
        if let Some(idx) = self.enabled_idx_from(self.active_idx) {
            self.fail_counts[idx] += 1;
            if self.fail_counts[idx] > self.retry.max_retries {
                self.fail_counts[idx] = 0;
                // 找下一个 enabled 供应商
                if let Some(next) = self.enabled_idx_from(idx + 1) {
                    self.active_idx = next;
                    return true;
                }
            }
        }
        false
    }

    fn enabled_idx_from(&self, from: usize) -> Option<usize> {
        self.providers
            .iter()
            .enumerate()
            .skip(from)
            .find(|(_, p)| p.enabled)
            .map(|(i, _)| i)
    }
}

pub type SharedRouter = Arc<RwLock<RouterState>>;

pub fn new_router(cfg: &AppConfig) -> SharedRouter {
    Arc::new(RwLock::new(RouterState::from_config(cfg)))
}
```

**Step 2: 注册模块，编译验证**
```bash
cd src-tauri && cargo check
```

**Step 3: Commit**
```bash
git add src-tauri/src/router.rs src-tauri/src/lib.rs
git commit -m "feat: provider router with priority queue and failover"
```

---

### Task 5：实现 HTTP 代理服务（proxy 模块）

**Objective:** 创建 `proxy` 模块，axum 服务监听 :7860，转发请求，捕获错误触发切换

**Files:**
- Create: `src-tauri/src/proxy.rs`

**Step 1: 写代理服务**

```rust
use crate::router::SharedRouter;
use axum::{body::Body, extract::State, http::Request, response::Response, Router};
use axum::routing::any;
use bytes::Bytes;
use http_body_util::BodyExt;
use std::sync::Arc;
use tokio::sync::RwLock;

const PROXY_PORT: u16 = 7860;

#[derive(Clone)]
pub struct ProxyState {
    pub router: SharedRouter,
    pub notify_tx: Arc<tokio::sync::watch::Sender<String>>,
}

pub async fn start_proxy(router: SharedRouter) -> anyhow::Result<()> {
    let (tx, _rx) = tokio::sync::watch::channel(String::new());
    let state = ProxyState {
        router,
        notify_tx: Arc::new(tx),
    };

    let app = Router::new()
        .route("/{*path}", any(proxy_handler))
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(
        format!("127.0.0.1:{}", PROXY_PORT)
    ).await?;

    axum::serve(listener, app).await?;
    Ok(())
}

async fn proxy_handler(
    State(state): State<ProxyState>,
    req: Request<Body>,
) -> Response<Body> {
    let retry_delay = {
        let r = state.router.read().await;
        r.retry.retry_delay_secs
    };

    loop {
        let (base_url, api_key) = {
            let r = state.router.read().await;
            match r.active_provider() {
                Some(p) => (p.base_url.clone(), p.api_key.clone()),
                None => return error_response("no available provider"),
            }
        };

        match forward_request(&base_url, &api_key, &req).await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if is_quota_error(status) {
                    let switched = {
                        let mut r = state.router.write().await;
                        r.record_failure()
                    };
                    if switched {
                        // 发送切换通知
                        let provider_name = {
                            let r = state.router.read().await;
                            r.active_provider().map(|p| p.name.clone()).unwrap_or_default()
                        };
                        let _ = state.notify_tx.send(provider_name);
                        continue;
                    }
                    tokio::time::sleep(
                        std::time::Duration::from_secs(retry_delay as u64)
                    ).await;
                    continue;
                }
                return resp;
            }
            Err(_) => {
                let switched = {
                    let mut r = state.router.write().await;
                    r.record_failure()
                };
                if !switched {
                    tokio::time::sleep(
                        std::time::Duration::from_secs(retry_delay as u64)
                    ).await;
                }
            }
        }
    }
}

fn is_quota_error(status: u16) -> bool {
    matches!(status, 429 | 503)
}

async fn forward_request(
    base_url: &str,
    api_key: &str,
    req: &Request<Body>,
) -> anyhow::Result<Response<Body>> {
    let client = reqwest::Client::new();
    let path = req.uri().path_and_query().map(|p| p.as_str()).unwrap_or("/");
    let url = format!("{}{}", base_url.trim_end_matches('/'), path);

    let method = reqwest::Method::from_bytes(req.method().as_str().as_bytes())?;

    // 收集请求体
    let body_bytes = {
        let (_parts, body) = req.into_parts();
        // 注意：axum handler 中 req 已被 move，这里用克隆的方式处理
        // 实际实现需要先提取 body bytes，见下方完整实现备注
        Bytes::new()
    };

    let resp = client
        .request(method, &url)
        .header("Authorization", format!("Bearer {}", api_key))
        .body(body_bytes)
        .send()
        .await?;

    let status = resp.status();
    let body = resp.bytes().await?;
    Ok(Response::builder()
        .status(status)
        .body(Body::from(body))
        .unwrap())
}

fn error_response(msg: &str) -> Response<Body> {
    Response::builder()
        .status(503)
        .body(Body::from(msg.to_string()))
        .unwrap()
}
```

> **注意：** `forward_request` 中的 body 提取需要在 handler 入口处先用 `axum::body::to_bytes` 提取，再传入。Task 5 的完整实现需在 handler 签名中拆分 parts 和 body。这是骨架，Task 6 集成时完善。

**Step 2: 注册模块，编译验证**
```bash
cd src-tauri && cargo check
```

**Step 3: Commit**
```bash
git add src-tauri/src/proxy.rs src-tauri/src/lib.rs
git commit -m "feat: axum proxy server skeleton"
```

---

### Task 6：集成 Tauri 主进程，启动代理

**Objective:** 在 `lib.rs` 中启动代理服务，写入 settings.json，注册系统托盘

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 完整 lib.rs**

```rust
mod config;
mod claude_settings;
mod router;
mod proxy;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cfg = config::load_config();
    let router = router::new_router(&cfg);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let router_clone = router.clone();

            // 后台启动代理
            tauri::async_runtime::spawn(async move {
                if let Err(e) = proxy::start_proxy(router_clone).await {
                    log::error!("proxy error: {e}");
                }
            });

            // 写入 claude settings
            if let Err(e) = claude_settings::inject_proxy(7860) {
                log::warn!("inject proxy failed: {e}");
            }

            // 系统托盘
            let tray = tauri::tray::TrayIconBuilder::new()
                .tooltip("freemodel router")
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;
            let _ = tray;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // 关闭时隐藏到托盘，不退出
                window.hide().unwrap();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    // 退出时清除 proxy 配置
    let _ = claude_settings::remove_proxy();
}

#[tauri::command]
fn get_config() -> config::AppConfig {
    config::load_config()
}

#[tauri::command]
fn save_config_cmd(cfg: config::AppConfig) -> Result<(), String> {
    config::save_config(&cfg).map_err(|e| e.to_string())
}
```

**Step 2: 编译验证**
```bash
cd src-tauri && cargo build 2>&1 | tail -20
```

**Step 3: Commit**
```bash
git add src-tauri/src/lib.rs
git commit -m "feat: integrate proxy startup and tray in tauri main"
```

---

## Phase 2：React 前端

### Task 7：安装前端依赖

**Objective:** 安装 Tailwind CSS、@dnd-kit（拖拽）

**Files:**
- Modify: `package.json`

**Step 1: 安装**
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
pnpm add -D tailwindcss @tailwindcss/vite
```

**Step 2: 配置 Tailwind**

修改 `vite.config.ts`：
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

在 `src/App.css` 顶部替换为：
```css
@import "tailwindcss";
```

**Step 3: Commit**
```bash
git add package.json pnpm-lock.yaml vite.config.ts src/App.css
git commit -m "chore: add tailwind and dnd-kit"
```

---

### Task 8：定义前端类型和 API 层

**Objective:** 创建 TypeScript 类型定义和 Tauri invoke 封装

**Files:**
- Create: `src/types.ts`
- Create: `src/api.ts`

**Step 1: types.ts**

```ts
export type Protocol = "OpenAI" | "Anthropic";

export interface Model {
  id: string;
  name: string;
  enabled: boolean;
}

export interface Provider {
  id: string;
  name: string;
  base_url: string;
  protocol: Protocol;
  api_key: string;
  models: Model[];
  enabled: boolean;
  priority: number;
}

export interface RetryConfig {
  max_retries: number;
  retry_delay_secs: number;
}

export interface AppConfig {
  providers: Provider[];
  retry: RetryConfig;
}
```

**Step 2: api.ts**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "./types";

export const getConfig = (): Promise<AppConfig> => invoke("get_config");
export const saveConfig = (cfg: AppConfig): Promise<void> => invoke("save_config_cmd", { cfg });
```

**Step 3: Commit**
```bash
git add src/types.ts src/api.ts
git commit -m "feat: frontend types and tauri api layer"
```

---

### Task 9：实现供应商卡片组件

**Objective:** 创建 `ProviderCard` 组件，展示状态、模型标签（可点击）、编辑/开关

**Files:**
- Create: `src/components/ProviderCard.tsx`

**Step 1: 写组件**

```tsx
import type { Provider } from "../types";

interface Props {
  provider: Provider;
  isActive: boolean;
  onToggleModel: (providerId: string, modelId: string) => void;
  onToggleProvider: (providerId: string) => void;
  onEdit: (providerId: string) => void;
  dragHandleProps?: Record<string, unknown>;
}

export function ProviderCard({
  provider,
  isActive,
  onToggleModel,
  onToggleProvider,
  onEdit,
  dragHandleProps,
}: Props) {
  const borderColor = isActive
    ? "border-t-green-500"
    : provider.enabled
    ? "border-t-neutral-600"
    : "border-t-neutral-800";

  const statusLabel = isActive
    ? <span className="text-[9px] bg-green-950 text-green-400 rounded px-1.5 py-0.5">● 活跃</span>
    : provider.enabled
    ? <span className="text-[9px] bg-neutral-900 text-neutral-500 rounded px-1.5 py-0.5">○ 待机</span>
    : <span className="text-[9px] bg-neutral-900 text-neutral-600 rounded px-1.5 py-0.5">— 已禁用</span>;

  return (
    <div className={`bg-neutral-900 border border-neutral-800 border-t-2 ${borderColor} rounded-lg p-2.5 ${!provider.enabled ? "opacity-50" : ""}`}>
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-neutral-200">{provider.name}</span>
        <span {...dragHandleProps} className="text-neutral-600 cursor-grab text-sm select-none">⠿</span>
      </div>

      {/* 状态 */}
      <div className="mb-2">{statusLabel}</div>

      {/* 模型标签 */}
      <div className="text-[9px] text-neutral-600 uppercase tracking-wide mb-1">模型</div>
      <div className="flex flex-wrap gap-1 mb-2.5">
        {provider.models.map((m) => (
          <button
            key={m.id}
            onClick={() => onToggleModel(provider.id, m.id)}
            className={`text-[9px] rounded px-1.5 py-0.5 border cursor-pointer transition-colors ${
              m.enabled
                ? "bg-blue-950 text-blue-400 border-blue-800"
                : "bg-neutral-900 text-neutral-600 border-neutral-800"
            }`}
          >
            {m.enabled ? `${m.name} ✓` : m.name}
          </button>
        ))}
        {provider.models.length === 0 && (
          <span className="text-[9px] text-neutral-700">未配置 API Key</span>
        )}
      </div>

      {/* 底部：优先级 + 编辑 + 开关 */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-neutral-700">#{provider.priority + 1}</span>
        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => onEdit(provider.id)}
            className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[9px] text-neutral-500 cursor-pointer"
          >✎</button>
          {/* 开关 */}
          <button
            onClick={() => onToggleProvider(provider.id)}
            className={`w-[22px] h-[12px] rounded-full relative transition-colors ${provider.enabled ? "bg-green-500" : "bg-neutral-700"}`}
          >
            <span className={`absolute top-[1px] w-[10px] h-[10px] bg-white rounded-full transition-all ${provider.enabled ? "right-[1px]" : "left-[1px]"}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**
```bash
git add src/components/ProviderCard.tsx
git commit -m "feat: ProviderCard component"
```

---

### Task 10：实现主界面 App.tsx

**Objective:** 重写 App.tsx，实现供应商卡片网格 + dnd-kit 拖拽排序

**Files:**
- Modify: `src/App.tsx`

**Step 1: 重写 App.tsx**

```tsx
import { useEffect, useState } from "react";
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
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getConfig, saveConfig } from "./api";
import { ProviderCard } from "./components/ProviderCard";
import type { AppConfig, Provider } from "./types";

function SortableCard(props: {
  provider: Provider;
  isActive: boolean;
  onToggleModel: (pid: string, mid: string) => void;
  onToggleProvider: (pid: string) => void;
  onEdit: (pid: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: props.provider.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style}>
      <ProviderCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    getConfig().then(setConfig);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor));

  if (!config) return (
    <div className="bg-[#0f0f0f] min-h-screen flex items-center justify-center text-neutral-500 text-sm">
      加载中…
    </div>
  );

  const sorted = [...config.providers].sort((a, b) => a.priority - b.priority);
  const activeProvider = sorted.find((p) => p.enabled);

  function updateAndSave(next: AppConfig) {
    setConfig(next);
    saveConfig(next);
  }

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sorted.findIndex((p) => p.id === active.id);
    const newIdx = sorted.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(sorted, oldIdx, newIdx).map((p, i) => ({
      ...p,
      priority: i,
    }));
    updateAndSave({ ...config, providers: reordered });
  }

  function toggleModel(providerId: string, modelId: string) {
    const providers = config.providers.map((p) =>
      p.id !== providerId ? p : {
        ...p,
        models: p.models.map((m) =>
          m.id !== modelId ? m : { ...m, enabled: !m.enabled }
        ),
      }
    );
    updateAndSave({ ...config, providers });
  }

  function toggleProvider(providerId: string) {
    const providers = config.providers.map((p) =>
      p.id !== providerId ? p : { ...p, enabled: !p.enabled }
    );
    updateAndSave({ ...config, providers });
  }

  return (
    <div className="bg-[#0f0f0f] min-h-screen font-mono text-white">
      {/* 顶部栏 */}
      <div className="bg-[#161616] border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_6px_#22c55e88]" />
          <span className="text-[13px] font-semibold text-neutral-200">freemodel router</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-600">代理运行中 :7860</span>
          <button className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[11px] text-neutral-400">⚙ 设置</button>
        </div>
      </div>

      {/* 活跃供应商 banner */}
      {activeProvider && (
        <div className="bg-green-950/40 border-b border-green-900/40 px-4 py-2.5 flex justify-between items-center">
          <div>
            <div className="text-[10px] text-green-400 uppercase tracking-widest mb-0.5">当前活跃</div>
            <div className="text-[13px] font-semibold text-neutral-200">{activeProvider.name}</div>
            <div className="text-[11px] text-green-400">
              {activeProvider.models.find((m) => m.enabled)?.name ?? "—"}
            </div>
          </div>
        </div>
      )}

      {/* 供应商网格 */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <span className="text-[10px] text-neutral-600 uppercase tracking-widest">供应商 · 拖拽调整优先级</span>
        <button className="text-[11px] text-blue-400">+ 添加</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="px-3 grid grid-cols-3 gap-2 pb-3">
            {sorted.map((p) => (
              <SortableCard
                key={p.id}
                provider={p}
                isActive={p.id === activeProvider?.id}
                onToggleModel={toggleModel}
                onToggleProvider={toggleProvider}
                onEdit={(id) => console.log("edit", id)}
              />
            ))}
            <button className="border border-dashed border-neutral-800 rounded-lg flex items-center justify-center min-h-[100px] text-[11px] text-blue-400">
              + 添加供应商
            </button>
          </div>
        </SortableContext>
      </DndContext>

      {/* 底部 */}
      <div className="border-t border-neutral-900 px-4 py-2 flex justify-between items-center">
        <button className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-[10px] text-neutral-500">
          重试: {config.retry.max_retries}次 · 间隔 {config.retry.retry_delay_secs}s
        </button>
        <span className="text-[10px] text-neutral-800">v0.1.0</span>
      </div>
    </div>
  );
}
```

**Step 2: 运行 dev 服务验证界面**
```bash
pnpm tauri dev
```

**Step 3: Commit**
```bash
git add src/App.tsx
git commit -m "feat: main UI with provider card grid and drag-sort"
```

---

## Phase 3：系统通知

### Task 11：Tauri 切换通知

**Objective:** 代理切换供应商时触发 macOS 系统通知

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tauri.conf.json`

**Step 1: 在 tauri.conf.json 中启用通知权限**

在 `src-tauri/tauri.conf.json` 的 `plugins` 字段添加：
```json
{
  "plugins": {
    "notification": {}
  }
}
```

**Step 2: 在 proxy.rs 的切换成功后发送通知**

在 `proxy_handler` 切换成功后，通过 Tauri 事件系统通知前端，前端调用 `tauri-plugin-notification`：

在 `proxy.rs` 切换时额外发送 Tauri 事件（通过 `AppHandle`）：

```rust
// 在 ProxyState 中增加 app_handle: Option<tauri::AppHandle>
// 切换后调用：
if let Some(app) = &state.app_handle {
    use tauri::Emitter;
    let _ = app.emit("provider-switched", &provider_name);
}
```

**Step 3: 前端监听事件，触发通知**

在 `App.tsx` 中：
```ts
import { listen } from "@tauri-apps/api/event";
import { sendNotification } from "@tauri-apps/plugin-notification";

useEffect(() => {
  const unlisten = listen<string>("provider-switched", (e) => {
    sendNotification({
      title: "freemodel router",
      body: `已切换到 ${e.payload}`,
    });
  });
  return () => { unlisten.then(f => f()); };
}, []);
```

**Step 4: 编译验证**
```bash
pnpm tauri build --debug 2>&1 | tail -20
```

**Step 5: Commit**
```bash
git add src-tauri/src/lib.rs src-tauri/src/proxy.rs src/App.tsx
git commit -m "feat: system notification on provider switch"
```

---

## Phase 4：收尾

### Task 12：编译打包验证

**Objective:** Release 构建验证完整流程

**Step 1: 构建**
```bash
pnpm tauri build
```
Expected: 生成 `.app` 或 `.dmg`

**Step 2: 手动测试清单**
- [ ] 启动应用，`~/.claude/settings.json` 中 `apiBaseUrl` 已写入
- [ ] 关闭应用，`apiBaseUrl` 已清除
- [ ] 系统托盘图标出现，点击弹出主界面
- [ ] 关闭主窗口后应用仍在托盘运行
- [ ] 拖拽供应商卡片调整顺序，重启后顺序持久化
- [ ] 点击模型标签切换启用状态，重启后持久化

**Step 3: Commit**
```bash
git add .
git commit -m "chore: verified release build"
```
