# cc-switch 对 Codex / OpenClaw / Hermes-Agent 的配置更新机制

## 1. 总体架构

cc-switch 在本地维护一个 SQLite 数据库（`AppState` / `Database`），保存所有工具（Claude、Codex、Gemini、OpenClaw、Hermes 等）的供应商配置。当用户在 UI 中执行**切换供应商**、**编辑供应商**或**同步配置**时，Rust 后端会将变更写入各工具的磁盘配置文件（"Live Config"）。

```
用户操作（UI）
    ↓ Tauri invoke
Rust 后端命令（src-tauri/src/commands/）
    ↓ ProviderService::switch() / add() / update()
write_live_with_common_config()
    ↓ write_live_snapshot()
各工具的 Live Config 文件
```

---

## 2. 各工具配置文件位置

| 工具 | 配置文件 | 格式 | 可覆盖路径（settings） |
|---|---|---|---|
| **Codex** | `~/.codex/auth.json` | JSON | `codex_config_dir` |
| **Codex** | `~/.codex/config.toml` | TOML | 同上 |
| **OpenClaw** | `~/.openclaw/openclaw.json` | JSON5 | `openclaw_config_dir` |
| **Hermes** | `~/.hermes/config.yaml` | YAML | `hermes_config_dir` |

---

## 3. 操作模式差异

cc-switch 将工具分为两种模式：

| 模式 | 工具 | 含义 |
|---|---|---|
| **Switch 模式** | Codex、Claude、Gemini | 同一时刻只有一个活跃供应商；切换时覆写整个 Live Config |
| **Additive（累加）模式** | OpenClaw、Hermes、OpenCode | 所有供应商并存于同一文件；切换只影响"激活标记" |

---

## 4. 核心流程

### 4.1 切换供应商（`switch_provider` 命令）

前端调用 `invoke("switch_provider", { app, id })` → `ProviderService::switch()`：

```
ProviderService::switch()
 ├─ 检查代理接管模式（is proxy running?）
 │   └─ 若是：hot_switch_provider()，不写 Live Config，直接返回
 └─ 否则：switch_normal()
     ├─ 1. [Backfill] 读取当前 Live Config → 剥离 common config → 保存回 DB（仅 Switch 模式）
     ├─ 2. 更新 DB: set_current_provider(app, id)
     ├─ 3. write_live_with_common_config() → write_live_snapshot()  ← 写磁盘
     ├─ 4. [Hermes 专属] apply_switch_defaults()  ← 更新 model.provider
     ├─ 5. McpService::sync_all_enabled()  ← 同步 MCP 服务器配置
     └─ 6. SkillService::sync_to_app()  ← 同步 Skill 目录
```

### 4.2 写入 Live Config 的具体实现

#### Codex（Switch 模式）

**函数路径：** `write_live_snapshot()` → `write_codex_live_atomic_with_stable_provider(auth, config_text)`

**写入内容：**
- `auth` JSON 对象 → `~/.codex/auth.json`（包含 `OPENAI_API_KEY` 等认证字段）
- `config_text` TOML 字符串 → `~/.codex/config.toml`（模型、MCP server 等）

**原子性保障：** 先写 `.tmp` 文件再 `rename`；若第二步失败则回滚第一步。

**提供者配置结构：**
```json
{
  "auth": { "OPENAI_API_KEY": "sk-..." },
  "config": "[mcp_servers.xxx]\ntype = \"stdio\"\n..."
}
```

#### OpenClaw（Additive 模式）

**函数路径：** `write_live_snapshot()` → `openclaw_config::set_typed_provider(id, config)` 或 `set_provider(id, value)`

**写入位置：** `~/.openclaw/openclaw.json` 的 `models.providers.{id}` 键

**配置示例：**
```json5
// openclaw.json
{
  models: {
    mode: 'merge',
    providers: {
      "my-provider": {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "sk-or-...",
        models: [{ id: "anthropic/claude-opus-4-5" }]
      }
    }
  }
}
```

**并发安全：** 全局 `Mutex<()>` 写锁 + 原子文件写（tmp + rename）。

#### Hermes（Additive 模式）

**函数路径：** `write_live_snapshot()` → `hermes_config::set_provider(name, config)`

**写入位置：** `~/.hermes/config.yaml` 的 `custom_providers` YAML 序列（按 `name` 字段匹配 upsert）

**额外步骤（切换后）：** `apply_switch_defaults(provider_id, settings_config)` 更新顶层 `model:` 节

```yaml
# 切换后 hermes_config.rs 会自动更新
model:
  provider: "my-provider"        # ← 设为新供应商 id
  default: "anthropic/claude-opus-4-5"  # ← 设为该供应商第一个模型
```

**完整 custom_providers 示例：**
```yaml
custom_providers:
  - name: my-provider
    model: anthropic/claude-opus-4-5
    base_url: https://openrouter.ai/api/v1
    api_key: sk-or-...
    models:
      anthropic/claude-opus-4-5:
        context_length: 200000
```

---

## 5. MCP 服务器同步

