# oc-go-cc 实现原理完整文档

## 1. 项目概述

**oc-go-cc** 是一个代理服务器（proxy），架设在 Claude Code 与 OpenCode Go 之间，将 Claude Code 发出的 Anthropic API 请求转换为 OpenAI Chat Completions 格式，转发给 OpenCode Go，再把响应转换回 Anthropic SSE 格式返回给 Claude Code。

**核心价值：** 让用户使用 OpenCode Go 的订阅来驱动 Claude Code，而不需要单独的 Anthropic API Key。

### 使用方式

```bash
# 启动代理
oc-go-cc serve

# 配置 Claude Code 指向代理
export ANTHROPIC_BASE_URL=http://127.0.0.1:3456
export ANTHROPIC_AUTH_TOKEN=unused
```

---

## 2. 整体架构

```
┌─────────────┐       Anthropic API        ┌──────────────┐     OpenAI API      ┌──────────────┐
│             │  ──────────────────────►    │              │  ──────────────►   │              │
│ Claude Code │  ◄──────────────────────    │   oc-go-cc   │  ◄──────────────   │  OpenCode Go │
│             │    Anthropic SSE            │   (proxy)    │    OpenAI SSE      │              │
└─────────────┘                             └──────────────┘                    └──────────────┘
    客户端                                    代理服务器                              上游API
```

### 数据流总览

```
Claude Code ──POST /v1/messages──► oc-go-cc ──POST chat/completions──► OpenCode Go
                                     │
                                     ├─ 1. 解析 Anthropic 请求
                                     ├─ 2. Token 计数
                                     ├─ 3. 场景检测 → 模型路由
                                     ├─ 4. 请求格式转换 (Anthropic → OpenAI)
                                     ├─ 5. 带熔断的 fallback 调用
                                     ├─ 6. 响应格式转换 (OpenAI → Anthropic)
                                     └─ 7. SSE 流式代理
```

---

## 3. 项目结构

```
oc-go-cc/
├── cmd/oc-go-cc/main.go          # CLI 入口 (cobra)，含 serve/stop/status/init/validate/models/autostart 子命令
├── configs/config.example.json   # 参考配置文件
├── internal/
│   ├── config/                   # 配置加载、热重载、原子访问
│   │   ├── config.go             # Config/ModelConfig/OpenCodeGoConfig 类型定义
│   │   ├── loader.go             # JSON 配置加载 + ${VAR} 环境变量插值
│   │   ├── atomic.go            # AtomicConfig 原子配置（无锁读取）
│   │   └── watcher.go           # 文件监听热重载
│   ├── server/                   # HTTP 服务器生命周期
│   │   └── server.go            # 组装路由、启动 HTTP、优雅关闭
│   ├── handlers/                 # HTTP 请求处理器
│   │   ├── messages.go          # /v1/messages 核心处理器
│   │   ├── health.go            # /health 和 /v1/messages/count_tokens
│   │   └── token_count.go       # Token 计数端点
│   ├── transformer/              # 请求/响应格式转换
│   │   ├── request.go           # Anthropic → OpenAI 请求转换
│   │   ├── response.go          # OpenAI → Anthropic 响应转换
│   │   ├── stream.go            # 流式 SSE 实时转换代理
│   │   └── transformer.go       # 公共工具
│   ├── router/                   # 模型路由与 fallback
│   │   ├── scenarios.go         # 场景检测算法
│   │   ├── model_router.go      # 模型路由器
│   │   ├── fallback.go          # 熔断器 + fallback 执行器
│   │   └── router.go            # 路由注册
│   ├── client/                   # 上游 API 客户端
│   │   ├── opencode.go          # OpenCode Go HTTP 客户端
│   │   └── client.go            # 通用客户端逻辑
│   ├── token/                    # Token 计数
│   │   └── counter.go           # 基于 tiktoken cl100k_base 的计数器
│   ├── middleware/               # HTTP 中间件
│   │   └── middleware.go        # 限流、去重、请求ID生成
│   ├── metrics/                  # 指标收集
│   │   └── metrics.go           # 请求计数、延迟 p95/p99
│   └── daemon/                   # 后台进程管理
│       ├── background.go        # 后台 fork
│       ├── paths.go            # PID 文件路径
│       └── autostart_*.go      # 开机自启（跨平台）
└── pkg/types/                    # 共享类型定义
    ├── anthropic.go             # Anthropic Messages API 类型
    ├── openai.go               # OpenAI Chat Completions API 类型
    └── types.go                # 公共接口
```

