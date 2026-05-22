# OpenCode Go 集成设计文档

## 1. 概述

将 OpenCode Go（`opencode.ai/zen/go/v1`）作为内置供应商集成到 freemodel-auto-router 中，支持 Anthropic→OpenAI 格式转换、场景检测自动路由、流式 SSE 代理。

**核心数据流：**
```
Claude Code ──Anthropic /v1/messages──► freemodel-auto-router
                                           │
                                           ├─ 供应商 protocol = Anthropic → 直接透传（现有逻辑）
                                           └─ 供应商 protocol = OpenAI → 格式转换后转发
                                               ├─ 场景检测 → 选模型
                                               ├─ 请求：Anthropic → OpenAI Chat Completions
                                               ├─ 响应：OpenAI → Anthropic Messages
                                               └─ 流式：OpenAI SSE → Anthropic SSE
```

## 2. 新增模块：`transformer.rs`

### 2.1 数据结构

```rust
// Anthropic 请求/响应类型
struct AnthropicMessageRequest { ... }
struct AnthropicMessageResponse { ... }
struct AnthropicMessageEvent { ... }  // SSE 事件

// OpenAI 请求/响应类型
struct ChatCompletionRequest { ... }
struct ChatCompletionResponse { ... }
struct ChatCompletionChunk { ... }    // 流式 chunk

// 场景枚举
enum Scenario {
    LongContext,  // token > 阈值
    Complex,      // 架构/工具关键词
    Think,        // 推理关键词 / thinking 块
    Background,   // 简单只读
    Default,      // 兜底
    Fast,         // 流式专用
}

// 场景→模型映射配置
struct ScenarioRoutingConfig {
    long_context_model: String,
    complex_model: String,
    think_model: String,
    background_model: String,
    default_model: String,
    fast_model: String,
    long_context_threshold: usize,  // 默认 80K
}
```

### 2.2 请求转换：`anthropic_to_open_openai_request()`

**消息映射：**

| Anthropic | OpenAI |
|---|---|
| `system: string` | `role: "system", content: string` |
| `system: [{type:"text",...}]` | `role: "system", content: 拼接文本, cache_control: 保留` |
| `user: {content: "text"}` | `role: "user", content: "text"` |
| `user: {content: [{type:"tool_result",...}]}` | `role: "tool", content: 结果, tool_call_id: id` |
| `assistant: {content: [{type:"text",...}]}` | `role: "assistant", content: 文本` |
| `assistant: {content: [{type:"tool_use",...}]}` | `role: "assistant", tool_calls: [{id, type:"function", function:{name, arguments}}]` |
| `assistant: {content: [{type:"thinking",...}]}` | `role: "assistant", reasoning_content: 思考内容` |

**DeepSeek 特殊处理：**
- 检测对话历史中是否存在 thinking 块（`HasThinkingBlocks()`）
- 有 thinking 历史 → `thinking: {"type":"enabled"}` + `reasoning_content: " "` 占位符
- 无 thinking 历史 → `thinking: {"type":"disabled"}`，不发送 `reasoning_effort`
- `thinking: {"type":"disabled"}` 时，移除 `reasoning_effort`（DeepSeek 返回 400）

**流式请求：** `stream_options: {"include_usage": true}`

**工具转换：** `tools[].input_schema` → `tools[].function.parameters`

### 2.3 响应转换：`openai_to_anthropic_response()`

| OpenAI | Anthropic |
|---|---|
| `choices[0].message.content` | `content: [{type:"text", text: ...}]` |
| `choices[0].message.tool_calls` | `content: [{type:"tool_use", id, name, input}]` |
| `choices[0].message.reasoning_content` | `content: [{type:"thinking", thinking: ...}]` |
| `finish_reason: "stop"` | `stop_reason: "end_turn"` |
| `finish_reason: "length"` | `stop_reason: "max_tokens"` |
| `finish_reason: "tool_calls"` | `stop_reason: "tool_use"` |

**Token 计数修正：**
```
input_tokens = prompt_tokens - prompt_cache_hit_tokens - prompt_cache_miss_tokens
```
防止 Claude Code 上下文计数器因缓存 token 虚高。

### 2.4 流式 SSE 转换：`proxy_stream()`

**Anthropic SSE 事件序列：**
```
message_start → content_block_start → content_block_delta (×N) → content_block_stop → message_delta → message_stop
```

**OpenAI Chunk → Anthropic Event 映射：**

| OpenAI Chunk | Anthropic Event |
|---|---|
| `delta.content` | `content_block_start(text)` + `content_block_delta(text_delta)` |
| `delta.reasoning_content` | `content_block_start(thinking)` + `content_block_delta(thinking_delta)` |
| `delta.tool_calls` (首次) | `content_block_start(tool_use, id, name)` |
| `delta.tool_calls` (后续) | `content_block_delta(input_json_delta, partial_json)` |
| `finish_reason` | `content_block_stop` + `message_delta(stop_reason)` |
| `[DONE]` | `message_stop` |

**性能优化：**
- 快速路径：纯文本 chunk 用字符串索引提取，跳过 JSON 解析
- 快速路径前置检查：`!contains("reasoning_content")`
- 心跳机制：每 3 秒发送 `:keepalive\n\n`
- Ghost chunk 处理：忽略无 id/name 的 tool call chunk
- content_block_stop 按 index 升序发送

### 2.5 场景检测：`detect_scenario()`

按优先级匹配：

