# Multi-App Switch 实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 将顶部 header 的单一 CC 开关改为 4 个独立应用开关（CC、Codex、Hermes、OpenClaw），每个开关可独立开/关，启用时向对应应用写入完整供应商配置。

**Architecture:** 新增 3 个 Rust 配置模块（codex_settings / hermes_settings / openclaw_settings），每个模块暴露 inject/remove 函数；在 lib.rs 注册 6 个新 Tauri 命令；前端新增 AppToggle 组件，替换原有单 toggle，迁移 proxyEnabled → appStates.cc。

**Tech Stack:** Rust (serde_json, serde_yaml, toml), Tauri v2, React + TypeScript

---

## Task 1：新增 codex_settings.rs

**Objective:** 实现向 `~/.codex/auth.json` 和 `~/.codex/config.toml` 写入/清理代理配置的两个函数。

**Files:**
- Create: `src-tauri/src/codex_settings.rs`

**Step 1: 创建文件，写入以下完整内容**

```rust
use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use crate::config::Provider;

fn codex_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".codex")
}

pub fn inject(provider: &Provider) -> Result<()> {
    let dir = codex_dir();
    fs::create_dir_all(&dir)?;

    // auth.json
    let auth_path = dir.join("auth.json");
    let auth_tmp = auth_path.with_extension("tmp");
    let auth_json = serde_json::json!({ "OPENAI_API_KEY": provider.api_key });
    fs::write(&auth_tmp, serde_json::to_string_pretty(&auth_json)?)?;
    fs::rename(&auth_tmp, &auth_path)?;

    // config.toml
    let model_id = provider.models.first().map(|m| m.id.as_str()).unwrap_or("");
    let config_content = format!(
        "model = \"{}\"\n\n[provider]\nbase_url = \"{}\"\n",
        model_id, provider.base_url
    );
    let config_path = dir.join("config.toml");
    let config_tmp = config_path.with_extension("tmp");
    fs::write(&config_tmp, &config_content)?;
    fs::rename(&config_tmp, &config_path)?;

    Ok(())
}

pub fn remove() -> Result<()> {
    let dir = codex_dir();

    let auth_path = dir.join("auth.json");
    if auth_path.exists() {
        let auth_tmp = auth_path.with_extension("tmp");
        fs::write(&auth_tmp, "{}")?;
        fs::rename(&auth_tmp, &auth_path)?;
    }

    let config_path = dir.join("config.toml");
    if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        // Remove the [provider] section and everything after it
        let cleaned = content
            .lines()
            .take_while(|line| !line.trim_start().starts_with("[provider]"))
            .collect::<Vec<_>>()
            .join("\n");
        let config_tmp = config_path.with_extension("tmp");
        fs::write(&config_tmp, cleaned.trim_end())?;
        fs::rename(&config_tmp, &config_path)?;
    }

    Ok(())
}
```

**Step 2: 验证编译**

```bash
cd /Volumes/T7/Code/freemodel-auto-router
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -20
```
期待：lib.rs 报 `codex_settings` 未声明的警告，但没有 codex_settings.rs 内部错误。（需要在下一步 Task 2 中注册模块后才能完整编译。）

**Step 3: Commit**

```bash
git add src-tauri/src/codex_settings.rs
git commit -m "feat: add codex_settings inject/remove"
```

---

## Task 2：新增 hermes_settings.rs

**Objective:** 实现向 `~/.hermes/config.yaml` 的 `custom_providers` 列表 upsert/删除供应商配置。

**Files:**
- Create: `src-tauri/src/hermes_settings.rs`

**Step 1: 确认 Cargo.toml 已有 serde_yaml 依赖**

```bash
grep "serde_yaml" /Volumes/T7/Code/freemodel-auto-router/src-tauri/Cargo.toml
```

若没有输出，在 `[dependencies]` 中追加：
```toml
serde_yaml = "0.9"
```

**Step 2: 创建文件，写入以下完整内容**