---

## 4. 核心模块详解

### 4.1 HTTP 服务器 (`internal/server/server.go`)

服务器监听 `/v1/messages`（Claude Code 的唯一入口）和 `/health`。

```
mux.HandleFunc("/v1/messages", messagesHandler.HandleMessages)
mux.HandleFunc("/v1/messages/count_tokens", healthHandler.HandleCountTokens)
mux.HandleFunc("/health", healthHandler.HandleHealth)
```

关键设计：
- **原子配置（AtomicConfig）**：通过 `atomic.Value` 实现无锁读取，支持热重载
- **优雅关闭**：监听 SIGTERM/SIGINT，10 秒超时
- **写超时 5 分钟**：适配长流式响应

### 4.2 请求处理流水线 (`internal/handlers/messages.go`)

每个请求经过以下步骤：

```
1. 请求ID生成/传递
2. 限流检查 (RateLimiter: 100 req/min per IP)
3. 请求去重 (RequestDeduplicator: 500ms 窗口)
4. JSON 解析 → types.MessageRequest
5. 请求验证 (model + messages 必填)
6. Token 计数 (tiktoken cl100k_base)
7. 场景检测 → 模型路由
8. 分流：流式 or 非流式
```

### 4.3 场景检测与模型路由 (`internal/router/`)

#### 4.3.1 场景检测算法 (`scenarios.go`)

按优先级依次匹配：

| 优先级 | 场景 | 触发条件 | 默认模型 |
|--------|------|----------|----------|
| 1 | `long_context` | Token 数 > 阈值（默认 80K） | MiniMax-M2.5（1M 上下文） |
| 2 | `complex` | 含架构/工具关键词（architect, refactor, execute, implement 等） | GLM-5.1 |
| 3 | `think` | 含推理关键词（think, reason, analyze 等）或 `antThinking` 块 | GLM-5 |
| 4 | `background` | 简单只读操作（无工具关键词），含 list/show/what is 等 | Qwen3.5 Plus |
| 5 | `default` | 兜底 | Kimi K2.6 |

**流式请求的特殊处理**：`RouteForStreaming()` 优先选择快速模型（Qwen3.6 Plus），降低首 token 延迟（TTFT）。

**`respect_requested_model` 配置项**：当启用时，直接使用用户指定的模型，跳过场景检测。

#### 4.3.2 模型路由器 (`model_router.go`)

```go
type RouteResult struct {
    Primary   config.ModelConfig    // 主模型
    Fallbacks []config.ModelConfig  // 备选模型链
    Scenario  Scenario              // 检测到的场景
}
```

路由器从 `config.json` 的 `models` 和 `fallbacks` 中查找对应场景的配置，构建 `GetModelChain()`（主模型 + 备选链）。

#### 4.3.3 熔断器与 Fallback (`fallback.go`)

每个模型有独立的熔断器（Circuit Breaker），三态状态机：

```
CircuitClosed (正常) ──3次失败──► CircuitOpen (熔断) ──30秒──► CircuitHalfOpen (探测)
     ▲                                                                      │
     └──────────────── 3次成功 ─────────────────────────────────────────────┘
```

`ExecuteWithFallback` 按模型链顺序尝试，跳过熔断中的模型，直到有一个成功。

### 4.4 请求格式转换 (`internal/transformer/request.go`)

将 Anthropic `MessageRequest` → OpenAI `ChatCompletionRequest`：

#### 消息转换映射

| Anthropic | OpenAI |
|-----------|--------|
| `system: string` | `role: "system", content: string` |
| `system: [{type:"text",...}]` | `role: "system", content: 拼接文本, cache_control: 保留` |
| `user: {content: "text"}` | `role: "user", content: "text"` |
| `user: {content: [{type:"tool_result",...}]}` | `role: "tool", content: 结果文本, tool_call_id: id` |
| `assistant: {content: [{type:"text",...}]}` | `role: "assistant", content: 文本` |
| `assistant: {content: [{type:"tool_use",...}]}` | `role: "assistant", tool_calls: [{id, type:"function", function:{name, arguments}}]` |
| `assistant: {content: [{type:"thinking",...}]}` | `role: "assistant", reasoning_content: 思考内容` |