每次供应商切换后，`McpService::sync_all_enabled()` 会将 cc-switch 中启用的 MCP 服务器写到各工具配置文件：

| 工具 | 写入位置 |
|---|---|
| Codex | `~/.codex/config.toml` → `[mcp_servers]` 节 |
| OpenClaw | `~/.openclaw/openclaw.json` → MCP 相关节 |
| Hermes | `~/.hermes/config.yaml` → `mcp_servers:` 节 |

切换 MCP 开关（前端 `toggle_app`）也会触发对应工具 Live Config 的同步写入。

---

## 6. 从 Live Config 导入到数据库（反向流）

| 工具 | 函数 | 行为 |
|---|---|---|
| Codex | `import_default_config(state, AppType::Codex)` | 读取 `auth.json` + `config.toml`，创建一个 `"default"` 供应商 |
| OpenClaw | `import_openclaw_providers_from_live(state)` | 遍历 `models.providers`，逐一写入 DB（跳过已存在的） |
| Hermes | `import_hermes_providers_from_live(state)` | 遍历 `custom_providers`，逐一写入 DB（跳过已存在的） |

**触发时机：** 应用启动时（`should_import_default_config_on_startup` 返回 true）或用户手动点击"从 Live 导入"。

---

## 7. Common Config（共享配置片段）

cc-switch 支持为每个工具提取一段"公共配置 snippet"（TOML 或 JSON 片段），在写 Live Config 时自动 **merge** 进去，切换前 **strip** 出来再保存回 DB。

```
DB Provider.settings_config
    + common_config_snippet（每工具一份）
    = 写入 Live Config 的完整内容
```

**涉及函数：**
- `build_effective_settings_with_common_config()` - 构建写入时的完整配置
- `strip_common_config_from_live_settings()` - 读取时剥离共享片段

---

## 8. 备份机制

写入 Live Config 前可创建备份（保留份数由 `effective_backup_retain_count()` 决定，默认在设置中配置），备份存储在 `~/.cc-switch/backups/`，可通过 `restore_backup_cmd` 命令恢复。

---

## 9. 关键代码路径

### 9.1 主要源文件

| 功能 | 文件路径 |
|---|---|
| Codex 配置读写 | `src-tauri/src/codex_config.rs` |
| OpenClaw 配置读写 | `src-tauri/src/openclaw_config.rs` |
| Hermes 配置读写 | `src-tauri/src/hermes_config.rs` |
| Live Config 统一写入逻辑 | `src-tauri/src/services/provider/live.rs` |
| 供应商切换服务 | `src-tauri/src/services/provider/mod.rs` |
| Tauri 命令层（OpenClaw） | `src-tauri/src/commands/openclaw.rs` |
| Tauri 命令层（Hermes） | `src-tauri/src/commands/hermes.rs` |
| Tauri 命令层（通用） | `src-tauri/src/commands/provider.rs` |

### 9.2 核心函数调用链

**供应商切换：**
```
commands/provider.rs::switch_provider()
  → services/provider/mod.rs::ProviderService::switch()
    → services/provider/mod.rs::ProviderService::switch_normal()
      → services/provider/live.rs::write_live_with_common_config()
        → services/provider/live.rs::write_live_snapshot()
          → [工具特定写入函数]
            ├─ codex_config.rs::write_codex_live_atomic_with_stable_provider()
            ├─ openclaw_config.rs::set_typed_provider() / set_provider()
            └─ hermes_config.rs::set_provider()
      → [Hermes 专属] hermes_config.rs::apply_switch_defaults()
      → services/mcp.rs::McpService::sync_all_enabled()
```

**导入 Live Config：**
```
commands/provider.rs::import_default_config_internal()
  → services/provider/mod.rs::ProviderService::import_default_config()
    → services/provider/live.rs::import_default_config()
      或
commands/openclaw.rs::import_openclaw_providers_from_live()
  → services/provider/live.rs::import_openclaw_providers_from_live()

commands/hermes.rs::import_hermes_providers_from_live()
  → services/provider/live.rs::import_hermes_providers_from_live()
```

---

## 10. 数据流总结

### 10.1 Switch 模式（Codex）

```
┌─────────────────────────────────────────────┐
│           UI 中选择供应商 / 编辑配置          │
└──────────────────┬──────────────────────────┘
                   │ invoke("switch_provider")
                   ↓
       ┌───────────────────────────┐
       │  read_live_settings()     │ ← 读当前 Codex Live Config
       │  (backfill mechanism)     │
       └───────────────┬───────────┘
                       │ 剥离 common config
                       ↓
       ┌───────────────────────────┐
       │  Database.save_provider() │ ← 存储剥离后的版本
       └───────────────┬───────────┘
                       │
                       ↓
       ┌───────────────────────────────────┐
       │ write_codex_live_atomic()         │
       │ - 写 auth.json                    │
       │ - 写 config.toml                  │
       │ （+ common config merge）         │
       └───────────────┬───────────────────┘
                       │
                       ↓
       ┌───────────────────────────┐
       │  McpService::sync...()    │ ← 同步 MCP 配置
       │  SkillService::sync...()  │ ← 同步 Skill
       └───────────────────────────┘
```