```rust
use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use serde_json::Value;
use crate::config::Provider;

fn hermes_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".hermes")
        .join("config.yaml")
}

pub fn inject(provider: &Provider) -> Result<()> {
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

    let model_id = provider.models.first().map(|m| m.id.as_str()).unwrap_or("").to_string();

    // Build the provider entry
    let mut provider_entry = serde_yaml::Mapping::new();
    provider_entry.insert(
        serde_yaml::Value::String("name".into()),
        serde_yaml::Value::String(provider.id.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("base_url".into()),
        serde_yaml::Value::String(provider.base_url.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("api_key".into()),
        serde_yaml::Value::String(provider.api_key.clone()),
    );
    provider_entry.insert(
        serde_yaml::Value::String("model".into()),
        serde_yaml::Value::String(model_id.clone()),
    );

    // models map
    let mut models_map = serde_yaml::Mapping::new();
    let mut model_entry = serde_yaml::Mapping::new();
    model_entry.insert(
        serde_yaml::Value::String("context_length".into()),
        serde_yaml::Value::Number(200000.into()),
    );
    models_map.insert(
        serde_yaml::Value::String(model_id),
        serde_yaml::Value::Mapping(model_entry),
    );
    provider_entry.insert(
        serde_yaml::Value::String("models".into()),
        serde_yaml::Value::Mapping(models_map),
    );

    let provider_value = serde_yaml::Value::Mapping(provider_entry);

    // Upsert into custom_providers sequence
    let root = doc.as_mapping_mut().unwrap();
    let key = serde_yaml::Value::String("custom_providers".into());
    if let Some(seq) = root.get_mut(&key).and_then(|v| v.as_sequence_mut()) {
        // Replace existing entry with same name, or push
        let name_key = serde_yaml::Value::String("name".into());
        let name_val = serde_yaml::Value::String(provider.id.clone());
        if let Some(pos) = seq.iter().position(|e| {
            e.as_mapping()
                .and_then(|m| m.get(&name_key))
                == Some(&name_val)
        }) {
            seq[pos] = provider_value;
        } else {
            seq.push(provider_value);
        }
    } else {
        root.insert(
            key,
            serde_yaml::Value::Sequence(vec![provider_value]),
        );
    }

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_yaml::to_string(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn remove(provider_id: &str) -> Result<()> {
    let path = hermes_config_path();
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path)?;
    let mut doc: serde_yaml::Value = serde_yaml::from_str(&content)?;

    let root = doc.as_mapping_mut().unwrap();
    let key = serde_yaml::Value::String("custom_providers".into());
    if let Some(seq) = root.get_mut(&key).and_then(|v| v.as_sequence_mut()) {
        let name_key = serde_yaml::Value::String("name".into());
        let name_val = serde_yaml::Value::String(provider_id.to_string());
        seq.retain(|e| {
            e.as_mapping()
                .and_then(|m| m.get(&name_key))
                != Some(&name_val)
        });
    }

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_yaml::to_string(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
```

> 注意：`remove` 函数签名比设计文档多了 `provider_id: &str` 参数，便于 Additive 模式精确删除，Tauri 命令层传 provider.id。

**Step 3: Commit**

```bash
git add src-tauri/src/hermes_settings.rs src-tauri/Cargo.toml
git commit -m "feat: add hermes_settings inject/remove"
```

---

## Task 3：新增 openclaw_settings.rs

**Objective:** 实现向 `~/.openclaw/openclaw.json` 的 `models.providers` 键 upsert/删除供应商配置。

**Files:**
- Create: `src-tauri/src/openclaw_settings.rs`

**Step 1: 创建文件，写入以下完整内容**

```rust
use anyhow::Result;
use std::fs;
use std::path::PathBuf;
use serde_json::{json, Value};
use crate::config::Provider;

fn openclaw_config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".openclaw")
        .join("openclaw.json")
}

pub fn inject(provider: &Provider) -> Result<()> {
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
        "baseUrl": provider.base_url,
        "apiKey": provider.api_key,
        "models": models,
    });

    // Ensure nested path exists: doc.models.providers
    let obj = doc.as_object_mut().unwrap();
    let models_obj = obj
        .entry("models")
        .or_insert_with(|| json!({}))
        .as_object_mut()
        .unwrap()
        .entry("providers")
        .or_insert_with(|| json!({}));

    models_obj
        .as_object_mut()
        .unwrap()
        .insert(provider.id.clone(), provider_entry);

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn remove(provider_id: &str) -> Result<()> {
    let path = openclaw_config_path();
    if !path.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&path)?;
    let mut doc: Value = serde_json::from_str(&content).unwrap_or_else(|_| json!({}));

    if let Some(providers) = doc
        .get_mut("models")
        .and_then(|m| m.get_mut("providers"))
        .and_then(|p| p.as_object_mut())
    {
        providers.remove(provider_id);
    }

    let tmp = path.with_extension("tmp");
    fs::write(&tmp, serde_json::to_string_pretty(&doc)?)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}
```

**Step 2: Commit**