#### DeepSeek 特殊处理

DeepSeek-v4 模型始终运行在 thinking 模式。当对话历史中存在 thinking 块时，必须发送 `thinking: {"type":"enabled"}`；当历史中无 thinking 块时，必须发送 `thinking: {"type":"disabled"}`，否则 DeepSeek 返回 400。

**thinking 模式检测逻辑**（`HasThinkingBlocks()`）：
- 检查所有 `role="assistant"` 的消息
- 如果存在 `type="thinking"` 的 content block → 有 thinking 历史
- 如果 `type="tool_use"` 的 block 上直接带有非空 `thinking` 字段 → 也有 thinking 历史（Claude Code 在工具调用时可能将思考内容内联到 tool_use 块上）

**reasoning_content 占位符规则**：

| 模型 | 条件 | 行为 |
|------|------|------|
| DeepSeek | 有 thinking 历史 + assistant 消息无原始 reasoning_content | 发送 `" "`（空格）占位符 |
| DeepSeek | 无 thinking 历史 | 不发送占位符，但发送 `thinking: {"type":"disabled"}` |
| Moonshot (Kimi) | assistant 有 tool_calls 但无 reasoning_content | 发送 `" "`（空格）占位符（Moonshot 验证器将空字符串视为缺失） |
| DeepSeek | thinking 配置为 `{"type":"disabled"}` + 有 thinking 历史 | **不发送** `reasoning_effort`（DeepSeek 返回 400 如果同时发送 disabled + reasoning_effort） |

**关键细节**：当 `thinking: {"type":"disabled"}` 时，`reasoning_effort` 必须被移除，即使 model config 中配置了该值。测试用例 `TestTransformRequestSkipsReasoningEffortWhenThinkingDisabled` 验证了这一点。

#### 工具转换

Anthropic `tools[].input_schema` 直接映射为 OpenAI `tools[].function.parameters`。

#### 流式请求的 StreamOptions

当 `stream=true` 时，必须设置 `stream_options: {"include_usage": true}`，这样 OpenAI 会在流式响应末尾携带 usage 信息。非流式请求不设置此字段。

#### system message 的 cache_control 保留

当 Anthropic 的 system 是数组格式时，如果某个 block 带有 `cache_control: {"type":"ephemeral"}`，转换后会保留在 OpenAI system message 的 `cache_control` 字段中。这是 Anthropic prompt caching 的关键机制。

### 4.5 响应格式转换 (`internal/transformer/response.go`)

将 OpenAI `ChatCompletionResponse` → Anthropic `MessageResponse`：

| OpenAI | Anthropic |
|--------|-----------|
| `choices[0].message.content` | `content: [{type:"text", text: ...}]` |
| `choices[0].message.tool_calls` | `content: [{type:"tool_use", id, name, input}]` |
| `choices[0].message.reasoning_content` | `content: [{type:"thinking", thinking: ...}]` |
| `finish_reason: "stop"` | `stop_reason: "end_turn"` |
| `finish_reason: "length"` | `stop_reason: "max_tokens"` |
| `finish_reason: "tool_calls"` | `stop_reason: "tool_use"` |

**Token 计数修正**：Anthropic 的 `input_tokens` 不包含缓存 token，而 OpenAI 的 `prompt_tokens` 是总数。因此：
```
input_tokens = prompt_tokens - prompt_cache_hit_tokens - prompt_cache_miss_tokens
```
这防止了 Claude Code 的上下文计数器因缓存 token 而虚高，避免过早触发 auto-compact。

### 4.6 流式 SSE 转换 (`internal/transformer/stream.go`)

这是最复杂的模块。OpenAI 的流式响应（`ChatCompletionChunk` SSE）被实时转换为 Anthropic 的 `MessageEvent` SSE。

#### SSE 事件映射

**Anthropic SSE 事件序列：**
```
message_start → content_block_start → content_block_delta (×N) → content_block_stop → message_delta → message_stop
```

