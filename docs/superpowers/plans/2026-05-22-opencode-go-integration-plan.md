# OpenCode Go 集成实现计划

## 概览

| 阶段 | 内容 | 预估任务数 |
|---|---|---|
| **P0** | 基础格式转换 + 流式 SSE + proxy 分支 | 6 |
| **P1** | 场景检测 + Token 计数 + DeepSeek 特殊处理 | 3 |
| **P2** | 配置页面 + 测试覆盖 | 2 |

总计：11 个任务，按顺序执行。每个任务完成后运行 `pnpm tsc --noEmit` 和 `cargo check` 验证编译。

---

## P0：基础格式转换 + 流式 SSE + proxy 分支

### 任务 1：添加 Anthropic/OpenAI 类型定义

**文件：** `src-tauri/src/transformer.rs`（新建）

定义所有 Anthropic 和 OpenAI 请求/响应的 Rust 结构体，使用 `serde::Deserialize` / `serde::Serialize`。

**Anthropic 类型：**
- `AnthropicMessageRequest`：`model`, `messages`, `system`（string 或 array）, `tools`, `tool_choice`, `stream`, `max_tokens`, `temperature`, `top_p`, `top_k`, `metadata`, `stop_sequences`, `thinking`
- `AnthropicMessage`：`role`, `content`（string 或 array of blocks）
- `AnthropicContentBlock`：`type`, `text`, `tool_use_id`, `tool_name`, `input`, `thinking`, `signature`, `cache_control`
- `AnthropicTool`：`name`, `description`, `input_schema`
- `AnthropicMessageResponse`：`id`, `type`, `role`, `content`, `model`, `stop_reason`, `stop_sequence`, `usage`
- `AnthropicUsage`：`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`
- Anthropic SSE 事件类型：`MessageStart`, `ContentBlockStart`, `ContentBlockDelta`, `ContentBlockStop`, `MessageDelta`, `MessageStop`, `Ping`, `Error`

**OpenAI 类型：**
- `ChatCompletionRequest`：`model`, `messages`, `tools`, `tool_choice`, `stream`, `stream_options`, `max_tokens`, `temperature`, `top_p`, `reasoning_effort`, `thinking`
- `ChatMessage`：`role`, `content`（string 或 array）, `tool_calls`, `tool_call_id`, `reasoning_content`, `name`
- `ChatTool`：`type`, `function`
- `ChatFunction`：`name`, `description`, `parameters`
- `ChatCompletionResponse`：`id`, `object`, `created`, `model`, `choices`, `usage`
- `ChatCompletionChoice`：`index`, `message`, `finish_reason`
- `ChatCompletionChunk`：`id`, `choices`, `usage`
- `ChatChunkChoice`：`index`, `delta`, `finish_reason`
- `ChatDelta`：`role`, `content`, `tool_calls`, `reasoning_content`
- `ChatToolCall`：`id`, `type`, `function`
- `ChatFunctionCall`：`name`, `arguments`
- `OpenAIUsage`：`prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details`, `completion_tokens_details`
- `PromptTokensDetails`：`cached_tokens`
- `CompletionTokensDetails`：`reasoning_tokens`

**验证：** `cargo check` 通过。

---

### 任务 2：实现请求格式转换

**文件：** `src-tauri/src/transformer.rs`

实现 `anthropic_to_openai_request()`：

1. **解析 Anthropic 请求** → `AnthropicMessageRequest`
2. **转换 system 字段**：
   - string → `ChatMessage { role: "system", content: string }`
   - array → 拼接 text blocks，保留 `cache_control`
3. **转换 messages**：
   - user text → `ChatMessage { role: "user", content: "text" }`
   - user tool_result → `ChatMessage { role: "tool", content: result, tool_call_id: id }`
   - assistant text → `ChatMessage { role: "assistant", content: "text" }`
   - assistant tool_use → `ChatMessage { role: "assistant", tool_calls: [{id, type: "function", function: {name, arguments}}] }`
   - assistant thinking → `ChatMessage { role: "assistant", reasoning_content: "..." }`
4. **转换 tools**：`input_schema` → `function.parameters`
5. **处理 stream**：如果 `stream=true`，添加 `stream_options: {"include_usage": true}`
6. **处理 thinking 参数**：Anthropic 的 `thinking` 配置暂时忽略（OpenAI 用 `reasoning_effort`）
7. **返回** `ChatCompletionRequest`

**验证：** 编写单元测试，覆盖：纯文本消息、system array、tool_use、tool_result、thinking 块、stream_options。