| 优先级 | 场景 | 触发条件 | 默认模型 |
|---|---|---|---|
| 1 | `LongContext` | Token 数 > 80K | MiniMax-M2.5 |
| 2 | `Complex` | 含 architect/refactor/execute/implement 等关键词 | GLM-5.1 |
| 3 | `Think` | 含 think/reason/analyze 等关键词或 antThinking 块 | GLM-5 |
| 4 | `Background` | 简单只读（无工具关键词），含 list/show/what is 等 | Qwen3.5 Plus |
| 5 | `Default` | 兜底 | Kimi K2.6 |

**流式请求特殊处理：** `RouteForStreaming()` 优先选快速模型（Qwen3.6 Plus），降低首 token 延迟。

**Token 计数：** 使用 tiktoken cl100k_base 编码。路由场景的文本提取跳过 thinking 块。

**`respect_requested_model` 配置：** 启用时跳过场景检测，直接使用用户指定的模型。

## 3. 修改 `proxy.rs`

### 3.1 请求处理分支

在 `proxy_handler` 的 `loop` 中，获取到 `(target_url, protocol, ...)` 后：

```rust
match (route_prefix, protocol) {
    // 现有逻辑：Anthropic → Anthropic（透传）
    (RoutePrefix::Anthropic, Protocol::Anthropic) => { /* 现有透传 */ }
    
    // 新增：Anthropic → OpenAI（格式转换）
    (RoutePrefix::Anthropic, Protocol::OpenAI) => {
        // 1. 解析 Anthropic 请求
        // 2. 场景检测 → 选模型
        // 3. 转换请求格式
        // 4. 发送 OpenAI 请求
        // 5. 转换响应格式（非流式或流式）
    }
    
    // 现有逻辑：OpenAI → OpenAI（透传）
    (RoutePrefix::OpenAI, Protocol::OpenAI) => { /* 现有透传 */ }
    
    // 不支持：OpenAI → Anthropic
    (RoutePrefix::OpenAI, Protocol::Anthropic) => {
        return error_response(StatusCode::BAD_REQUEST, "OpenAI→Anthropic conversion not supported");
    }
}
```

### 3.2 流式响应处理

流式路径需要特殊处理：
1. 设置 SSE 响应头（`text/event-stream`）
2. 启动心跳 goroutine（每 3 秒）
3. 使用 `StreamBody` 包装转换流
4. 所有模型失败时，通过 SSE error 事件返回错误

### 3.3 错误处理

| HTTP 状态码 | Anthropic 错误类型 |
|---|---|
| 400 | `invalid_request_error` |
| 401 | `authentication_error` |
| 403 | `permission_error` |
| 404 | `not_found_error` |
| 429 | `rate_limit_error` |
| 5xx | `api_error` |

流式错误：header 已发 → SSE error 事件；header 未发 → HTTP 错误。

## 4. 新增内置供应商

在 `builtin_providers.json` 中添加 OpenCode Go：

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
    {"id": "kimi-k2.6", "name": "Kimi K2.6"},
    {"id": "glm-5", "name": "GLM-5"},
    {"id": "glm-5.1", "name": "GLM-5.1"},
    {"id": "minimax-m2.5", "name": "MiniMax M2.5"},
    {"id": "qwen3.5-plus", "name": "Qwen3.5 Plus"},
    {"id": "qwen3.6-plus", "name": "Qwen3.6 Plus"},
    {"id": "mimo-v2-pro", "name": "MiMo V2 Pro"},
    {"id": "deepseek-v4", "name": "DeepSeek V4"}
  ],
  "priority": 85,
  "is_custom": false,
  "link": "https://opencode.ai"
}
```

## 5. 配置扩展

### 5.1 `AppConfig` 新增字段

```rust
pub struct AppConfig {
    // ... 现有字段 ...
    
    /// 场景路由配置（可选，使用默认值）
    #[serde(default)]
    pub scenario_routing: ScenarioRoutingConfig,
    
    /// 是否尊重用户指定的模型（跳过场景检测）
    #[serde(default)]
    pub respect_requested_model: bool,
}
```

### 5.2 默认场景路由配置

场景路由配置中的模型 ID 必须与 OpenCode Go 供应商中定义的模型 ID 完全一致。

```rust
impl Default for ScenarioRoutingConfig {
    fn default() -> Self {
        Self {
            long_context_model: "minimax-m2.5".to_string(),
            complex_model: "glm-5.1".to_string(),
            think_model: "glm-5".to_string(),
            background_model: "qwen3.5-plus".to_string(),
            default_model: "kimi-k2.6".to_string(),
            fast_model: "qwen3.6-plus".to_string(),
            long_context_threshold: 80000,
        }
    }
}
```

## 6. 前端改动

**无需改动。** OpenCode Go 作为普通供应商出现在列表中，用户像添加其他供应商一样操作。Claude Code 注入开关照常工作。

## 7. 实现阶段

| 阶段 | 内容 | 预估复杂度 |
|---|---|---|
| **P0** | Anthropic↔OpenAI 请求/响应格式转换 | 高 |
| **P0** | 流式 SSE 转换（含心跳、快速路径） | 高 |
| **P0** | proxy.rs 分支逻辑 | 中 |
| **P1** | 场景检测算法 | 中 |
| **P1** | Token 计数修正 | 低 |
| **P1** | DeepSeek thinking 特殊处理 | 中 |
| **P2** | 配置页面：场景路由设置 | 中 |
| **P2** | 单元测试覆盖 | 高 |

## 8. 文件变更清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `src-tauri/src/transformer.rs` | **新增** | 格式转换核心模块 |
| `src-tauri/src/proxy.rs` | **修改** | 增加转换分支逻辑 |
| `src-tauri/src/config.rs` | **修改** | 新增 ScenarioRoutingConfig |
| `src-tauri/src/lib.rs` | **修改** | 注册新配置字段 |
| `src-tauri/builtin_providers.json` | **修改** | 添加 OpenCode Go 供应商 |