**转换逻辑：**

| OpenAI Chunk | Anthropic Event |
|--------------|-----------------|
| `delta.content` | `content_block_start` (type=text) + `content_block_delta` (type=text_delta) |
| `delta.reasoning_content` | `content_block_start` (type=thinking) + `content_block_delta` (type=thinking_delta) |
| `delta.tool_calls` (首次) | `content_block_start` (type=tool_use, id, name) |
| `delta.tool_calls` (后续) | `content_block_delta` (type=input_json_delta, partial_json=增量参数) |
| `finish_reason` | `content_block_stop` (关闭所有打开的块) + `message_delta` (stop_reason) |
| `[DONE]` | `message_stop` |

#### SSE 线格式

每个 Anthropic SSE 事件的格式为：
```
event: <event_type>\ndata: <json>\n\n
```

例如：
```
event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}
```

#### 性能优化

- **零缓冲读取**：直接从 `resp.Body` 读取，不使用 `bufio.Reader`，最小化延迟
- **快速路径**：对于纯文本 chunk（不含 `reasoning_content`），直接用字符串索引 `"delta":{"content":"` 提取内容，跳过完整 JSON 解析。**关键边界**：如果同一 chunk 中 `reasoning_content` 出现在 `content` 之前，快速路径的字符串匹配会命中但丢弃 `reasoning_content`。因此快速路径的前置检查是 `!strings.Contains(data, "reasoning_content")`，含 reasoning 的 chunk 走完整 JSON 解析路径。
- **心跳机制**：每 3 秒发送 SSE 注释 `:keepalive\n\n`，防止 Claude Code 6 秒超时断开。心跳在独立 goroutine 中运行，流式结束时通过 `heartbeatDone` channel 通知退出。

#### 工具调用流式处理

OpenAI 的 tool call 是增量发送的：第一个 chunk 携带 `id` + `name`（可能还有空 arguments），后续 chunk 只携带 `partial arguments`。代理必须：
1. 用 `startedToolCalls` map（key=OpenAI tool call index → value=Anthropic content block index）跟踪状态
2. 只在第一次见到某个 tool call index 时发送 `content_block_start`
3. 每个后续 chunk 发送 `input_json_delta`
4. **Ghost chunk 处理**：OpenAI 可能回收 tool call index，发送一个无 `id` 无 `name` 的 chunk。此时必须忽略（`continue`），不创建新的 content block
5. **content_block_stop 排序**：多个 tool call 关闭时，必须按 content block index 升序发送 `content_block_stop`（不能随机顺序）
6. **finish_reason 与 usage 分离**：当 `finish_reason` 和 `usage` 分两个 chunk 到达时，finish_reason 先触发 `content_block_stop` + `message_delta`，usage 随后触发一个不含 `stop_reason` 的 `message_delta`，避免重复发送 stop_reason

#### 流式 SSE 完整事件序列参考

**纯文本响应**（7 个事件）：
```
message_start → content_block_start(text, idx=0) → content_block_delta(text_delta) ×N → content_block_stop(idx=0) → message_delta(stop_reason=end_turn) → message_stop
```

**推理+文本响应**（10 个事件）：
```
message_start → content_block_start(thinking, idx=0) → content_block_delta(thinking_delta) ×N → content_block_stop(idx=0) → content_block_start(text, idx=1) → content_block_delta(text_delta) ×N → content_block_stop(idx=1) → message_delta(stop_reason=end_turn) → message_stop
```

**工具调用响应**（以 1 个 tool 为例，7 个事件）：
```
message_start → content_block_start(tool_use, idx=1) → content_block_delta(input_json_delta) ×N → content_block_stop(idx=1) → message_delta(stop_reason=end_turn) → message_stop
```

**注意**：tool_use 的 content block index 从 1 开始（因为 index 0 被 text/reasoning 占用）。如果前面没有 text/reasoning，tool_use 从 index 1 开始（index 0 被 `contentIndex++` 跳过）。

**reasoning 和 content 在同一 chunk 中**：当 OpenAI 的 delta 同时包含 `reasoning_content` 和 `content` 时，快速路径被跳过（因为含 `reasoning_content`），走完整 JSON 解析。此时先处理 reasoning（开启 thinking block），再处理 content（关闭 thinking block，开启 text block）。