---

### 任务 3：实现非流式响应格式转换

**文件：** `src-tauri/src/transformer.rs`

实现 `openai_to_anthropic_response()`：

1. **解析 OpenAI 响应** → `ChatCompletionResponse`
2. **转换 content**：`message.content` → `content: [{type: "text", text: ...}]`
3. **转换 tool_calls**：每个 tool_call → `{type: "tool_use", id, name, input}`
4. **转换 reasoning_content**：→ `{type: "thinking", thinking: ...}`
5. **转换 finish_reason**：`stop` → `end_turn`, `length` → `max_tokens`, `tool_calls` → `tool_use`
6. **Token 计数修正**：
   - `input_tokens = prompt_tokens - cached_tokens`（从 `prompt_tokens_details.cached_tokens` 获取）
   - `output_tokens = completion_tokens - reasoning_tokens`（从 `completion_tokens_details.reasoning_tokens` 获取）
7. **返回** `AnthropicMessageResponse`

**验证：** 编写单元测试，覆盖：纯文本响应、tool_calls 响应、reasoning_content 响应、token 计数修正。

---

### 任务 4：实现流式 SSE 转换

**文件：** `src-tauri/src/transformer.rs`

实现 `proxy_stream()`，这是最复杂的函数：

1. **输入**：`reqwest::Response`（上游 OpenAI 流式响应）
2. **输出**：实现 `Stream<Item = Result<Bytes, axum::Error>>` 的流

**核心逻辑：**
- 逐行读取上游 SSE（`data: {...}` 行）
- 解析每个 chunk → `ChatCompletionChunk`
- 维护状态：`content_index`（当前 content block 索引）、`started_tool_calls`（OpenAI index → Anthropic content block index 映射）、`has_reasoning`、`has_text`
- 按 Anthropic SSE 事件序列输出：
  - 首个 chunk → `message_start` 事件
  - `delta.content` → `content_block_start(text)` + `content_block_delta(text_delta)`
  - `delta.reasoning_content` → `content_block_start(thinking)` + `content_block_delta(thinking_delta)`
  - `delta.tool_calls`（首次）→ `content_block_start(tool_use, id, name)`
  - `delta.tool_calls`（后续）→ `content_block_delta(input_json_delta, partial_json)`
  - `finish_reason` → `content_block_stop`（按 index 升序）+ `message_delta(stop_reason)`
  - `[DONE]` → `message_stop`
- **心跳**：每 3 秒发送 `:keepalive\n\n`
- **快速路径**：不含 `reasoning_content` 的纯文本 chunk，用字符串索引提取
- **Ghost chunk 处理**：忽略无 id/name 的 tool call chunk
- **finish_reason 与 usage 分离**：分两个 chunk 到达时分别处理

**SSE 线格式：** `event: <type>\ndata: <json>\n\n`

**验证：** 编写单元测试，覆盖：纯文本流、reasoning+text 流、tool_use 流、心跳、ghost chunk。

---

### 任务 5：修改 proxy.rs 增加转换分支

**文件：** `src-tauri/src/proxy.rs`

在 `proxy_handler` 的 `loop` 中，获取到 `(target_url, protocol, ...)` 后增加分支：

```rust
match (route_prefix, protocol) {
    // 现有透传逻辑（不变）
    (RoutePrefix::Anthropic, Protocol::Anthropic) => { /* ... */ }
    (RoutePrefix::OpenAI, Protocol::OpenAI) => { /* ... */ }
    
    // 新增：Anthropic → OpenAI 转换
    (RoutePrefix::Anthropic, Protocol::OpenAI) => {
        return handle_anthropic_to_openai(
            &body_bytes, &original_headers, &state,
            &target_url, &stripped_path, &auth_scheme, &api_key,
            &provider_name, &provider_id, &queue_id,
            &log_id, &start_time, &inbound_headers_map,
        ).await;
    }
    
    // 不支持
    (RoutePrefix::OpenAI, Protocol::Anthropic) => {
        return error_response(StatusCode::BAD_REQUEST, 
            "OpenAI→Anthropic conversion not supported");
    }
}
```

实现 `handle_anthropic_to_openai()` 函数：

1. 解析 Anthropic 请求
2. 调用 `transformer::anthropic_to_openai_request()` 转换
3. 序列化转换后的请求体
4. 构建 OpenAI 端请求（Bearer 认证）
5. 发送请求
6. **非流式**：读取完整响应 → `transformer::openai_to_anthropic_response()` → 返回 JSON
7. **流式**：设置 SSE 头 → 调用 `transformer::proxy_stream()` → 返回流式响应
8. 错误处理：转换上游 HTTP 错误为 Anthropic 错误格式

