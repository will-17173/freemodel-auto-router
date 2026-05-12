# 双 URL 协议支持实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Provider 配置支持双 URL（anthropic_url + openai_url），代理根据路径前缀（/anthropic、/openai）路由请求到对应 URL。

**Architecture:** 
- Provider 结构体新增 `anthropic_url`、`openai_url`、`dual_protocol` 字段，废弃 `base_url`
- 代理层根据入站路径前缀选择转发 URL 和认证头处理方式
- 四个应用的配置注入统一指向本地代理 + 路径前缀

**Tech Stack:** Rust (Tauri backend), TypeScript (React frontend), serde (JSON serialization)

---

## Phase 1: 后端数据结构变更

### Task 1: 更新 Provider 结构体定义

**Objective:** 在 config.rs 中添加新字段并保留向后兼容的 base_url 字段（用于迁移）

**Files:**
- Modify: `src-tauri/src/config.rs:32-46`

**Step 1: 添加新字段到 Provider 结构体**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    // 新字段
    #[serde(default)]
    pub anthropic_url: String,
    #[serde(default)]
    pub openai_url: String,
    #[serde(default)]
    pub dual_protocol: bool,
    // 旧字段，迁移完成后可删除（暂时保留用于兼容）
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub base_url: String,
    pub protocol: Protocol,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_scheme: Option<AuthScheme>,
    #[serde(default)]
    pub api_key: String,
    pub models: Vec<Model>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub priority: u32,
}
```

**Step 2: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功，无错误

**Step 3: 提交**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): add anthropic_url/openai_url/dual_protocol fields to Provider"
```

---

### Task 2: 实现配置迁移逻辑

**Objective:** 启动时自动将旧格式 base_url 迁移到新字段

**Files:**
- Modify: `src-tauri/src/config.rs:116-129`

**Step 1: 在 load_config 函数中添加迁移逻辑**

在 `load_config()` 函数中，解析成功后添加迁移检查：

```rust
pub fn load_config() -> AppConfig {
    let path = config_path();
    if let Ok(s) = fs::read_to_string(&path) {
        match serde_json::from_str::<AppConfig>(&s) {
            Ok(cfg) => {
                // 迁移检查：如果有 base_url 但没有 anthropic_url
                let needs_migration = cfg.providers.iter().any(|p| {
                    !p.base_url.is_empty() && p.anthropic_url.is_empty()
                });
                
                if needs_migration {
                    let migrated = migrate_config(&cfg);
                    if let Err(e) = save_config(&migrated) {
                        eprintln!("[config] migration save error: {e}");
                    }
                    return migrated;
                }
                cfg
            }
            Err(e) => {
                eprintln!("[config] parse error: {e}");
                AppConfig::default()
            }
        }
    } else {
        AppConfig::default()
    }
}

fn migrate_config(cfg: &AppConfig) -> AppConfig {
    let migrated_providers = cfg.providers.iter().map(|p| {
        if !p.base_url.is_empty() && p.anthropic_url.is_empty() {
            Provider {
                id: p.id.clone(),
                name: p.name.clone(),
                anthropic_url: p.base_url.clone(),
                openai_url: p.base_url.clone(),
                dual_protocol: true,
                base_url: String::new(), // 清空旧字段
                protocol: p.protocol.clone(),
                auth_scheme: p.auth_scheme.clone(),
                api_key: p.api_key.clone(),
                models: p.models.clone(),
                enabled: p.enabled,
                priority: p.priority,
            }
        } else {
            p.clone()
        }
    }).collect();
    
    AppConfig {
        providers: migrated_providers,
        retry: cfg.retry.clone(),
        queue: cfg.queue.clone(),
        port: cfg.port,
    }
}
```

**Step 2: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功

**Step 3: 提交**

```bash
git add src-tauri/src/config.rs
git commit -m "feat(config): auto-migrate base_url to anthropic_url/openai_url"
```

---

### Task 3: 更新 builtin_providers.json

**Objective:** 将内置供应商配置更新为新字段格式

**Files:**
- Modify: `src-tauri/builtin_providers.json`

**Step 1: 替换 base_url 为双 URL 字段**