#### 流式响应的 responseWriter 包装

`handleStreaming` 使用自定义的 `responseWriter` 包装原生 `http.ResponseWriter`：
- 跟踪 `wroteHeader` 状态，防止重复 `WriteHeader` 调用（Go 会 panic）
- 实现 `http.Flusher` 接口，每次写入后立即 Flush，确保 SSE 实时性
- 当所有模型都失败时，如果 header 已发送，通过 SSE error 事件返回错误；如果 header 未发送，返回标准 HTTP 错误

### 4.7 上游 API 客户端 (`internal/client/opencode.go`)

#### 双端点路由

```go
func IsAnthropicModel(modelID string) bool {
    switch modelID {
    case "minimax-m2.5", "minimax-m2.7":
        return true  // 使用 Anthropic 端点
    default:
        return false // 使用 OpenAI 端点
    }
}
```

| 模型 | 端点 | 地址 |
|------|------|------|
| GLM, Kimi, MiMo, Qwen, DeepSeek | OpenAI | `https://opencode.ai/zen/go/v1/chat/completions` |
| MiniMax-M2.5, M2.7 | Anthropic | `https://opencode.ai/zen/go/v1/messages` |

**MiniMax 特殊处理**：MiniMax 模型原生支持 Anthropic 格式，因此不需要格式转换。代理直接替换请求体中的 model 字段（通过字符串查找 `"model":"..."` 并替换值），然后将原始 Anthropic 请求转发到 Anthropic 端点。

**流式请求的 Context 隔离**：每个 fallback 尝试使用独立的 `context.WithTimeout(context.Background(), 2min)`，**不使用** `r.Context()`。因为当 Claude Code 重试时，原始请求的 context 会被 cancel，如果共享会导致所有正在进行的 fallback 都被终止。

**Anthropic 端点的额外 Header**：向 Anthropic 端点发送请求时，除了 `Authorization: Bearer`，还额外发送 `x-api-key` 头，因为 OpenCode Go 的 Anthropic 端点可能使用 `x-api-key` 而非标准 `Authorization` 进行认证。

#### 连接池配置

```go
transport := &http.Transport{
    MaxIdleConns:        100,
    MaxIdleConnsPerHost: 20,
    IdleConnTimeout:     90s,
    MaxConnsPerHost:     50,
}
```

### 4.8 配置系统 (`internal/config/`)

配置从 `~/.config/oc-go-cc/config.json` 加载，支持 `${VAR}` 环境变量插值。

**热重载**：通过 `fsnotify` 监听配置文件变化，自动更新原子配置，无需重启。关键细节：
- 监听的是配置文件的**目录**而非文件本身（因为编辑器保存时可能通过 rename/create 操作）
- 500ms 防抖（debounce），避免编辑器多次触发导致重复加载
- 支持 SIGHUP 信号手动触发重载
- 回调在配置 swap **之前** 执行，允许回调修改新配置（如保持 CLI 指定的 port 覆盖）
- host/port/timeout 变更需要重启服务器才能生效（会打印 warn 日志）

**AtomicConfig**：使用 `atomic.Value` 存储配置指针，读取无锁，更新原子。Reload 时先加载新配置 → 执行回调 → 原子 swap。如果加载失败，旧配置保持不变。

### 4.9 中间件 (`internal/middleware/`)

- **RateLimiter**：基于令牌桶算法，每 IP 每分钟 100 请求
- **RequestDeduplicator**：基于 SHA-256 请求体哈希，500ms 窗口内去重（防止 Claude Code 重试导致重复请求）
- **RequestIDGenerator**：生成唯一请求 ID，用于日志关联

### 4.10 Token 计数 (`internal/token/counter.go`)

使用 `tiktoken` 的 `cl100k_base` 编码（与 Claude 相同），计算：
- 3 token 基础开销
- 系统 prompt token + 5 token 开销
- 每条消息 token + 5 token 开销

**路由场景的文本提取**（`extractTextFromBlocks`）：仅提取 text、tool_use（名称）、tool_result（内容）、image（占位符），**跳过 thinking 块**。因为 thinking 内容不影响场景判断。