```bash
git add src-tauri/src/openclaw_settings.rs
git commit -m "feat: add openclaw_settings inject/remove"
```

---

## Task 4：在 lib.rs 注册新模块和命令

**Objective:** 将 3 个新 settings 模块接入 Tauri，注册 6 个新命令，并在退出时清理所有已注入的应用配置。

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: 在文件顶部已有的 `mod` 声明后追加 3 行**

在 `mod claude_settings;` 那一行之后添加：

```rust
mod codex_settings;
mod hermes_settings;
mod openclaw_settings;
```

**Step 2: 在 `invoke_handler` 的 `generate_handler![]` 列表末尾追加 6 个命令**

```rust
inject_codex_cmd,
remove_codex_cmd,
inject_hermes_cmd,
remove_hermes_cmd,
inject_openclaw_cmd,
remove_openclaw_cmd,
```

**Step 3: 在文件末尾（`is_injected_cmd` 之后）追加 6 个命令函数**

```rust
#[tauri::command]
fn inject_codex_cmd(provider: config::Provider) -> Result<(), String> {
    codex_settings::inject(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_codex_cmd() -> Result<(), String> {
    codex_settings::remove().map_err(|e| e.to_string())
}

#[tauri::command]
fn inject_hermes_cmd(provider: config::Provider) -> Result<(), String> {
    hermes_settings::inject(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_hermes_cmd(provider_id: String) -> Result<(), String> {
    hermes_settings::remove(&provider_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn inject_openclaw_cmd(provider: config::Provider) -> Result<(), String> {
    openclaw_settings::inject(&provider).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_openclaw_cmd(provider_id: String) -> Result<(), String> {
    openclaw_settings::remove(&provider_id).map_err(|e| e.to_string())
}
```

> 注意：hermes 和 openclaw 的 remove 命令需要传 `provider_id` 参数（Additive 模式），前端在调用时传入 `activeProvider.id`。

**Step 4: 验证编译通过**

```bash
cargo check --manifest-path /Volumes/T7/Code/freemodel-auto-router/src-tauri/Cargo.toml 2>&1
```

期待：无 error，仅允许 warning。

**Step 5: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register codex/hermes/openclaw Tauri commands"
```

---

## Task 5：更新 api.ts

**Objective:** 在前端 API 层添加 6 个新调用函数。

**Files:**
- Modify: `src/api.ts`

**Step 1: 在文件末尾追加以下内容**

```ts
import type { Provider } from "./types";

export const injectCodex    = (provider: Provider): Promise<void> => invoke("inject_codex_cmd", { provider });
export const removeCodex    = (): Promise<void>                    => invoke("remove_codex_cmd");
export const injectHermes   = (provider: Provider): Promise<void> => invoke("inject_hermes_cmd", { provider });
export const removeHermes   = (providerId: string): Promise<void> => invoke("remove_hermes_cmd", { providerId });
export const injectOpenclaw = (provider: Provider): Promise<void> => invoke("inject_openclaw_cmd", { provider });
export const removeOpenclaw = (providerId: string): Promise<void> => invoke("remove_openclaw_cmd", { providerId });
```

> 注意：`invoke` 已在文件顶部从 `@tauri-apps/api/core` 导入，`Provider` 类型从 `./types` 导入（检查顶部是否已导入，若有则不重复）。

**Step 2: 检查 api.ts 顶部是否已导入 Provider**

若顶部只有 `import type { AppConfig, ProxyLogEntry } from "./types";`，则改为：

```ts
import type { AppConfig, ProxyLogEntry, Provider } from "./types";
```

并删除步骤 1 中单独的 `import type { Provider }` 行。

**Step 3: 运行 TypeScript 类型检查**

```bash
cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit 2>&1
```

期待：无 error。

**Step 4: Commit**

```bash
git add src/api.ts
git commit -m "feat: add codex/hermes/openclaw api functions"
```

---

## Task 6：新增 AppToggle 组件

**Objective:** 创建可复用的应用开关组件，支持彩色徽章、toggle 滑块、disabled 状态。

**Files:**
- Create: `src/components/AppToggle.tsx`

**Step 1: 创建文件，写入以下完整内容**

```tsx
interface AppToggleProps {
  label: string;
  color: string;
  enabled: boolean;
  disabled?: boolean;
  title?: string;
  onToggle: () => Promise<void>;
}