```json
[
  {
    "id": "openrouter",
    "name": "OpenRouter",
    "anthropic_url": "https://openrouter.ai/api",
    "openai_url": "https://openrouter.ai/api",
    "dual_protocol": true,
    "protocol": "Anthropic",
    "auth_scheme": "Bearer",
    "models": [
      { "id": "nvidia/nemotron-3-super", "name": "NVIDIA: Nemotron 3 Super", "enabled": true },
      { "id": "poolside/laguna-m.1", "name": "Poolside: Laguna M.1", "enabled": false },
      { "id": "inclusionai/ring-2.6-1t", "name": "inclusionAI: Ring-2.6-1T", "enabled": false },
      { "id": "openai/gpt-oss-120b", "name": "OpenAI: gpt-oss-120b", "enabled": false },
      { "id": "z-ai/glm-4.5-air", "name": "Z.ai: GLM 4.5 Air", "enabled": false },
      { "id": "minimax/minimax-m2.5", "name": "MiniMax: MiniMax M2.5", "enabled": false },
      { "id": "nvidia/nemotron-3-nano-30b-a3b", "name": "NVIDIA: Nemotron 3 Nano 30B A3B", "enabled": false },
      { "id": "poolside/laguna-xs.2", "name": "Poolside: Laguna XS.2", "enabled": false },
      { "id": "openai/gpt-oss-20b", "name": "OpenAI: gpt-oss-20b", "enabled": false },
      { "id": "nvidia/nemotron-3-nano-omni", "name": "NVIDIA: Nemotron 3 Nano Omni", "enabled": false },
      { "id": "google/gemma-4-31b", "name": "Google: Gemma 4 31B", "enabled": false },
      { "id": "nvidia/nemotron-nano-12b-2-vl", "name": "NVIDIA: Nemotron Nano 12B 2 VL", "enabled": false },
      { "id": "nvidia/nemotron-nano-9b-v2", "name": "NVIDIA: Nemotron Nano 9B V2", "enabled": false },
      { "id": "baidu/cobuddy", "name": "Baidu Qianfan: CoBuddy", "enabled": false },
      { "id": "google/gemma-4-26b-a4b", "name": "Google: Gemma 4 26B A4B", "enabled": false },
      { "id": "qwen/qwen3-coder-480b-a35b", "name": "Qwen: Qwen3 Coder 480B A35B", "enabled": false },
      { "id": "nvidia/llama-nemotron-embed-vl-1b-v2", "name": "NVIDIA: Llama Nemotron Embed VL 1B V2", "enabled": false },
      { "id": "qwen/qwen3-next-80b-a3b-instruct", "name": "Qwen: Qwen3 Next 80B A3B Instruct", "enabled": false }
    ],
    "enabled": true,
    "priority": 100
  },
  {
    "id": "longcat",
    "name": "美团 LongCat",
    "anthropic_url": "https://api.longcat.chat/anthropic",
    "openai_url": "https://api.longcat.chat/openai",
    "dual_protocol": false,
    "protocol": "Anthropic",
    "auth_scheme": "Bearer",
    "models": [
      { "id": "LongCat-Flash-Chat", "name": "LongCat Flash Chat", "enabled": true },
      { "id": "LongCat-Flash-Thinking", "name": "LongCat Flash Thinking", "enabled": false },
      { "id": "LongCat-Flash-Thinking-2601", "name": "LongCat Flash Thinking 2601", "enabled": false },
      { "id": "LongCat-Flash-Lite", "name": "LongCat Flash Lite", "enabled": false },
      { "id": "LongCat-2.0-Preview", "name": "LongCat 2.0 Preview", "enabled": false }
    ],
    "enabled": true,
    "priority": 90
  }
]
```

**Step 2: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功，builtin_providers.json 解析正常

**Step 3: 提交**

```bash
git add src-tauri/builtin_providers.json
git commit -m "feat: update builtin providers to dual URL format"
```

---

### Task 4: 更新 TypeScript 类型定义

**Objective:** 同步更新前端 Provider 类型定义

**Files:**
- Modify: `src/types.ts:10-20`

**Step 1: 更新 Provider 接口**

```typescript
export interface Provider {
  id: string;
  name: string;
  anthropic_url: string;
  openai_url: string;
  dual_protocol: boolean;
  base_url?: string; // 旧字段，可选，用于兼容
  protocol: Protocol;
  auth_scheme?: AuthScheme;
  api_key: string;
  models: Model[];
  enabled: boolean;
  priority: number;
}
```

**Step 2: TypeScript 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 3: 提交**

```bash
git add src/types.ts
git commit -m "feat(types): add anthropic_url/openai_url/dual_protocol to Provider"
```

---