### 10.2 Additive 模式（OpenClaw / Hermes）

```
┌─────────────────────────────────────────────┐
│         UI 中选择/添加供应商并切换             │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
       ┌───────────────────────────┐
       │ Database.set_current...() │ ← 仅更新 DB（无 backfill）
       └───────────────┬───────────┘
                       │
                       ↓
       ┌───────────────────────────────────┐
       │ openclaw_config::set_provider()   │
       │ hermes_config::set_provider()     │
       │ （追加/更新到 providers 集合）     │
       └───────────────┬───────────────────┘
                       │
                       ├─→ [Hermes 专属]
                       │   apply_switch_defaults()
                       │   （更新 model.provider）
                       │
                       ↓
       ┌───────────────────────────┐
       │  McpService::sync...()    │
       │  SkillService::sync...()  │
       └───────────────────────────┘
```

---

## 11. 常见操作场景

### 场景 1：用户从 UI 切换到已导入的 Codex 供应商

1. 前端调用 `switch_provider({ app: "Codex", id: "my-provider" })`
2. 后端读取当前 `~/.codex/auth.json` + `config.toml`
3. 将当前内容剥离 common config 后保存回 DB（防止丢失 Live 新增的配置）
4. 从 DB 加载 "my-provider" 的 settings_config
5. 应用 common config merge
6. 原子写入 `~/.codex/auth.json` 和 `~/.codex/config.toml`
7. 同步 MCP 和 Skill 配置

### 场景 2：用户在 OpenClaw Web UI 添加供应商后，首次启动 cc-switch

1. 应用启动时调用 `should_import_default_config_on_startup("openclaw")`
2. 返回 true（DB 中尚无 OpenClaw 供应商）
3. 调用 `import_openclaw_providers_from_live()`
4. 读取 `~/.openclaw/openclaw.json` 的 `models.providers`
5. 逐一导入为 DB 中的 Provider（标记 `live_config_managed: true`）
6. 第一个导入的被设为 `is_current`（或用户选择）

### 场景 3：用户在 cc-switch 中编辑 Hermes 供应商并切换

1. 前端修改供应商（编辑 base_url、models 等）并调用 `update_provider()`
2. 后端更新 DB 记录
3. 用户点击"切换"→ `switch_provider({ app: "Hermes", id: "edited-provider" })`
4. `hermes_config::set_provider()` 将修改后的配置 upsert 到 `~/.hermes/config.yaml` 的 `custom_providers` 列表
5. `apply_switch_defaults()` 更新顶层 `model.provider` 指向该供应商，`model.default` 指向其第一个模型
6. 同步 MCP 和 Skill 配置

---

## 12. 配置验证

各工具配置读写函数在写入前都会进行验证：

| 工具 | 验证方式 |
|---|---|
| Codex | TOML 解析 (`toml::from_str`) |
| OpenClaw | JSON5 解析 + 字段检查（models 非空） |
| Hermes | YAML 解析 + provider 名称检查 |

写入失败时返回 `AppError`，前端收到错误信息后展示给用户。

---

## 13. 环境变量与设置覆盖

用户可在 cc-switch settings 中覆盖工具的配置目录：

```rust
// 示例（settings.json）
{
  "codex_config_dir": "/custom/path/.codex",
  "openclaw_config_dir": "/custom/path/.openclaw",
  "hermes_config_dir": "/custom/path/.hermes"
}
```

读取时优先检查环境变量或设置，然后 fallback 到默认位置（`~/.codex` 等）。

---

## 14. 测试覆盖

项目中包含大量单元测试（`src-tauri/tests/`）：

- `provider_commands.rs` - 供应商导入、切换、同步
- `provider_service.rs` - Switch/Additive 模式下的 Live Config 读写回流
- `mcp_commands.rs` - MCP 服务器启用/禁用与 Live Config 同步
- `skill_sync.rs` - Skill 导入与同步

这些测试使用临时 home 目录（`TempHome`）隔离，防止影响真实用户配置。

---

## 15. 总结对照表

| 操作 | Codex | OpenClaw | Hermes |
|---|---|---|---|
| **模式** | Switch | Additive | Additive |
| **Live Config 文件** | auth.json + config.toml | openclaw.json | config.yaml |
| **导入函数** | `import_default_config()` | `import_openclaw_providers_from_live()` | `import_hermes_providers_from_live()` |
| **写入函数** | `write_codex_live_atomic()` | `set_typed_provider()` | `set_provider()` |
| **切换时更新模型默认** | ❌（无） | ❌（无） | ✅ `apply_switch_defaults()` |
| **backfill（读时回存）** | ✅ | ❌ | ❌ |
| **MCP 同步** | ✅ | ✅ | ✅ |
| **Skill 同步** | ✅ | ✅ | ✅ |
| **common config 支持** | ✅ | ❓（部分） | ❓（部分） |