export function AppToggle({ label, color, enabled, disabled, title, onToggle }: AppToggleProps) {
  const activeColor = enabled ? color : "var(--fm-ink-faint)";
  const borderColor = enabled ? color : "var(--fm-color-hairline)";

  return (
    <div
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "var(--fm-color-surface-soft)",
        borderRadius: "8px",
        padding: "5px 10px",
        border: `1px solid ${borderColor}`,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        transition: "border-color 0.2s, opacity 0.2s",
        userSelect: "none",
      }}
      onClick={async () => {
        if (disabled) return;
        try {
          await onToggle();
        } catch (e) {
          console.error(e);
        }
      }}
    >
      {/* Badge */}
      <span style={{
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.5px",
        padding: "1px 4px",
        borderRadius: "3px",
        background: enabled ? color : "var(--fm-color-hairline)",
        color: enabled ? "#fff" : "var(--fm-ink-faint)",
        transition: "background 0.2s, color 0.2s",
        fontFamily: "var(--fm-font-mono)",
      }}>
        {label}
      </span>
      {/* Toggle track */}
      <div style={{
        position: "relative",
        width: "24px",
        height: "14px",
        borderRadius: "7px",
        background: enabled ? color : "var(--fm-ink-faint)",
        transition: "background 0.2s",
        flexShrink: 0,
      }}>
        <div style={{
          position: "absolute",
          top: "2px",
          left: enabled ? "12px" : "2px",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
        }} />
      </div>
    </div>
  );
}
```

**Step 2: 运行类型检查**

```bash
cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit 2>&1
```

**Step 3: Commit**

```bash
git add src/components/AppToggle.tsx
git commit -m "feat: add AppToggle component"
```

---

## Task 7：改造 App.tsx — 状态迁移

**Objective:** 将 `proxyEnabled` 状态替换为 `appStates` 对象，更新所有引用 `proxyEnabled` 的地方（逻辑层，不涉及 UI 渲染部分）。

**Files:**
- Modify: `src/App.tsx`

**Step 1: 更新导入列表**

在 `App.tsx` 顶部的 `import ... from "./api"` 行，追加新函数：

```ts
import {
  getConfig,
  saveConfig,
  injectProxy,
  updateActive,
  restoreBackup,
  isInjected,
  restartProxy,
  injectCodex, removeCodex,
  injectHermes, removeHermes,
  injectOpenclaw, removeOpenclaw,
} from "./api";
```

同时追加 AppToggle 组件导入：

```ts
import { AppToggle } from "./components/AppToggle";
```

**Step 2: 替换状态声明**

将：
```ts
const [proxyEnabled, setProxyEnabled] = useState(false);
```

改为：
```ts
const [appStates, setAppStates] = useState({
  cc: false,
  codex: false,
  hermes: false,
  openclaw: false,
});
```

**Step 3: 更新 isInjected 初始化 effect**

将：
```ts
useEffect(() => {
  if (config) isInjected(config.port).then(setProxyEnabled).catch(console.error);
}, [config?.port]);
```

改为：
```ts
useEffect(() => {
  if (config) isInjected(config.port).then((v) => setAppStates(prev => ({ ...prev, cc: v }))).catch(console.error);
}, [config?.port]);
```

**Step 4: 更新 updateActive effect**

将 effect 里的 `proxyEnabled` 替换为 `appStates.cc`：

```ts
useEffect(() => {
  if (!appStates.cc || !config) return;
  const head = config.queue[0];
  if (!head) return;
  const provider = config.providers.find((p) => p.id === head.provider_id);
  if (!provider || provider.api_key.trim().length === 0) return;
  updateActive(provider.api_key, head.model_id).catch(console.error);
}, [
  appStates.cc,
  config?.queue[0]?.provider_id,
  config?.queue[0]?.model_id,
  config?.queue[0]
    ? config.providers.find((p) => p.id === config.queue[0].provider_id)?.api_key
    : undefined,
]);
```

**Step 5: 更新 removeFromQueue 函数**

将：
```ts
if (queue.length === 0 && proxyEnabled) {
  restoreBackup().catch(console.error);
  setProxyEnabled(false);
}
```

改为：
```ts
if (queue.length === 0) {
  if (appStates.cc) { restoreBackup().catch(console.error); }
  if (appStates.codex) { removeCodex().catch(console.error); }
  if (appStates.hermes && activeProvider) { removeHermes(activeProvider.id).catch(console.error); }
  if (appStates.openclaw && activeProvider) { removeOpenclaw(activeProvider.id).catch(console.error); }
  setAppStates({ cc: false, codex: false, hermes: false, openclaw: false });
}
```

**Step 6: 更新 SettingsModal 的 onSave 回调**

将 `proxyEnabled` → `appStates.cc`，`setProxyEnabled(false)` 删除（端口变更只影响 CC 的重注入）：

```ts
onSave={(retry, newPort, portChanged) => {
  const next = { ...config, retry, port: newPort };
  updateAndSave(next);
  if (portChanged) {
    restartProxy(newPort).then(() => {
      if (appStates.cc) {
        const head = next.queue[0];
        const p = head ? next.providers.find((pr) => pr.id === head.provider_id) : undefined;
        if (p && p.api_key.trim()) {
          injectProxy(newPort, p.api_key, head.model_id).catch(console.error);
        }
      }
      setShowSettings(false);
    }).catch(console.error);
  }
}}
```

**Step 7: 类型检查（预期还有 UI 层的报错，先忽略 JSX 部分）**

```bash
cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit 2>&1 | grep -v "\.tsx.*JSX"
```

**Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: migrate proxyEnabled to appStates in App.tsx logic"
```