## Phase 2: 代理路由逻辑变更

### Task 5: 添加路径前缀枚举和解析函数

**Objective:** 定义代理路由前缀类型和路径解析逻辑

**Files:**
- Modify: `src-tauri/src/proxy.rs` (顶部新增)

**Step 1: 添加路由前缀枚举**

在 proxy.rs 顶部添加：

```rust
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RoutePrefix {
    Anthropic,
    OpenAI,
}

fn parse_route_prefix(path: &str) -> Option<(RoutePrefix, &str)> {
    if let Some(rest) = path.strip_prefix("/anthropic") {
        Some((RoutePrefix::Anthropic, rest))
    } else if let Some(rest) = path.strip_prefix("/openai") {
        Some((RoutePrefix::OpenAI, rest))
    } else {
        None
    }
}
```

**Step 2: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功

**Step 3: 提交**

```bash
git add src-tauri/src/proxy.rs
git commit -m "feat(proxy): add RoutePrefix enum and path parsing"
```

---

### Task 6: 修改 proxy_handler 使用路径前缀路由

**Objective:** 根据入站路径前缀选择转发 URL 和认证处理方式

**Files:**
- Modify: `src-tauri/src/proxy.rs:63-130`

**Step 1: 在 proxy_handler 开头添加路径前缀解析**

在获取 body_bytes 之后，添加：

```rust
// 解析路径前缀
let route_info = match parse_route_prefix(&path) {
    Some((prefix, rest)) => (prefix, rest),
    None => {
        return error_response(
            StatusCode::BAD_REQUEST,
            "路径必须以 /anthropic 或 /openai 开头",
        );
    }
};
let (route_prefix, stripped_path) = route_info;
```

**Step 2: 修改 active_entry 获取逻辑**

将原来的 `base_url` 替换为根据路由前缀选择 URL：

```rust
let (target_url, api_key, protocol, auth_scheme, model_id, provider_name) = {
    let r = state.router.read().await;
    match r.active_entry() {
        Some((p, mid)) => {
            let target_url = match route_prefix {
                RoutePrefix::Anthropic => {
                    if p.anthropic_url.is_empty() {
                        return error_response(
                            StatusCode::SERVICE_UNAVAILABLE,
                            "该供应商未配置 Anthropic URL",
                        );
                    }
                    p.anthropic_url.clone()
                }
                RoutePrefix::OpenAI => {
                    if p.openai_url.is_empty() {
                        return error_response(
                            StatusCode::SERVICE_UNAVAILABLE,
                            "该供应商未配置 OpenAI URL",
                        );
                    }
                    p.openai_url.clone()
                }
            };
            (
                target_url,
                p.api_key.clone(),
                p.protocol.clone(),
                p.effective_auth_scheme(),
                mid.to_owned(),
                p.name.clone(),
            )
        }
        None => {
            return error_response(
                StatusCode::SERVICE_UNAVAILABLE,
                "no available provider in queue",
            )
        }
    }
};
```

**Step 3: 修改 URL 拼接逻辑**

将 `base_url` 替换为 `target_url`：

```rust
let url = format!("{}{}", target_url.trim_end_matches('/'), stripped_path);
```

**Step 4: 修改认证头构建逻辑**

创建新的函数处理认证头，区分 Anthropic 和 OpenAI 路径：

```rust
fn build_upstream_headers_for_route(
    original_headers: &HeaderMap,
    route_prefix: RoutePrefix,
    protocol: &Protocol,
    auth_scheme: &AuthScheme,
    api_key: &str,
    stripped_path: &str,
) -> HeaderMap {
    let mut headers = HeaderMap::new();

    for (key, value) in original_headers.iter() {
        if should_forward_request_header(key.as_str()) {
            headers.insert(key.clone(), value.clone());
        }
    }

    match route_prefix {
        RoutePrefix::Anthropic => {
            // Anthropic 路径：按原有逻辑处理
            match auth_scheme {
                AuthScheme::Bearer => {
                    if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", api_key)) {
                        headers.insert("authorization", value);
                    }
                }
                AuthScheme::ApiKey => {
                    if let Ok(value) = HeaderValue::from_str(api_key) {
                        headers.insert("x-api-key", value);
                    }
                }
            }
            // 添加 anthropic-version（如果路径是 messages API）
            if is_anthropic_messages_path(stripped_path) && !headers.contains_key("anthropic-version") {
                headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));
            }
        }
        RoutePrefix::OpenAI => {
            // OpenAI 路径：固定 Bearer 认证
            if let Ok(value) = HeaderValue::from_str(&format!("Bearer {}", api_key)) {
                headers.insert("authorization", value);
            }
            // 不添加 anthropic-version
        }
    }

    headers
}
```