**Token 计数端点的文本提取**（`extractTokenTextFromBlocks`，在 `token_count.go` 中）：范围更广，包含 thinking 内容、tool_use 的 input JSON。因为这里要精确计算实际消耗的 token。

**Tools 的 token 计算**：将 tools 数组 JSON 序列化后拼接到 system text 后面一起计数。

缓存目录默认在 `~/.cache/oc-go-cc/tiktoken`。

### 4.11 Health 端点 (`internal/handlers/health.go`)

`GET /health` 返回 JSON，包含：
- 请求统计（总数/成功/失败/流式）
- p95/p99 延迟
- 各模型的熔断器状态（closed/open/half_open）
- 各模型的调用次数

`POST /v1/messages/count_tokens`：Claude Code 调用此端点获取 token 计数，代理使用与路由相同的 tiktoken 计数逻辑返回结果。

---

## 5. 完整请求生命周期

### 非流式请求

```
1. Claude Code ──POST /v1/messages (JSON)──► oc-go-cc
2. 解析为 types.MessageRequest
3. 用 tiktoken 计算 token 数
4. DetectScenario() → 确定场景 (default/background/think/complex/long_context/fast)
5. ModelRouter.Route() → 获取主模型 + fallback 链
6. RequestTransformer.TransformRequest() → Anthropic → OpenAI 格式
7. FallbackHandler.ExecuteWithFallback()
   ├─ 检查熔断器状态
   ├─ OpenCodeClient.ChatCompletionNonStreaming()
   │   └─ HTTP POST → OpenCode Go (OpenAI 或 Anthropic 端点)
   ├─ 成功 → ResponseTransformer.TransformResponse() → OpenAI → Anthropic 格式
   └─ 失败 → 记录熔断 → 尝试下一个 fallback 模型
8. 返回 JSON 响应给 Claude Code
```

### 流式请求

```
1. Claude Code ──POST /v1/messages (stream=true)──► oc-go-cc
2. 解析 + Token 计数 + 场景检测 + 路由
3. 设置 SSE 响应头 (text/event-stream)
4. 启动心跳 goroutine (每 3 秒 :keepalive)
5. 遍历 modelChain:
   a. RequestTransformer.TransformRequest()
   b. OpenCodeClient.GetStreamingBody() → 获取 resp.Body ReadCloser
   c. StreamHandler.ProxyStream():
      ├─ 发送 message_start 事件
      ├─ 逐字节读取上游 SSE
      ├─ 解析 data: 行
      ├─ 转换 delta.content → content_block_delta (text_delta)
      ├─ 转换 delta.reasoning_content → content_block_delta (thinking_delta)
      ├─ 转换 delta.tool_calls → content_block_start + input_json_delta
      ├─ 转换 finish_reason → content_block_stop + message_delta
      └─ 发送 message_stop
   d. 成功 → 返回
   e. 失败 → 尝试下一个 fallback
```

---

## 6. 关键设计决策

### 6.1 为什么需要 Token 计数？

场景检测依赖 token 数量来判断是否属于 `long_context`。使用与 Claude 相同的 `cl100k_base` 编码确保计数准确。

### 6.2 为什么流式请求要降级到快速模型？

复杂模型（GLM、Kimi）在流式场景下首 token 延迟（TTFT）较高，尤其是工具调用较多时。Qwen3.6 Plus 的 TTFT 更低，用户体验更好。

### 6.3 为什么需要熔断器？

当某个模型不可用（限流、服务故障）时，熔断器在 3 次失败后跳过该模型 30 秒，避免无效等待，提高整体可用性。

### 6.4 为什么需要请求去重？

Claude Code 在超时或网络错误时会自动重试，产生完全相同的请求。去重器在 500ms 窗口内识别重复请求（SHA-256 哈希），避免浪费 API 调用。

### 6.5 为什么 MiniMax 不走格式转换？

MiniMax 模型在 OpenCode Go 上原生支持 Anthropic API 格式（`/v1/messages`），因此代理只需替换 model 字段，直接透传原始请求体，无需任何转换。

### 6.6 为什么需要 reasoning_content 占位符？