**流式响应特殊处理：**
- 设置响应头：`content-type: text/event-stream`, `cache-control: no-cache`, `connection: keep-alive`
- 使用 `axum::response::sse::Sse` 或自定义 `StreamBody`
- 所有模型失败时：header 已发 → SSE error 事件；header 未发 → HTTP 错误

**验证：** `cargo check` 通过。

---

### 任务 6：添加 OpenCode Go 内置供应商

**文件：** `src-tauri/builtin_providers.json`

在现有供应商列表末尾添加 OpenCode Go：

```json
{
  "id": "opencode-go",
  "name": "OpenCode Go",
  "anthropic_url": "",
  "openai_url": "https://opencode.ai/zen/go/v1",
  "dual_protocol": false,
  "protocol": "OpenAI",
  "auth_scheme": "Bearer",
  "models": [
    {"id": "kimi-k2.6", "name": "Kimi K2.6", "is_custom": false},
    {"id": "glm-5", "name": "GLM-5", "is_custom": false},
    {"id": "glm-5.1", "name": "GLM-5.1", "is_custom": false},
    {"id": "minimax-m2.5", "name": "MiniMax M2.5", "is_custom": false},
    {"id": "qwen3.5-plus", "name": "Qwen3.5 Plus", "is_custom": false},
    {"id": "qwen3.6-plus", "name": "Qwen3.6 Plus", "is_custom": false},
    {"id": "mimo-v2-pro", "name": "MiMo V2 Pro", "is_custom": false},
    {"id": "deepseek-v4", "name": "DeepSeek V4", "is_custom": false}
  ],
  "priority": 85,
  "is_custom": false,
  "link": "https://opencode.ai"
}
```

同时在 `lib.rs` 的 `mod` 声明中添加 `mod transformer;`。

**验证：** `cargo check` 通过，应用启动后前端能看到 OpenCode Go 供应商。

---

## P1：场景检测 + Token 计数 + DeepSeek 特殊处理

### 任务 7：实现场景检测算法

**文件：** `src-tauri/src/transformer.rs`

实现 `detect_scenario()`：

1. **定义关键词列表**：
   - Complex: `architect`, `refactor`, `execute`, `implement`, `design`, `build`, `create`, `develop`
   - Think: `think`, `reason`, `analyze`, `consider`, `evaluate`, `plan`
   - Background: `list`, `show`, `what is`, `describe`, `explain`, `find`, `search`
2. **按优先级匹配**：
   - 先计算 token 数（简单估算：字符数 / 4），超过阈值 → `LongContext`
   - 检查消息内容是否含 Complex 关键词 → `Complex`
   - 检查是否含 Think 关键词或消息中有 `thinking` 块 → `Think`
   - 检查是否含 Background 关键词且无工具调用 → `Background`
   - 兜底 → `Default`
3. **流式请求**：`RouteForStreaming()` → 始终返回 `Fast` 场景
4. **场景→模型映射**：根据 `ScenarioRoutingConfig` 返回对应模型 ID

**Token 计数估算**：使用简单字符数/4 估算（不需要精确 tiktoken，场景检测只需要粗略值）。

**验证：** 编写单元测试，覆盖各场景的触发条件。

---

### 任务 8：集成场景检测 + DeepSeek 特殊处理

**文件：** `src-tauri/src/transformer.rs`

**集成到请求转换流程：**
1. 在 `anthropic_to_openai_request()` 中，先调用 `detect_scenario()` 确定场景
2. 根据场景选择模型 ID（覆盖请求中的 model 字段）
3. 如果 `respect_requested_model=true`，跳过场景检测

**DeepSeek 特殊处理：**
1. 实现 `has_thinking_blocks()`：检查所有 assistant 消息是否含 thinking 块
2. 如果模型 ID 包含 `deepseek`：
   - 有 thinking 历史 → 添加 `thinking: {"type":"enabled"}`，assistant 消息无 `reasoning_content` 时发送 `" "` 占位符
   - 无 thinking 历史 → 添加 `thinking: {"type":"disabled"}`，移除 `reasoning_effort`
3. 如果模型 ID 包含 `kimi` 或 `moonshot`：
   - assistant 有 tool_calls 但无 `reasoning_content` → 发送 `" "` 占位符

**验证：** 编写单元测试，覆盖 DeepSeek enabled/disabled、Moonshot 占位符、场景检测集成。