**Step 5: 更新 build_upstream_headers 调用**

将原来的调用改为：

```rust
req_builder = req_builder.headers(build_upstream_headers_for_route(
    &original_headers,
    route_prefix,
    &protocol,
    &auth_scheme,
    &api_key,
    stripped_path,
));
```

**Step 6: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功

**Step 7: 提交**

```bash
git add src-tauri/src/proxy.rs
git commit -m "feat(proxy): route by path prefix /anthropic or /openai"
```

---

### Task 7: 添加代理路由单元测试

**Objective:** 验证路径前缀解析和路由逻辑正确性

**Files:**
- Modify: `src-tauri/src/proxy.rs` (tests 模块)

**Step 1: 添加测试**

```rust
#[cfg(test)]
mod tests_route_prefix {
    use super::*;

    #[test]
    fn parse_anthropic_prefix() {
        let result = parse_route_prefix("/anthropic/v1/messages");
        assert_eq!(result, Some((RoutePrefix::Anthropic, "/v1/messages")));
    }

    #[test]
    fn parse_openai_prefix() {
        let result = parse_route_prefix("/openai/v1/chat/completions");
        assert_eq!(result, Some((RoutePrefix::OpenAI, "/v1/chat/completions")));
    }

    #[test]
    fn reject_invalid_prefix() {
        let result = parse_route_prefix("/v1/messages");
        assert_eq!(result, None);
    }

    #[test]
    fn openai_route_uses_bearer_auth() {
        let mut original = HeaderMap::new();
        original.insert("content-type", HeaderValue::from_static("application/json"));

        let headers = build_upstream_headers_for_route(
            &original,
            RoutePrefix::OpenAI,
            &Protocol::Anthropic,
            &AuthScheme::ApiKey,
            "test-key",
            "/v1/chat/completions",
        );

        assert_eq!(headers.get("authorization").unwrap(), "Bearer test-key");
        assert!(!headers.contains_key("anthropic-version"));
    }

    #[test]
    fn anthropic_route_preserves_protocol_auth() {
        let mut original = HeaderMap::new();
        original.insert("content-type", HeaderValue::from_static("application/json"));

        let headers = build_upstream_headers_for_route(
            &original,
            RoutePrefix::Anthropic,
            &Protocol::Anthropic,
            &AuthScheme::ApiKey,
            "test-key",
            "/v1/messages",
        );

        assert_eq!(headers.get("x-api-key").unwrap(), "test-key");
        assert_eq!(headers.get("anthropic-version").unwrap(), "2023-06-01");
    }
}
```

**Step 2: 运行测试**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo test tests_route_prefix`
Expected: 5 tests passed

**Step 3: 提交**

```bash
git add src-tauri/src/proxy.rs
git commit -m "test(proxy): add route prefix parsing and auth tests"
```

---

## Phase 3: 应用配置注入变更

### Task 8: 更新 Claude Code 注入路径前缀

**Objective:** inject_proxy 添加 /anthropic 路径前缀

**Files:**
- Modify: `src-tauri/src/claude_settings.rs:34-36`

**Step 1: 修改 local_base_url 函数**

```rust
fn local_anthropic_base_url(port: u16) -> String {
    format!("http://localhost:{}/anthropic", port)
}
```

**Step 2: 更新 inject_proxy 函数中的引用**

将所有使用 `local_base_url(port)` 的地方改为 `local_anthropic_base_url(port)`：

```rust
// 第 48 行
== Some(local_anthropic_base_url(port).as_str());