DeepSeek 一旦进入 thinking 模式，后续所有 assistant 消息都必须携带 `reasoning_content`。当 Claude Code 压缩对话（/compact）后，原始 thinking 块可能丢失。代理用单个空格 `" "` 作为占位符，满足 DeepSeek 的验证要求（字段存在且非空）。

---

## 7. 配置参考

### 默认模型路由策略

| 场景 | 主模型 | Fallback 链 |
|------|--------|-------------|
| background | qwen3.5-plus | qwen3.6-plus → minimax-m2.5 |
| default | kimi-k2.6 | mimo-v2-pro → qwen3.6-plus |
| long_context | minimax-m2.5 | minimax-m2.7 → kimi-k2.6 |
| think | glm-5 | kimi-k2.6 → mimo-v2-pro |
| complex | glm-5.1 | glm-5 → kimi-k2.6 |
| fast | qwen3.6-plus | qwen3.5-plus → minimax-m2.5 |

### 关键配置项

```json
{
  "api_key": "${OC_GO_CC_API_KEY}",     // API 密钥（环境变量插值）
  "host": "127.0.0.1",                   // 监听地址
  "port": 3456,                          // 监听端口
  "hot_reload": false,                   // 配置热重载
  "enable_streaming_scenario_routing": false,  // 流式请求是否启用场景路由
  "respect_requested_model": false,      // 是否尊重用户指定的模型
  "opencode_go": {
    "base_url": "https://opencode.ai/zen/go/v1/chat/completions",
    "anthropic_base_url": "https://opencode.ai/zen/go/v1/messages",
    "timeout_ms": 300000
  }
}
```

---

## 8. 错误处理策略

### HTTP 状态码 → Anthropic 错误类型映射

| HTTP 状态码 | Anthropic error type |
|-------------|---------------------|
| 400 | `invalid_request_error` |
| 401 | `authentication_error` |
| 403 | `permission_error` |
| 404 | `not_found_error` |
| 429 | `rate_limit_error` |
| 5xx | `api_error` |
| 其他 | `api_error` |

### 错误处理流程

| 错误类型 | 处理方式 |
|----------|----------|
| 请求体无效 | 400 Bad Request（JSON 格式） |
| 限流 | 429 Too Many Requests |
| 单个模型失败 | 记录熔断 → 尝试 fallback |
| 所有模型失败（非流式） | 502 Bad Gateway（JSON 格式） |
| 所有模型失败（流式，header 已发） | SSE error 事件（`event: error`） |
| 所有模型失败（流式，header 未发） | 502 Bad Gateway（JSON 格式） |
| 客户端断开 | 立即停止上游请求，返回 ErrClientDisconnected |
| 上游 4xx/5xx | 读取错误 body → 返回错误信息 → 尝试 fallback |
| 流式 malformed chunk | 跳过该 chunk，不中断整个 stream |

### 流式错误的特殊处理

流式响应中，一旦 SSE header 发送（HTTP 200），就不能再返回 HTTP 错误码。此时：
- 如果 header 尚未发送 → 返回标准 HTTP 错误（JSON body）
- 如果 header 已发送 → 发送 `event: error` + `data: {"type":"error","error":{"type":"api_error","message":"..."}}` SSE 事件

`responseWriter` 包装器的 `wroteHeader` 标志用于判断是否已发送 header。`sendError` 方法检查此标志，避免重复 WriteHeader 导致 panic。

---

## 9. 性能指标

Metrics 模块收集：
- 请求总数 / 流式请求数 / 成功数 / 失败数
- 限流次数 / 去重次数
- 延迟分布（p95 / p99）
- 按模型统计调用次数

---

## 10. 部署与运维

### 安装
```bash
make install    # 构建并安装到 $GOPATH/bin
```

### 开机自启
```bash
oc-go-cc autostart enable    # 启用
oc-go-cc autostart disable   # 禁用
oc-go-cc autostart status    # 查看状态
```

### 后台运行
```bash
oc-go-cc serve --background   # 后台守护进程
oc-go-cc stop                 # 停止
oc-go-cc status               # 查看状态
```

### 跨平台支持
- Windows: 通过 Windows 计划任务实现自启
- macOS: 通过 launchd 实现自启
- Linux: 通过 systemd 实现自启