---

## Task 8：改造 App.tsx — UI 层替换开关

**Objective:** 将 header 中的旧 CC toggle div 替换为居中排布的 4 个 AppToggle，并接入各自的 toggle 逻辑。

**Files:**
- Modify: `src/App.tsx`

**Step 1: 将 header 容器改为 `justify-content: space-between` 的三列布局**

当前 header 的最外层 div 有 `justifyContent: "space-between"`，左侧是 logo，右侧是按钮组。

将右侧 `<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>` 这整个 div **重构**为三块区域：

```tsx
{/* Top Nav */}
<div className="fm-top-nav" style={{
  padding: "0 24px",
  height: "56px",
  display: "grid",
  gridTemplateColumns: "1fr auto 1fr",
  alignItems: "center",
  flexShrink: 0,
  borderBottom: "1px solid var(--fm-color-hairline)",
}}>
  {/* Left: Logo */}
  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
    {/* ... 保留原有 logo 代码不变 ... */}
  </div>

  {/* Center: 4 App Toggles */}
  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
    <AppToggle
      label="CC"
      color="#84cc16"
      enabled={appStates.cc}
      disabled={!isActive}
      title={!isActive ? "队列为空，无法启用" : appStates.cc ? "关闭 Claude Code 注入" : "注入到 Claude Code 配置"}
      onToggle={async () => {
        if (appStates.cc) {
          await restoreBackup();
          setAppStates(prev => ({ ...prev, cc: false }));
        } else {
          await injectProxy(config.port, activeProvider!.api_key, activeModel!.id);
          setAppStates(prev => ({ ...prev, cc: true }));
        }
      }}
    />
    <AppToggle
      label="CX"
      color="#0ea5e9"
      enabled={appStates.codex}
      disabled={!isActive}
      title={!isActive ? "队列为空，无法启用" : appStates.codex ? "关闭 Codex 注入" : "注入到 Codex 配置"}
      onToggle={async () => {
        if (appStates.codex) {
          await removeCodex();
          setAppStates(prev => ({ ...prev, codex: false }));
        } else {
          await injectCodex(activeProvider!);
          setAppStates(prev => ({ ...prev, codex: true }));
        }
      }}
    />
    <AppToggle
      label="HM"
      color="#8b5cf6"
      enabled={appStates.hermes}
      disabled={!isActive}
      title={!isActive ? "队列为空，无法启用" : appStates.hermes ? "关闭 Hermes 注入" : "注入到 Hermes 配置"}
      onToggle={async () => {
        if (appStates.hermes) {
          await removeHermes(activeProvider!.id);
          setAppStates(prev => ({ ...prev, hermes: false }));
        } else {
          await injectHermes(activeProvider!);
          setAppStates(prev => ({ ...prev, hermes: true }));
        }
      }}
    />
    <AppToggle
      label="OC"
      color="#f59e0b"
      enabled={appStates.openclaw}
      disabled={!isActive}
      title={!isActive ? "队列为空，无法启用" : appStates.openclaw ? "关闭 OpenClaw 注入" : "注入到 OpenClaw 配置"}
      onToggle={async () => {
        if (appStates.openclaw) {
          await removeOpenclaw(activeProvider!.id);
          setAppStates(prev => ({ ...prev, openclaw: false }));
        } else {
          await injectOpenclaw(activeProvider!);
          setAppStates(prev => ({ ...prev, openclaw: true }));
        }
      }}
    />
  </div>

  {/* Right: Server status + 日志 + 设置 */}
  <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
    {/* 服务器状态 pill */}
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "8px",
      background: "var(--fm-color-surface-soft)",
      borderRadius: "8px",
      padding: "6px 12px",
      border: "1px solid var(--fm-color-hairline)",
    }}>
      <span className="fm-caption">服务器状态</span>
      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--fm-success)", opacity: 0.7 }} />
      <span className="fm-caption" style={{ fontFamily: "var(--fm-font-mono)" }}>:{config.port}</span>
    </div>

    {/* 日志按钮 — 保留原有代码 */}
    <button onClick={() => setShowLogs(true)} className="fm-btn-secondary" aria-label="打开代理日志">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h10M3 8h10M3 13h6"/>
      </svg>
      日志
    </button>

    {/* 设置按钮 — 保留原有代码 */}
    <button onClick={() => setShowSettings(true)} className="fm-btn-secondary" aria-label="打开设置">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="8" r="2.5"/>
        <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
      </svg>
      设置
    </button>
  </div>
</div>
```