---

### 任务 9：配置扩展

**文件：** `src-tauri/src/config.rs`

1. 新增 `ScenarioRoutingConfig` 结构体（带 `#[derive(Debug, Clone, Serialize, Deserialize, Default)]`）
2. 新增 `Scenario` 枚举（带 `#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]`）
3. 在 `AppConfig` 中添加 `scenario_routing: ScenarioRoutingConfig` 和 `respect_requested_model: bool` 字段
4. 为 `ScenarioRoutingConfig` 实现 `Default` trait（默认值见设计文档第5.2节）
5. 确保新字段有 `#[serde(default)]` 以兼容旧配置

**文件：** `src-tauri/src/lib.rs`

1. 在 `mod` 声明中添加 `mod transformer;`
2. 在 `ProxyState` 中添加 `scenario_routing` 字段
3. 在 `start_proxy` 时从 config 读取 `scenario_routing` 并传入

**验证：** `cargo check` 通过，旧 config.json 能正常加载（新字段使用默认值）。

---

## P2：配置页面 + 测试覆盖

### 任务 10：配置页面场景路由设置

**文件：** `src/components/SettingsPage.tsx`

在现有设置页面中添加"场景路由"区域：

1. 场景路由开关：启用/禁用场景检测
2. 各场景的模型选择下拉框（LongContext / Complex / Think / Background / Default / Fast）
3. `respect_requested_model` 开关
4. Token 阈值输入框（LongContext）
5. 保存时调用 `saveConfig`

**文件：** `src/api.ts`

添加场景路由相关的 API 调用（复用现有 `saveConfig`）。

**验证：** `pnpm tsc --noEmit` 通过，前端能正常显示和保存配置。

---

### 任务 11：单元测试覆盖

**文件：** `src-tauri/src/transformer.rs`（`#[cfg(test)]` 模块）

补充完整测试覆盖：

| 测试 | 覆盖内容 |
|---|---|
| `test_request_conversion_text` | 纯文本消息转换 |
| `test_request_conversion_system_array` | system array 转换 |
| `test_request_conversion_tool_use` | tool_use → tool_calls |
| `test_request_conversion_tool_result` | tool_result → tool message |
| `test_request_conversion_thinking` | thinking → reasoning_content |
| `test_request_conversion_stream_options` | stream_options 添加 |
| `test_response_conversion_text` | 纯文本响应转换 |
| `test_response_conversion_tool_calls` | tool_calls 响应转换 |
| `test_response_conversion_reasoning` | reasoning_content 响应转换 |
| `test_response_token_correction` | Token 计数修正 |
| `test_stream_text_only` | 纯文本流式转换 |
| `test_stream_reasoning_and_text` | reasoning+text 流式转换 |
| `test_stream_tool_use` | tool_use 流式转换 |
| `test_stream_ghost_chunk` | Ghost chunk 处理 |
| `test_stream_keepalive` | 心跳机制 |
| `test_scenario_long_context` | LongContext 场景检测 |
| `test_scenario_complex` | Complex 场景检测 |
| `test_scenario_think` | Think 场景检测 |
| `test_scenario_background` | Background 场景检测 |
| `test_scenario_default` | Default 场景检测 |
| `test_deepseek_thinking_enabled` | DeepSeek thinking enabled |
| `test_deepseek_thinking_disabled` | DeepSeek thinking disabled |
| `test_deepseek_skips_reasoning_effort` | DeepSeek 跳过 reasoning_effort |
| `test_moonshot_placeholder` | Moonshot 占位符 |

**验证：** `cargo test` 全部通过。

---

## 执行顺序

```
任务1 (类型定义)
  ↓
任务2 (请求转换) ← 依赖任务1
  ↓
任务3 (响应转换) ← 依赖任务1
  ↓
任务4 (流式SSE) ← 依赖任务1
  ↓
任务5 (proxy分支) ← 依赖任务2,3,4
  ↓
任务6 (内置供应商) ← 依赖任务5
  ↓
任务7 (场景检测) ← 依赖任务2
  ↓
任务8 (DeepSeek+集成) ← 依赖任务7
  ↓
任务9 (配置扩展) ← 依赖任务8
  ↓
任务10 (配置页面) ← 依赖任务9
  ↓
任务11 (测试覆盖) ← 依赖所有前置任务
```

每个任务完成后必须通过编译检查。P0 完成后即可进行基本的功能测试（Claude Code → freemodel-auto-router → OpenCode Go）。
