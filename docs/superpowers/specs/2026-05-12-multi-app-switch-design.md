# Multi-App Switch 设计文档

**日期：** 2026-05-12  
**状态：** 已批准

## 1. 目标

将顶部 header 右上角的单一「接入 CC」开关，改为居中展示的 4 个独立应用开关（Claude Code、Codex、Hermes、OpenClaw），每个开关用彩色文字缩写徽章标识，可独立开/关。

## 2. UI 布局

顶部 header 结构调整：

```
┌─────────────────────────────────────────────────────────────────┐
│  [logo] freemodel router     [CC][CX][HM][OC]    [日志][设置]   │
│                              ↑ 居中，4 个独立开关                │
└─────────────────────────────────────────────────────────────────┘
```

### 开关单元样式

每个开关为一个胶囊形按钮，内含彩色徽章 + toggle 滑块：

```
未激活：灰色边框，灰色徽章，灰色文字
┌──────────────┐
│ [CC]  ○      │
└──────────────┘

激活中：主色边框，彩色徽章，对应主色文字
┌──────────────┐
│ [CC]  ●      │
└──────────────┘
```

### 徽章颜色

| 应用 | 缩写 | 颜色 |
|---|---|---|
| Claude Code | CC | lime（`#84cc16`） |
| Codex | CX | sky（`#0ea5e9`） |
| Hermes | HM | violet（`#8b5cf6`） |
| OpenClaw | OC | amber（`#f59e0b`） |

激活时按钮 border 和文字使用对应徽章颜色；未激活时统一使用 `--fm-color-hairline` 和 `--fm-ink-faint`。

## 3. 架构

### 3.1 新增 Rust 模块

| 文件 | 职责 |
|---|---|
| `src-tauri/src/codex_settings.rs` | 写/清理 `~/.codex/auth.json` + `~/.codex/config.toml` |
| `src-tauri/src/hermes_settings.rs` | 写/清理 `~/.hermes/config.yaml` 的 `custom_providers` 节 |
| `src-tauri/src/openclaw_settings.rs` | 写/清理 `~/.openclaw/openclaw.json` 的 `models.providers` 节 |

每个模块对外暴露：

```rust
pub fn inject(provider: &Provider) -> Result<()>
pub fn remove() -> Result<()>
```

### 3.2 各工具配置写入格式

#### Codex（Switch 模式）

`~/.codex/auth.json`：
```json
{
  "OPENAI_API_KEY": "<provider.api_key>"
}
```

`~/.codex/config.toml`：
```toml
model = "<provider.models[0].id>"

[provider]
base_url = "<provider.base_url>"
```

原子写入：先写 `.tmp` 再 rename，失败回滚。`remove()` 清空 auth.json 为 `{}`，config.toml 中移除 `[provider]` 节。

#### Hermes（Additive 模式）

`~/.hermes/config.yaml` 的 `custom_providers` 列表 upsert（按 `name` 匹配）：
```yaml
custom_providers:
  - name: <provider.id>
    base_url: <provider.base_url>
    api_key: <provider.api_key>
    model: <provider.models[0].id>
    models:
      <model.id>:
        context_length: 200000
```

`remove()` 从 `custom_providers` 列表删除对应 `name` 的条目。

#### OpenClaw（Additive 模式）

`~/.openclaw/openclaw.json` 的 `models.providers.<provider.id>` 键 upsert：
```json5
{
  models: {
    providers: {
      "<provider.id>": {
        baseUrl: "<provider.base_url>",
        apiKey: "<provider.api_key>",
        models: [{ id: "<model.id>" }]
      }
    }
  }
}
```

`remove()` 删除 `models.providers.<provider.id>` 键。

### 3.3 新增 Tauri 命令

在 `lib.rs` 中注册：

```rust
inject_codex_cmd(provider: Provider) -> Result<(), String>
remove_codex_cmd()                   -> Result<(), String>
inject_hermes_cmd(provider: Provider) -> Result<(), String>
remove_hermes_cmd()                   -> Result<(), String>
inject_openclaw_cmd(provider: Provider) -> Result<(), String>
remove_openclaw_cmd()                   -> Result<(), String>
```

`Provider` 结构体通过 `#[derive(Deserialize)]` 从前端反序列化。

### 3.4 前端状态

`App.tsx` 新增：

```ts
const [appStates, setAppStates] = useState({
  cc: false,
  codex: false,
  hermes: false,
  openclaw: false,
});
```

原有 `proxyEnabled` 状态迁移为 `appStates.cc`。

### 3.5 新增前端组件

`src/components/AppToggle.tsx`：

```ts
interface AppToggleProps {
  label: string;       // "CC" | "CX" | "HM" | "OC"
  color: string;       // 激活时的主色（hex）
  enabled: boolean;
  disabled?: boolean;  // 队列为空时禁用
  title?: string;
  onToggle: () => Promise<void>;
}
```

### 3.6 api.ts 新增

```ts
export const injectCodex    = (provider: Provider) => invoke("inject_codex_cmd", { provider });
export const removeCodex    = ()                    => invoke("remove_codex_cmd");
export const injectHermes   = (provider: Provider) => invoke("inject_hermes_cmd", { provider });
export const removeHermes   = ()                    => invoke("remove_hermes_cmd");
export const injectOpenclaw = (provider: Provider) => invoke("inject_openclaw_cmd", { provider });
export const removeOpenclaw = ()                    => invoke("remove_openclaw_cmd");
```

## 4. 数据流

### 开启某应用（以 Codex 为例）

```
用户点击 [CX] 开关
    ↓
前端取 activeProvider = config.providers.find(p => p.id === config.queue[0].provider_id)
    ↓
invoke("inject_codex_cmd", { provider: activeProvider })
    ↓
codex_settings::inject(&provider)
  → 写 ~/.codex/auth.json
  → 写 ~/.codex/config.toml
    ↓
setAppStates(prev => ({ ...prev, codex: true }))
```

### 关闭某应用

```
用户点击已激活的 [CX] 开关
    ↓
invoke("remove_codex_cmd")
    ↓
codex_settings::remove()
  → 清理 ~/.codex/auth.json + config.toml
    ↓
setAppStates(prev => ({ ...prev, codex: false }))
```

### 队列变更时同步已激活的应用

当 `config.queue[0]` 变更（供应商切换事件），对所有 `appStates[x] === true` 的应用重新调用对应 inject 命令，更新配置为新的活跃供应商。

## 5. 边界条件

| 场景 | 处理 |
|---|---|
| 队列为空时点击开关 | 按钮 disabled，tooltip 提示「队列为空，无法启用」 |
| inject 失败 | console.error，不更新 appStates，用户看到按钮未变化 |
| 应用退出时 | 各已激活应用调用 remove，与 CC 的 remove_proxy 逻辑并行执行 |
| 配置文件不存在 | inject 时自动创建目录和文件（`fs::create_dir_all`） |

## 6. 不在本次范围内

- 各应用的 MCP server 同步（cc-switch 文档第 5 节）
- 从各工具 Live Config 导入到 freemodel 的反向流
- common config 合并逻辑