**Step 2: 运行类型检查**

```bash
cd /Volumes/T7/Code/freemodel-auto-router && pnpm tsc --noEmit 2>&1
```

期待：无 error。

**Step 3: 在浏览器中验证（启动前端开发模式）**

```bash
cd /Volumes/T7/Code/freemodel-auto-router && pnpm dev
```

检查：
- header 中央出现 4 个开关（CC / CX / HM / OC）
- 队列为空时 4 个开关均为 disabled 状态（半透明）
- 点击 CC 开关可切换激活状态（颜色变化）

**Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: replace CC toggle with 4-app switch in header"
```

---

## Task 9：端到端冒烟测试

**Objective:** 验证 4 个应用开关的完整写入/清理逻辑在真实 Tauri 环境下正常工作。

**Files:** 无

**Step 1: 启动完整 Tauri 开发环境**

```bash
cd /Volumes/T7/Code/freemodel-auto-router && pnpm tauri dev
```

**Step 2: 准备测试前置条件**

- 确认队列中有至少一个带 api_key 的供应商
- 如果 `~/.codex`、`~/.hermes`、`~/.openclaw` 不存在，让应用自动创建

**Step 3: 测试 CC 开关**

1. 点击 [CC] 开关 → 变为 lime 激活色
2. 验证：`cat ~/.claude/settings.json | grep ANTHROPIC_BASE_URL` 应输出 `"http://localhost:7860"`
3. 再次点击 [CC] → 变灰
4. 验证：settings.json 中 `ANTHROPIC_BASE_URL` 已移除

**Step 4: 测试 CX (Codex) 开关**

1. 点击 [CX] → 变为 sky 激活色
2. 验证：`cat ~/.codex/auth.json` 应有 `OPENAI_API_KEY`
3. 验证：`cat ~/.codex/config.toml` 应有 `base_url`
4. 再次点击 [CX] → 变灰
5. 验证：`~/.codex/auth.json` 变为 `{}`

**Step 5: 测试 HM (Hermes) 开关**

1. 点击 [HM] → 变为 violet 激活色
2. 验证：`cat ~/.hermes/config.yaml | grep custom_providers` 应输出供应商条目
3. 再次点击 → 变灰
4. 验证：`custom_providers` 中对应条目已移除

**Step 6: 测试 OC (OpenClaw) 开关**

1. 点击 [OC] → 变为 amber 激活色
2. 验证：`cat ~/.openclaw/openclaw.json | python3 -m json.tool | grep baseUrl` 应有代理地址
3. 再次点击 → 变灰
4. 验证：`models.providers` 中对应键已移除

**Step 7: 测试队列清空时的清理**

1. 同时激活 CC + CX
2. 移除队列中所有项目
3. 验证两个配置文件均已清理

**Step 8: 最终 Commit**

```bash
git add -A
git commit -m "test: multi-app switch smoke test passed"
```

---

## 完成标准

- [ ] `cargo check` 无 error
- [ ] `pnpm tsc --noEmit` 无 error  
- [ ] 4 个开关在 header 居中显示，各自颜色正确
- [ ] 队列为空时 4 个开关均 disabled
- [ ] CC 开关写入/清理 `~/.claude/settings.json` 正常
- [ ] CX 开关写入/清理 `~/.codex/` 正常
- [ ] HM 开关写入/清理 `~/.hermes/config.yaml` 正常
- [ ] OC 开关写入/清理 `~/.openclaw/openclaw.json` 正常