// 第 79-81 行
env_obj.insert(
    "ANTHROPIC_BASE_URL".to_string(),
    Value::String(local_anthropic_base_url(port)),
);
```

**Step 3: 更新 is_injected 函数**

```rust
pub fn is_injected(port: u16) -> bool {
    read_settings()
        .map(|v| {
            v.get("env")
                .and_then(|e| e.get("ANTHROPIC_BASE_URL"))
                .and_then(|s| s.as_str())
                .map(|s| s == local_anthropic_base_url(port))
                .unwrap_or(false)
        })
        .unwrap_or(false)
}
```

**Step 4: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功

**Step 5: 提交**

```bash
git add src-tauri/src/claude_settings.rs
git commit -m "feat(claude_settings): add /anthropic path prefix to ANTHROPIC_BASE_URL"
```

---

### Task 9: 更新 Codex 配置注入指向本地代理

**Objective:** codex_settings.rs 的 base_url 改为本地代理 + /openai 前缀

**Files:**
- Modify: `src-tauri/src/codex_settings.rs`

**Step 1: 添加 port 参数到 inject 函数**

```rust
pub fn inject(provider: &Provider, port: u16) -> Result<()> {
    let dir = codex_dir();
    fs::create_dir_all(&dir)?;

    // auth.json
    let auth_path = dir.join("auth.json");
    let auth_tmp = auth_path.with_extension("tmp");
    let auth_json = serde_json::json!({ "OPENAI_API_KEY": provider.api_key });
    fs::write(&auth_tmp, serde_json::to_string_pretty(&auth_json)?)?;
    fs::rename(&auth_tmp, &auth_path)?;

    // config.toml - 指向本地代理
    let model_id = "freemodel-auto";
    let config_content = format!(
        "model = \"{}\"\n\n[provider]\nbase_url = \"http://localhost:{}/openai\"\n",
        model_id, port
    );
    let config_path = dir.join("config.toml");
    let config_tmp = config_path.with_extension("tmp");
    fs::write(&config_tmp, &config_content)?;
    fs::rename(&config_tmp, &config_path)?;

    Ok(())
}
```

**Step 2: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功（会有调用方参数不匹配的错误，下一步修复）

**Step 3: 提交**

```bash
git add src-tauri/src/codex_settings.rs
git commit -m "feat(codex_settings): point base_url to local proxy with /openai prefix"
```

---

### Task 10: 更新 Hermes 配置注入指向本地代理

**Objective:** hermes_settings.rs 的 base_url 改为本地代理 + /openai 前缀

**Files:**
- Modify: `src-tauri/src/hermes_settings.rs`

**Step 1: 添加 port 参数并修改 base_url**

```rust
pub fn inject(provider: &Provider, port: u16) -> Result<()> {
    let path = hermes_config_path();
    fs::create_dir_all(path.parent().unwrap())?;

    let content = if path.exists() {
        fs::read_to_string(&path)?
    } else {
        String::new()
    };

    let mut doc: serde_yaml::Value = if content.trim().is_empty() {
        serde_yaml::Value::Mapping(serde_yaml::Mapping::new())
    } else {
        serde_yaml::from_str(&content)?
    };

    let model_id = "freemodel-auto".to_string();

    // Build the provider entry
    let mut provider_entry = serde_yaml::Mapping::new();
    provider_entry.insert(
        serde_yaml::Value::String("name".into()),
        serde_yaml::Value::String(provider.id.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("base_url".into()),
        serde_yaml::Value::String(format!("http://localhost:{}/openai", port)),
    );
    provider_entry.insert(
        serde_yaml::Value::String("api_key".into()),
        serde_yaml::Value::String(provider.api_key.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("model".into()),
        serde_yaml::Value::String(model_id.clone()),
    );

    // ... rest unchanged
}
```

**Step 2: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功

**Step 3: 提交**

```bash
git add src-tauri/src/hermes_settings.rs
git commit -m "feat(hermes_settings): point base_url to local proxy with /openai prefix"
```

---

### Task 11: 更新 OpenClaw 配置注入指向本地代理

**Objective:** openclaw_settings.rs 的 baseUrl 改为本地代理 + /openai 前缀

**Files:**
- Modify: `src-tauri/src/openclaw_settings.rs`

**Step 1: 添加 port 参数并修改 baseUrl**

```rust
pub fn inject(provider: &Provider, port: u16) -> Result<()> {
    let path = openclaw_config_path();
    fs::create_dir_all(path.parent().unwrap())?;

    let mut doc: Value = if path.exists() {
        let content = fs::read_to_string(&path)?;
        serde_json::from_str(&content).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };

    let models: Vec<Value> = provider
        .models
        .iter()
        .map(|m| json!({ "id": m.id }))
        .collect();

    let provider_entry = json!({
        "baseUrl": format!("http://localhost:{}/openai", port),
        "apiKey": provider.api_key,
        "models": models,
    });

    // ... rest unchanged
}
```

**Step 2: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功

**Step 3: 提交**

```bash
git add src-tauri/src/openclaw_settings.rs
git commit -m "feat(openclaw_settings): point baseUrl to local proxy with /openai prefix"
```

---

### Task 12: 更新 Tauri commands 以传递 port 参数

**Objective:** 更新 inject_codex_cmd、inject_hermes_cmd、inject_openclaw_cmd 命令

**Files:**
- Modify: `src-tauri/src/lib.rs:211-237`

**Step 1: 添加 port 参数到命令**

```rust
#[tauri::command]
fn inject_codex_cmd(provider: config::Provider, port: u16) -> Result<(), String> {
    codex_settings::inject(&provider, port).map_err(|e| e.to_string())
}

#[tauri::command]
fn inject_hermes_cmd(provider: config::Provider, port: u16) -> Result<(), String> {
    hermes_settings::inject(&provider, port).map_err(|e| e.to_string())
}

#[tauri::command]
fn inject_openclaw_cmd(provider: config::Provider, port: u16) -> Result<(), String> {
    openclaw_settings::inject(&provider, port).map_err(|e| e.to_string())
}
```

**Step 2: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check`
Expected: 编译成功

**Step 3: 提交**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(commands): add port parameter to inject commands"
```

---

## Phase 4: 前端 UI 变更

### Task 13: 更新前端 api.ts 函数签名

**Objective:** 更新 injectCodex、injectHermes、injectOpenclaw 函数以传递 port

**Files:**
- Modify: `src/api.ts`

**Step 1: 查看当前 api.ts 内容并更新函数签名**

需要添加 port 参数：

```typescript
export async function injectCodex(provider: Provider, port: number): Promise<void> {
  await invoke("inject_codex_cmd", { provider, port });
}

export async function injectHermes(provider: Provider, port: number): Promise<void> {
  await invoke("inject_hermes_cmd", { provider, port });
}

export async function injectOpenclaw(provider: Provider, port: number): Promise<void> {
  await invoke("inject_openclaw_cmd", { provider, port });
}
```

**Step 2: TypeScript 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 3: 提交**

```bash
git add src/api.ts
git commit -m "feat(api): add port parameter to inject functions"
```

---

### Task 14: 更新 App.tsx 调用传递 port

**Objective:** 在 App.tsx 中传递 config.port 到注入函数

**Files:**
- Modify: `src/App.tsx:299-341`

**Step 1: 更新四个 AppToggle 的 onToggle**

```tsx
// Codex (约 299-308 行)
onToggle={async () => {
  if (appStates.codex) {
    await removeCodex();
    setAppStates(prev => ({ ...prev, codex: false }));
  } else {
    await injectCodex(activeProvider!, config.port);
    setAppStates(prev => ({ ...prev, codex: true }));
  }
}}

// Hermes (约 316-324 行)
onToggle={async () => {
  if (appStates.hermes) {
    await removeHermes(activeProvider!.id);
    setAppStates(prev => ({ ...prev, hermes: false }));
  } else {
    await injectHermes(activeProvider!, config.port);
    setAppStates(prev => ({ ...prev, hermes: true }));
  }
}}

// OpenClaw (约 333-341 行)
onToggle={async () => {
  if (appStates.openclaw) {
    await removeOpenclaw(activeProvider!.id);
    setAppStates(prev => ({ ...prev, openclaw: false }));
  } else {
    await injectOpenclaw(activeProvider!, config.port);
    setAppStates(prev => ({ ...prev, openclaw: true }));
  }
}}
```

**Step 2: TypeScript 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 3: 提交**

```bash
git add src/App.tsx
git commit -m "feat(App): pass config.port to inject functions"
```

---

### Task 15: 更新 AddProviderModal 支持双 URL 配置

**Objective:** 添加双 URL 输入框和 dual_protocol checkbox

**Files:**
- Modify: `src/components/AddProviderModal.tsx`

**Step 1: 更新 Props 接口和状态**

```tsx
export interface AddProviderPayload {
  name: string;
  apiKey: string;
  anthropicUrl: string;
  openaiUrl: string;
  dualProtocol: boolean;
  modelIds: string[];
}

interface Props {
  onSave: (provider: AddProviderPayload) => void;
  onClose: () => void;
}

export function AddProviderModal({ onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [anthropicUrl, setAnthropicUrl] = useState("");
  const [openaiUrl, setOpenaiUrl] = useState("");
  const [dualProtocol, setDualProtocol] = useState(true); // 默认双协议
  const [models, setModels] = useState("");
  const [error, setError] = useState("");

  // 当勾选 dualProtocol 时，同步 openaiUrl
  const effectiveOpenaiUrl = dualProtocol ? anthropicUrl : openaiUrl;
  
  // ...
}
```

**Step 2: 更新 handleSave 验证逻辑**

```tsx
function handleSave() {
  const nextName = name.trim();
  const nextApiKey = apiKey.trim();
  const nextAnthropicUrl = anthropicUrl.trim();
  const nextOpenaiUrl = effectiveOpenaiUrl.trim();

  if (!nextName) {
    setError("请填写供应商名");
    return;
  }
  if (!nextApiKey) {
    setError("请填写 API Key");
    return;
  }
  if (!nextAnthropicUrl) {
    setError("请填写 Anthropic URL");
    return;
  }
  if (!dualProtocol && !nextOpenaiUrl) {
    setError("请填写 OpenAI URL");
    return;
  }
  if (modelIds.length === 0) {
    setError("请至少填写一个模型");
    return;
  }

  onSave({
    name: nextName,
    apiKey: nextApiKey,
    anthropicUrl: nextAnthropicUrl.replace(/\/+$/, ""),
    openaiUrl: nextOpenaiUrl.replace(/\/+$/, ""),
    dualProtocol,
    modelIds,
  });
  onClose();
}
```

**Step 3: 更新 UI 渲染**

替换原来的 Base URL 输入框为双 URL 区域：

```tsx
{/* 双协议 checkbox */}
<label style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
  <input
    type="checkbox"
    checked={dualProtocol}
    onChange={(e) => { setDualProtocol(e.target.checked); setError(""); }}
    style={{ width: "16px", height: "16px", accentColor: "var(--fm-color-ink)" }}
  />
  <span className="fm-body-sm">双协议兼容（单一 URL）</span>
</label>

{/* Anthropic URL */}
<label>
  <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>Anthropic URL</span>
  <input
    value={anthropicUrl}
    onChange={(e) => { setAnthropicUrl(e.target.value); setError(""); }}
    onKeyDown={handleKeyDown}
    placeholder="https://api.example.com/anthropic"
    autoFocus
    className="fm-input"
    style={{ fontFamily: "var(--fm-font-mono)", fontSize: "13px" }}
  />
</label>

{/* OpenAI URL - 仅在非双协议时显示 */}
{!dualProtocol && (
  <label>
    <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>OpenAI URL</span>
    <input
      value={openaiUrl}
      onChange={(e) => { setOpenaiUrl(e.target.value); setError(""); }}
      onKeyDown={handleKeyDown}
      placeholder="https://api.example.com/openai"
      className="fm-input"
      style={{ fontFamily: "var(--fm-font-mono)", fontSize: "13px" }}
    />
  </label>
)}

{/* 模型列表 */}
<label>
  ...
</label>
```

**Step 4: 更新标题区域的提示文案**

```tsx
<p className="fm-body-sm" style={{ margin: "0 0 0 25px", color: "var(--fm-ink-muted)" }}>
  配置 Anthropic 和 OpenAI 双协议 URL，或勾选双协议使用单一地址。
</p>
```

**Step 5: TypeScript 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 6: 提交**

```bash
git add src/components/AddProviderModal.tsx
git commit -m "feat(AddProviderModal): add dual URL inputs with dual_protocol checkbox"
```

---

### Task 16: 更新 App.tsx addProvider 函数

**Objective:** 使用新的 Payload 字段创建 Provider

**Files:**
- Modify: `src/App.tsx:181-199`

**Step 1: 更新 addProvider 函数**

```tsx
function addProvider(input: AddProviderPayload) {
  const nextProvider: Provider = {
    id: createProviderId(input.name, config!.providers),
    name: input.name,
    anthropic_url: input.anthropicUrl,
    openai_url: input.openaiUrl,
    dual_protocol: input.dualProtocol,
    protocol: "Anthropic",
    auth_scheme: "ApiKey",
    api_key: input.apiKey,
    models: input.modelIds.map((modelId) => ({
      id: modelId,
      name: modelId,
      enabled: true,
    })),
    enabled: true,
    priority: Math.max(0, ...config!.providers.map((provider) => provider.priority)) + 1,
  };

  updateAndSave({ ...config!, providers: [...config!.providers, nextProvider] });
}
```

**Step 2: TypeScript 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无类型错误

**Step 3: 提交**

```bash
git add src/App.tsx
git commit -m "feat(App): use dual URL fields when adding provider"
```

---

## Phase 5: 集成测试与清理

### Task 17: 删除 base_url 字段（完成迁移）

**Objective:** 移除 Provider 结构体中的 base_url 字段

**Files:**
- Modify: `src-tauri/src/config.rs`
- Modify: `src/types.ts`

**Step 1: 从 Rust Provider 移除 base_url**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub anthropic_url: String,
    pub openai_url: String,
    pub dual_protocol: bool,
    pub protocol: Protocol,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub auth_scheme: Option<AuthScheme>,
    #[serde(default)]
    pub api_key: String,
    pub models: Vec<Model>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub priority: u32,
}
```

**Step 2: 从 TypeScript Provider 移除 base_url**

```typescript
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

**Step 3: 编译验证**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo check && cd .. && pnpm tsc --noEmit`
Expected: 编译成功，无类型错误

**Step 4: 提交**

```bash
git add src-tauri/src/config.rs src/types.ts
git commit -m "refactor: remove deprecated base_url field from Provider"
```

---

### Task 18: 运行完整测试套件

**Objective:** 验证所有测试通过

**Files:**
- 无文件修改

**Step 1: 运行 Rust 测试**

Run: `cd /Volumes/T7/Code/freemodel-auto-router/src-tauri && cargo test`
Expected: 所有测试通过

**Step 2: 运行 TypeScript 类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 3: 启动开发环境验证**

Run: `pnpm tauri dev`
Expected: 应用启动正常，UI 显示正确

---

### Task 19: 更新 CLAUDE.md 文档

**Objective:** 更新项目文档反映新的架构

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 更新 Provider 结构体说明**

将架构部分的 Provider 描述更新为：

```
### 后端模块（`src-tauri/src/``）

| 文件 | 职责 |
|---|---|
| `config.rs` | `AppConfig` / `Provider` / `QueueItem` / `AuthScheme` 结构体；Provider 包含 `anthropic_url`、`openai_url`、`dual_protocol` 字段；自动迁移旧 `base_url` 格式 |
| `proxy.rs` | axum HTTP 代理；根据路径前缀 `/anthropic` 或 `/openai` 路由请求；Anthropic 路径按 `protocol` 处理认证，OpenAI 路径固定 Bearer 认证 |
```

**Step 2: 更新数据流描述**

```
### 数据流

```
Claude Code → http://localhost:7860/anthropic/v1/messages
Codex/Hermes/OpenClaw → http://localhost:7860/openai/v1/chat/completions
                    ↓
             RouterState (RwLock)
             读取 active_entry() → 当前队列第一项
                    ↓
             根据路径前缀选择 URL：
               /anthropic → provider.anthropic_url
               /openai → provider.openai_url
             转发请求，注入认证头
                    ↓
             429/503 → record_failure() → 切换下一队列项
             → 发送 watch channel 消息
             → Tauri emit "provider-switched" → 前端系统通知
```
```

**Step 3: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for dual URL architecture"
```

---

### Task 20: 最终集成测试

**Objective:** 手动验证完整功能流程

**Files:**
- 无文件修改

**Step 1: 启动应用**

Run: `pnpm tauri dev`

**Step 2: 验证功能**

1. 检查内置供应商（OpenRouter、LongCat）URL 显示正确
2. 添加新供应商，验证双 URL 输入和 dual_protocol checkbox
3. 启动 Claude Code 注入，检查 settings.json 中 ANTHROPIC_BASE_URL 是否包含 `/anthropic` 前缀
4. 启动 Codex 注入，检查 config.toml 中 base_url 是否包含 `/openai` 前缀
5. 发送测试请求，验证代理日志显示正确的路由路径

**Step 3: 如有问题修复并提交**

---

## 验收清单

- [ ] Provider 结构体包含 `anthropic_url`、`openai_url`、`dual_protocol` 字段
- [ ] 旧 `base_url` 配置自动迁移到新字段
- [ ] 代理根据 `/anthropic` 或 `/openai` 前缀路由请求
- [ ] Claude Code 注入使用 `/anthropic` 前缀
- [ ] Codex/Hermes/OpenClaw 注入使用 `/openai` 前缀
- [ ] 前端 AddProviderModal 支持双 URL 配置和 dual_protocol checkbox
- [ ] 所有 Rust 测试通过
- [ ] TypeScript 类型检查无错误
- [ ] 应用启动正常，功能完整