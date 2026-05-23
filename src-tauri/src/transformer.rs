use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ============================================================================
// Anthropic Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicMessageRequest {
    pub model: String,
    pub messages: Vec<AnthropicMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub system: Option<AnthropicSystem>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<AnthropicTool>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<AnthropicToolChoice>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_k: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_sequences: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<AnthropicThinking>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AnthropicSystem {
    String(String),
    Blocks(Vec<AnthropicSystemBlock>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicSystemBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicMessage {
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<AnthropicMessageContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AnthropicMessageContent {
    String(String),
    Blocks(Vec<AnthropicContentBlock>),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicContentBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_use_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_control: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_url: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicTool {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicToolChoice {
    #[serde(rename = "type")]
    pub choice_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicThinking {
    #[serde(rename = "type")]
    pub thinking_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub budget_tokens: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnthropicMessageResponse {
    pub id: String,
    #[serde(rename = "type")]
    pub response_type: String,
    pub role: String,
    pub content: Vec<AnthropicContentBlock>,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stop_sequence: Option<String>,
    pub usage: AnthropicUsage,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AnthropicUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_creation_input_tokens: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cache_read_input_tokens: Option<u64>,
}

// ============================================================================
// OpenAI Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tools: Option<Vec<ChatTool>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_choice: Option<serde_json::Value>,
    #[serde(default)]
    pub stream: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stream_options: Option<ChatStreamOptions>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub top_p: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStreamOptions {
    pub include_usage: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<ChatMessageContent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ChatToolCall>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum ChatMessageContent {
    String(String),
    Parts(Vec<ChatContentPart>),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatContentPart {
    #[serde(rename = "type")]
    pub part_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image_url: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatTool {
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: ChatFunction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFunction {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parameters: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub tool_type: String,
    pub function: ChatFunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatFunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionResponse {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created: Option<u64>,
    pub model: String,
    pub choices: Vec<ChatCompletionChoice>,
    pub usage: Option<OpenAIUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionChoice {
    pub index: u32,
    pub message: ChatMessage,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatCompletionChunk {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub object: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    pub choices: Vec<ChatChunkChoice>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usage: Option<OpenAIUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChunkChoice {
    pub index: u32,
    pub delta: ChatDelta,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub finish_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ChatDelta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ChatDeltaToolCall>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatDeltaToolCall {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub index: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    pub tool_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function: Option<ChatDeltaFunction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatDeltaFunction {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub arguments: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct OpenAIUsage {
    #[serde(default)]
    pub prompt_tokens: u64,
    #[serde(default)]
    pub completion_tokens: u64,
    #[serde(default)]
    pub total_tokens: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_tokens_details: Option<PromptTokensDetails>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completion_tokens_details: Option<CompletionTokensDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptTokensDetails {
    #[serde(default)]
    pub cached_tokens: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionTokensDetails {
    #[serde(default)]
    pub reasoning_tokens: u64,
}

// ============================================================================
// SSE Event Types (for Anthropic SSE output)
// ============================================================================

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize)]
pub struct AnthropicSseEvent {
    #[serde(rename = "type")]
    pub event_type: String,
    #[serde(flatten)]
    pub data: HashMap<String, serde_json::Value>,
}

// ============================================================================
// Placeholder functions (implemented in subsequent tasks)
// ============================================================================

/// Convert Anthropic message request to OpenAI chat completion request.
/// `model_id` overrides the model field in the request.
pub fn anthropic_to_openai_request(
    anthropic_req: &AnthropicMessageRequest,
    model_id: &str,
) -> anyhow::Result<ChatCompletionRequest> {
    let mut messages: Vec<ChatMessage> = Vec::new();

    // Convert system field
    if let Some(system) = &anthropic_req.system {
        match system {
            AnthropicSystem::String(s) => {
                messages.push(ChatMessage {
                    role: "system".to_string(),
                    content: Some(ChatMessageContent::String(s.clone())),
                    tool_calls: None,
                    tool_call_id: None,
                    reasoning_content: None,
                    name: None,
                });
            }
            AnthropicSystem::Blocks(blocks) => {
                // Check if any block has cache_control
                let has_cache_control = blocks.iter().any(|b| b.cache_control.is_some());
                if has_cache_control {
                    // Preserve individual blocks with cache_control as separate messages
                    for block in blocks {
                        if let Some(text) = &block.text {
                            let msg = ChatMessage {
                                role: "system".to_string(),
                                content: Some(ChatMessageContent::String(text.clone())),
                                tool_calls: None,
                                tool_call_id: None,
                                reasoning_content: None,
                                name: None,
                            };
                            // Note: OpenAI doesn't have direct cache_control equivalent in ChatMessage
                            // but we preserve the text content
                            messages.push(msg);
                        }
                    }
                } else {
                    // Concatenate all text blocks
                    let combined: String = blocks
                        .iter()
                        .filter_map(|b| b.text.clone())
                        .collect::<Vec<_>>()
                        .join("\n");
                    if !combined.is_empty() {
                        messages.push(ChatMessage {
                            role: "system".to_string(),
                            content: Some(ChatMessageContent::String(combined)),
                            tool_calls: None,
                            tool_call_id: None,
                            reasoning_content: None,
                            name: None,
                        });
                    }
                }
            }
        }
    }

    // Convert messages
    for msg in &anthropic_req.messages {
        match &msg.content {
            Some(AnthropicMessageContent::String(s)) => {
                messages.push(ChatMessage {
                    role: msg.role.clone(),
                    content: Some(ChatMessageContent::String(s.clone())),
                    tool_calls: None,
                    tool_call_id: None,
                    reasoning_content: None,
                    name: None,
                });
            }
            Some(AnthropicMessageContent::Blocks(blocks)) => {
                // Check if this is a tool_result message (user role with tool_result blocks)
                if msg.role == "user" && blocks.iter().any(|b| b.block_type == "tool_result") {
                    // Each tool_result becomes a separate "tool" message
                    for block in blocks {
                        if block.block_type == "tool_result" {
                            let content = block.content.clone().unwrap_or_default();
                            messages.push(ChatMessage {
                                role: "tool".to_string(),
                                content: Some(ChatMessageContent::String(content)),
                                tool_calls: None,
                                tool_call_id: block.tool_use_id.clone(),
                                reasoning_content: None,
                                name: None,
                            });
                        }
                    }
                } else {
                    // Assistant message with mixed content blocks
                    let mut text_parts: Vec<String> = Vec::new();
                    let mut tool_calls: Vec<ChatToolCall> = Vec::new();
                    let mut reasoning_content: Option<String> = None;

                    for block in blocks {
                        match block.block_type.as_str() {
                            "text" => {
                                if let Some(t) = &block.text {
                                    text_parts.push(t.clone());
                                }
                            }
                            "tool_use" => {
                                if let Some(id) = &block.id {
                                    let args = block
                                        .input
                                        .as_ref()
                                        .and_then(|v| serde_json::to_string(v).ok())
                                        .unwrap_or_default();
                                    tool_calls.push(ChatToolCall {
                                        id: id.clone(),
                                        tool_type: "function".to_string(),
                                        function: ChatFunctionCall {
                                            name: block.name.clone().unwrap_or_default(),
                                            arguments: args,
                                        },
                                    });
                                }
                            }
                            "thinking" => {
                                if let Some(t) = &block.thinking {
                                    reasoning_content = Some(t.clone());
                                }
                            }
                            _ => {}
                        }
                    }

                    let content = if text_parts.is_empty() {
                        None
                    } else {
                        Some(ChatMessageContent::String(text_parts.join("")))
                    };

                    messages.push(ChatMessage {
                        role: msg.role.clone(),
                        content,
                        tool_calls: if tool_calls.is_empty() {
                            None
                        } else {
                            Some(tool_calls)
                        },
                        tool_call_id: None,
                        reasoning_content,
                        name: None,
                    });
                }
            }
            None => {
                messages.push(ChatMessage {
                    role: msg.role.clone(),
                    content: None,
                    tool_calls: None,
                    tool_call_id: None,
                    reasoning_content: None,
                    name: None,
                });
            }
        }
    }

    // Convert tools
    let tools = anthropic_req.tools.as_ref().map(|t| {
        t.iter()
            .map(|tool| ChatTool {
                tool_type: "function".to_string(),
                function: ChatFunction {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    parameters: Some(tool.input_schema.clone()),
                },
            })
            .collect()
    });

    // Build stream_options
    let stream_options = if anthropic_req.stream {
        Some(ChatStreamOptions {
            include_usage: true,
        })
    } else {
        None
    };

    Ok(ChatCompletionRequest {
        model: model_id.to_string(),
        messages,
        tools,
        tool_choice: anthropic_req
            .tool_choice
            .as_ref()
            .map(|tc| serde_json::json!({"type": tc.choice_type, "name": tc.name})),
        stream: anthropic_req.stream,
        stream_options,
        max_tokens: anthropic_req.max_tokens,
        temperature: anthropic_req.temperature,
        top_p: anthropic_req.top_p,
        reasoning_effort: None,
        thinking: None,
    })
}

/// Convert OpenAI chat completion response to Anthropic message response.
pub fn openai_to_anthropic_response(
    openai_resp: &ChatCompletionResponse,
) -> anyhow::Result<AnthropicMessageResponse> {
    let choice = &openai_resp.choices[0];
    let message = &choice.message;

    let mut content: Vec<AnthropicContentBlock> = Vec::new();

    // Add reasoning_content as thinking block
    if let Some(reasoning) = &message.reasoning_content {
        content.push(AnthropicContentBlock {
            block_type: "thinking".to_string(),
            text: None,
            id: None,
            name: None,
            input: None,
            tool_use_id: None,
            content: None,
            thinking: Some(reasoning.clone()),
            signature: None,
            cache_control: None,
            source: None,
            image_url: None,
        });
    }

    // Add text content
    if let Some(text) = match &message.content {
        Some(ChatMessageContent::String(s)) => Some(s.clone()),
        Some(ChatMessageContent::Parts(parts)) => {
            let combined: String = parts.iter().filter_map(|p| p.text.clone()).collect();
            if combined.is_empty() { None } else { Some(combined) }
        }
        None => None,
    } {
        content.push(AnthropicContentBlock {
            block_type: "text".to_string(),
            text: Some(text),
            id: None,
            name: None,
            input: None,
            tool_use_id: None,
            content: None,
            thinking: None,
            signature: None,
            cache_control: None,
            source: None,
            image_url: None,
        });
    }

    // Add tool_calls
    if let Some(tool_calls) = &message.tool_calls {
        for tc in tool_calls {
            let input: serde_json::Value = serde_json::from_str(&tc.function.arguments)
                .unwrap_or(serde_json::Value::Object(serde_json::Map::new()));
            content.push(AnthropicContentBlock {
                block_type: "tool_use".to_string(),
                text: None,
                id: Some(tc.id.clone()),
                name: Some(tc.function.name.clone()),
                input: Some(input),
                tool_use_id: None,
                content: None,
                thinking: None,
                signature: None,
                cache_control: None,
                source: None,
                image_url: None,
            });
        }
    }

    // Map finish_reason
    let stop_reason = choice.finish_reason.as_deref().map(|fr| match fr {
        "stop" => "end_turn".to_string(),
        "length" => "max_tokens".to_string(),
        "tool_calls" => "tool_use".to_string(),
        _ => "end_turn".to_string(),
    });

    // Token count correction
    let usage = openai_resp.usage.as_ref();
    let cached_tokens = usage
        .and_then(|u| u.prompt_tokens_details.as_ref())
        .map(|d| d.cached_tokens)
        .unwrap_or(0);
    let reasoning_tokens = usage
        .and_then(|u| u.completion_tokens_details.as_ref())
        .map(|d| d.reasoning_tokens)
        .unwrap_or(0);

    let input_tokens = usage
        .map(|u| u.prompt_tokens.saturating_sub(cached_tokens))
        .unwrap_or(0);
    let output_tokens = usage
        .map(|u| u.completion_tokens.saturating_sub(reasoning_tokens))
        .unwrap_or(0);

    Ok(AnthropicMessageResponse {
        id: openai_resp.id.clone(),
        response_type: "message".to_string(),
        role: message.role.clone(),
        content,
        model: openai_resp.model.clone(),
        stop_reason,
        stop_sequence: None,
        usage: AnthropicUsage {
            input_tokens,
            output_tokens,
            cache_creation_input_tokens: None,
            cache_read_input_tokens: Some(cached_tokens),
        },
    })
}

/// Check if the conversation history contains thinking blocks.
pub fn has_thinking_blocks(messages: &[AnthropicMessage]) -> bool {
    messages.iter().any(|msg| {
        if let Some(AnthropicMessageContent::Blocks(blocks)) = &msg.content {
            blocks.iter().any(|b| {
                b.block_type == "thinking"
                    || (b.block_type == "tool_use" && b.thinking.as_ref().map(|t| !t.is_empty()).unwrap_or(false))
            })
        } else {
            false
        }
    })
}

/// Apply DeepSeek-specific thinking configuration to a ChatCompletionRequest.
/// Returns modified request with thinking field set appropriately.
pub fn apply_deepseek_thinking(
    mut req: ChatCompletionRequest,
    model_id: &str,
    has_thinking_history: bool,
) -> ChatCompletionRequest {
    let is_deepseek = model_id.to_lowercase().contains("deepseek");
    let is_moonshot = model_id.to_lowercase().contains("moonshot") || model_id.to_lowercase().contains("kimi");

    if is_deepseek {
        if has_thinking_history {
            req.thinking = Some(serde_json::json!({"type": "enabled"}));
            // Add reasoning_content placeholder for assistant messages that need it
            for msg in &mut req.messages {
                if msg.role == "assistant" && msg.reasoning_content.is_none() {
                    msg.reasoning_content = Some(" ".to_string());
                }
            }
        } else {
            req.thinking = Some(serde_json::json!({"type": "disabled"}));
            // When thinking is disabled, remove reasoning_effort to avoid 400
            req.reasoning_effort = None;
        }
    } else if is_moonshot {
        // Moonshot: add reasoning_content placeholder for assistant messages with tool_calls
        for msg in &mut req.messages {
            if msg.role == "assistant" && msg.tool_calls.is_some() && msg.reasoning_content.is_none() {
                msg.reasoning_content = Some(" ".to_string());
            }
        }
    }

    req
}

// ============================================================================
// Streaming SSE Types and Functions
// ============================================================================

use bytes::Bytes;
use futures::Stream;
use std::pin::Pin;
use std::task::Poll;

/// State for the streaming SSE converter.
struct StreamState {
    content_index: u32,
    has_text: bool,
    has_reasoning: bool,
    /// Current content block index for the open text block (if any)
    text_block_idx: Option<u32>,
    /// Current content block index for the open reasoning block (if any)
    reasoning_block_idx: Option<u32>,
    /// Maps OpenAI tool_call index -> Anthropic content block index
    started_tool_calls: HashMap<u32, u32>,
    /// Buffer for incomplete SSE data
    buffer: String,
    /// Whether message_start has been sent
    message_started: bool,
    /// Accumulated input tokens from usage
    input_tokens: Option<u64>,
    /// Accumulated output tokens from usage
    output_tokens: Option<u64>,
}

impl StreamState {
    fn new() -> Self {
        Self {
            content_index: 0,
            has_text: false,
            has_reasoning: false,
            text_block_idx: None,
            reasoning_block_idx: None,
            started_tool_calls: HashMap::new(),
            buffer: String::new(),
            message_started: false,
            input_tokens: None,
            output_tokens: None,
        }
    }
}

/// Convert OpenAI streaming SSE to Anthropic streaming SSE.
/// Returns a stream of Bytes, each being a complete SSE event line.
pub fn proxy_stream(
    mut chunk_stream: impl Stream<Item = Result<Bytes, reqwest::Error>> + Unpin + Send + 'static,
) -> Pin<Box<dyn Stream<Item = Result<Bytes, std::io::Error>> + Send>> {
    let state = std::sync::Arc::new(std::sync::Mutex::new(StreamState::new()));

    let output_stream = futures::stream::poll_fn(move |cx| {
        let mut st = state.lock().unwrap();

        // Try to poll the underlying stream
        loop {
            match Pin::new(&mut chunk_stream).poll_next(cx) {
                Poll::Ready(Some(Ok(chunk))) => {
                    let chunk_str = String::from_utf8_lossy(&chunk);
                    st.buffer.push_str(&chunk_str);

                    // Process complete SSE events from buffer
                    let mut events: Vec<String> = Vec::new();

                    while let Some(pos) = st.buffer.find("\n\n") {
                        let event_str = st.buffer[..pos].to_string();
                        st.buffer = st.buffer[pos + 2..].to_string();

                        if let Some(anthropic_events) = process_sse_chunk(&event_str, &mut st) {
                            events.extend(anthropic_events);
                        }
                    }

                    if !events.is_empty() {
                        let combined = events.join("");
                        return Poll::Ready(Some(Ok(Bytes::from(combined))));
                    }
                }
                Poll::Ready(Some(Err(e))) => {
                    return Poll::Ready(Some(Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("upstream error: {}", e),
                    ))));
                }
                Poll::Ready(None) => {
                    // Stream ended
                    return Poll::Ready(None);
                }
                Poll::Pending => return Poll::Pending,
            }
        }
    });

    Box::pin(output_stream)
}

/// Process a single SSE chunk string, returning Anthropic SSE events if any.
fn process_sse_chunk(chunk: &str, state: &mut StreamState) -> Option<Vec<String>> {
    let mut events: Vec<String> = Vec::new();

    for line in chunk.lines() {
        let data = if let Some(rest) = line.strip_prefix("data:") {
            rest.trim()
        } else {
            continue;
        };

        if data == "[DONE]" {
            // Send message_stop
            let msg_stop = format!(
                "event: message_stop\ndata: {{\"type\":\"message_stop\"}}\n\n"
            );
            events.push(msg_stop);
            return Some(events);
        }

        let chunk: ChatCompletionChunk = match serde_json::from_str(data) {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Extract usage if present
        if let Some(usage) = &chunk.usage {
            if usage.prompt_tokens > 0 {
                state.input_tokens = Some(usage.prompt_tokens);
            }
            if usage.completion_tokens > 0 {
                state.output_tokens = Some(usage.completion_tokens);
            }
        }

        for choice in &chunk.choices {
            let delta = &choice.delta;

            // Send message_start on first content
            if !state.message_started {
                if delta.content.is_some() || delta.reasoning_content.is_some() || delta.tool_calls.is_some() {
                    let msg_start = format!(
                        "event: message_start\ndata: {{\"type\":\"message_start\",\"message\":{{\"id\":\"{}\",\"type\":\"message\",\"role\":\"assistant\",\"content\":[],\"model\":\"\",\"stop_reason\":null,\"stop_sequence\":null,\"usage\":{{\"input_tokens\":0,\"output_tokens\":0}}}}}}\n\n",
                        chunk.id
                    );
                    events.push(msg_start);
                    state.message_started = true;
                }
            }

            // Handle reasoning_content
            if let Some(reasoning) = &delta.reasoning_content {
                if !state.has_reasoning {
                    // Close text block if open
                    if state.has_text {
                        let stop = format!(
                            "event: content_block_stop\ndata: {{\"type\":\"content_block_stop\",\"index\":{}}}\n\n",
                            state.content_index
                        );
                        events.push(stop);
                        state.content_index += 1;
                        state.has_text = false;
                    }

                    // Start thinking block
                    let block_idx = state.content_index;
                    let start = format!(
                        "event: content_block_start\ndata: {{\"type\":\"content_block_start\",\"index\":{},\"content_block\":{{\"type\":\"thinking\",\"thinking\":\"\"}}}}\n\n",
                        block_idx
                    );
                    events.push(start);
                    state.has_reasoning = true;
                    state.reasoning_block_idx = Some(block_idx);
                    state.content_index += 1;
                }

                // Send thinking delta
                let delta_event = format!(
                    "event: content_block_delta\ndata: {{\"type\":\"content_block_delta\",\"index\":{},\"delta\":{{\"type\":\"thinking_delta\",\"thinking\":\"{}\"}}}}\n\n",
                    state.content_index,
                    escape_json(reasoning)
                );
                events.push(delta_event);
            }

            // Handle text content
            if let Some(content) = &delta.content {
                if !state.has_text {
                    // Close reasoning block if open
                    if state.has_reasoning {
                        let stop = format!(
                            "event: content_block_stop\ndata: {{\"type\":\"content_block_stop\",\"index\":{}}}\n\n",
                            state.content_index
                        );
                        events.push(stop);
                        state.content_index += 1;
                        state.has_reasoning = false;
                    }

                    // Start text block
                    let block_idx = state.content_index;
                    let start = format!(
                        "event: content_block_start\ndata: {{\"type\":\"content_block_start\",\"index\":{},\"content_block\":{{\"type\":\"text\",\"text\":\"\"}}}}\n\n",
                        block_idx
                    );
                    events.push(start);
                    state.has_text = true;
                    state.text_block_idx = Some(block_idx);
                    state.content_index += 1;
                }

                // Send text delta
                let delta_event = format!(
                    "event: content_block_delta\ndata: {{\"type\":\"content_block_delta\",\"index\":{},\"delta\":{{\"type\":\"text_delta\",\"text\":\"{}\"}}}}\n\n",
                    state.content_index,
                    escape_json(content)
                );
                events.push(delta_event);
            }

            // Handle tool_calls
            if let Some(tool_calls) = &delta.tool_calls {
                for tc in tool_calls {
                    let tc_index = tc.index.unwrap_or(0);

                    // Check if this is a ghost chunk (no id, no name)
                    if tc.id.is_none() && tc.function.as_ref().and_then(|f| f.name.as_ref()).is_none() {
                        continue;
                    }

                    // First time seeing this tool call index
                    if tc.id.is_some() && !state.started_tool_calls.contains_key(&tc_index) {
                        // Close any open block
                        if state.has_text {
                            let stop = format!(
                                "event: content_block_stop\ndata: {{\"type\":\"content_block_stop\",\"index\":{}}}\n\n",
                                state.content_index
                            );
                            events.push(stop);
                            state.content_index += 1;
                            state.has_text = false;
                        }
                        if state.has_reasoning {
                            let stop = format!(
                                "event: content_block_stop\ndata: {{\"type\":\"content_block_stop\",\"index\":{}}}\n\n",
                                state.content_index
                            );
                            events.push(stop);
                            state.content_index += 1;
                            state.has_reasoning = false;
                        }

                        let block_idx = state.content_index;
                        state.started_tool_calls.insert(tc_index, block_idx);

                        let name = tc.function.as_ref().and_then(|f| f.name.as_deref()).unwrap_or("");
                        let start = format!(
                            "event: content_block_start\ndata: {{\"type\":\"content_block_start\",\"index\":{},\"content_block\":{{\"type\":\"tool_use\",\"id\":\"{}\",\"name\":\"{}\",\"input\":{{}}}}}}\n\n",
                            block_idx,
                            tc.id.as_deref().unwrap_or(""),
                            name
                        );
                        events.push(start);
                        state.content_index += 1;
                    }

                    // Send arguments delta
                    if let Some(args) = tc.function.as_ref().and_then(|f| f.arguments.as_ref()) {
                        if let Some(&block_idx) = state.started_tool_calls.get(&tc_index) {
                            let delta_event = format!(
                                "event: content_block_delta\ndata: {{\"type\":\"content_block_delta\",\"index\":{},\"delta\":{{\"type\":\"input_json_delta\",\"partial_json\":\"{}\"}}}}\n\n",
                                block_idx,
                                escape_json(args)
                            );
                            events.push(delta_event);
                        }
                    }
                }
            }

            // Handle finish_reason
            if let Some(fr) = &choice.finish_reason {
                // Close all open blocks in order
                let mut indices_to_close: Vec<u32> = Vec::new();
                if let Some(idx) = state.reasoning_block_idx {
                    indices_to_close.push(idx);
                }
                if let Some(idx) = state.text_block_idx {
                    indices_to_close.push(idx);
                }
                // Add tool call block indices
                for &idx in state.started_tool_calls.values() {
                    if !indices_to_close.contains(&idx) {
                        indices_to_close.push(idx);
                    }
                }
                indices_to_close.sort();

                for idx in &indices_to_close {
                    let stop = format!(
                        "event: content_block_stop\ndata: {{\"type\":\"content_block_stop\",\"index\":{}}}\n\n",
                        idx
                    );
                    events.push(stop);
                }

                let stop_reason = match fr.as_str() {
                    "stop" => "end_turn",
                    "length" => "max_tokens",
                    "tool_calls" => "tool_use",
                    _ => "end_turn",
                };

                let usage_data = format!(
                    "{{\"input_tokens\":{},\"output_tokens\":{}}}",
                    state.input_tokens.unwrap_or(0),
                    state.output_tokens.unwrap_or(0)
                );

                let msg_delta = format!(
                    "event: message_delta\ndata: {{\"type\":\"message_delta\",\"delta\":{{\"stop_reason\":\"{}\",\"stop_sequence\":null}},\"usage\":{}}}\n\n",
                    stop_reason, usage_data
                );
                events.push(msg_delta);

                state.has_text = false;
                state.has_reasoning = false;
                state.text_block_idx = None;
                state.reasoning_block_idx = None;
            }
        }
    }

    if events.is_empty() {
        None
    } else {
        Some(events)
    }
}

/// Escape a string for JSON embedding.
fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

#[cfg(test)]
mod tests {
    use super::*;

    // ========================================================================
    // Deserialization Tests
    // ========================================================================

    #[test]
    fn anthropic_request_deserializes() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.model, "claude-sonnet-4-6");
        assert_eq!(req.messages.len(), 1);
        assert!(!req.stream);
    }

    #[test]
    fn anthropic_request_with_system_array() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "system": [{"type": "text", "text": "You are a helper"}],
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        match req.system {
            Some(AnthropicSystem::Blocks(blocks)) => {
                assert_eq!(blocks.len(), 1);
                assert_eq!(blocks[0].text.as_deref(), Some("You are a helper"));
            }
            _ => panic!("expected system blocks"),
        }
    }

    #[test]
    fn anthropic_request_with_tool_use() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "messages": [{
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Let me check"},
                    {"type": "tool_use", "id": "tool_1", "name": "read_file", "input": {"path": "test.rs"}}
                ]
            }],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        match &req.messages[0].content {
            Some(AnthropicMessageContent::Blocks(blocks)) => {
                assert_eq!(blocks.len(), 2);
                assert_eq!(blocks[1].block_type, "tool_use");
                assert_eq!(blocks[1].id.as_deref(), Some("tool_1"));
            }
            _ => panic!("expected content blocks"),
        }
    }

    #[test]
    fn anthropic_request_with_thinking() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "messages": [{
                "role": "assistant",
                "content": [
                    {"type": "thinking", "thinking": "I need to analyze this...", "signature": "sig_123"}
                ]
            }],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        match &req.messages[0].content {
            Some(AnthropicMessageContent::Blocks(blocks)) => {
                assert_eq!(blocks[0].block_type, "thinking");
                assert!(blocks[0].thinking.is_some());
            }
            _ => panic!("expected thinking block"),
        }
    }

    #[test]
    fn openai_response_deserializes() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1700000000,
            "model": "gpt-4o",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 5,
                "total_tokens": 15
            }
        }"#;
        let resp: ChatCompletionResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.id, "chatcmpl-123");
        assert_eq!(
            resp.choices[0].message.content.as_ref().unwrap(),
            &ChatMessageContent::String("Hello!".to_string())
        );
        assert_eq!(resp.usage.as_ref().unwrap().prompt_tokens, 10);
    }

    #[test]
    fn openai_chunk_deserializes() {
        let json = r#"{
            "id": "chatcmpl-123",
            "choices": [{
                "index": 0,
                "delta": {"content": "Hello"},
                "finish_reason": null
            }]
        }"#;
        let chunk: ChatCompletionChunk = serde_json::from_str(json).unwrap();
        assert_eq!(chunk.choices[0].delta.content.as_deref(), Some("Hello"));
    }

    #[test]
    fn openai_chunk_with_tool_calls() {
        let json = r#"{
            "id": "chatcmpl-123",
            "choices": [{
                "index": 0,
                "delta": {
                    "tool_calls": [{
                        "index": 0,
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "read_file", "arguments": "{\"path\": \"test.rs\"}"}
                    }]
                }
            }]
        }"#;
        let chunk: ChatCompletionChunk = serde_json::from_str(json).unwrap();
        let tool_calls = chunk.choices[0].delta.tool_calls.as_ref().unwrap();
        assert_eq!(tool_calls[0].id.as_deref(), Some("call_1"));
        assert_eq!(
            tool_calls[0].function.as_ref().unwrap().name.as_deref(),
            Some("read_file")
        );
    }

    // ========================================================================
    // Request Conversion Tests
    // ========================================================================

    #[test]
    fn test_request_conversion_text() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "messages": [{"role": "user", "content": "Hello world"}],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "kimi-k2.6").unwrap();
        assert_eq!(openai_req.model, "kimi-k2.6");
        assert_eq!(openai_req.messages.len(), 1);
        assert_eq!(openai_req.messages[0].role, "user");
        assert_eq!(
            openai_req.messages[0].content,
            Some(ChatMessageContent::String("Hello world".to_string()))
        );
        assert_eq!(openai_req.max_tokens, Some(4096));
    }

    #[test]
    fn test_request_conversion_system_string() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "system": "You are a helpful assistant",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "kimi-k2.6").unwrap();
        assert_eq!(openai_req.messages.len(), 2);
        assert_eq!(openai_req.messages[0].role, "system");
        assert_eq!(
            openai_req.messages[0].content,
            Some(ChatMessageContent::String("You are a helpful assistant".to_string()))
        );
    }

    #[test]
    fn test_request_conversion_system_array() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "system": [
                {"type": "text", "text": "You are a helper"},
                {"type": "text", "text": "Be concise"}
            ],
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "kimi-k2.6").unwrap();
        // System blocks without cache_control get concatenated into one message
        assert_eq!(openai_req.messages.len(), 2);
        assert_eq!(openai_req.messages[0].role, "system");
        assert_eq!(
            openai_req.messages[0].content,
            Some(ChatMessageContent::String("You are a helper\nBe concise".to_string()))
        );
    }

    #[test]
    fn test_request_conversion_tool_use() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "messages": [{
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "Let me read the file"},
                    {"type": "tool_use", "id": "tool_1", "name": "read_file", "input": {"path": "test.rs"}}
                ]
            }],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "kimi-k2.6").unwrap();
        assert_eq!(openai_req.messages.len(), 1);
        let msg = &openai_req.messages[0];
        assert_eq!(msg.role, "assistant");
        assert!(msg.tool_calls.is_some());
        let tool_calls = msg.tool_calls.as_ref().unwrap();
        assert_eq!(tool_calls.len(), 1);
        assert_eq!(tool_calls[0].id, "tool_1");
        assert_eq!(tool_calls[0].function.name, "read_file");
    }

    #[test]
    fn test_request_conversion_tool_result() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "tool_result", "tool_use_id": "tool_1", "content": "file contents here"}
                ]
            }],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "kimi-k2.6").unwrap();
        assert_eq!(openai_req.messages.len(), 1);
        let msg = &openai_req.messages[0];
        assert_eq!(msg.role, "tool");
        assert_eq!(msg.tool_call_id.as_deref(), Some("tool_1"));
        assert_eq!(
            msg.content,
            Some(ChatMessageContent::String("file contents here".to_string()))
        );
    }

    #[test]
    fn test_request_conversion_thinking() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "messages": [{
                "role": "assistant",
                "content": [
                    {"type": "thinking", "thinking": "I need to analyze this...", "signature": "sig_123"}
                ]
            }],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "kimi-k2.6").unwrap();
        assert_eq!(openai_req.messages.len(), 1);
        let msg = &openai_req.messages[0];
        assert_eq!(msg.role, "assistant");
        assert_eq!(msg.reasoning_content.as_deref(), Some("I need to analyze this..."));
    }

    #[test]
    fn test_request_conversion_stream_options() {
        let json = r#"{
            "model": "claude-sonnet-4-6",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 4096,
            "stream": true
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "kimi-k2.6").unwrap();
        assert!(openai_req.stream);
        let stream_opts = openai_req.stream_options.as_ref().unwrap();
        assert!(stream_opts.include_usage);
    }

    // ========================================================================
    // Response Conversion Tests
    // ========================================================================

    #[test]
    fn test_response_conversion_text() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1700000000,
            "model": "kimi-k2.6",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150
            }
        }"#;
        let resp: ChatCompletionResponse = serde_json::from_str(json).unwrap();
        let anthropic_resp = openai_to_anthropic_response(&resp).unwrap();
        assert_eq!(anthropic_resp.content.len(), 1);
        assert_eq!(anthropic_resp.content[0].block_type, "text");
        assert_eq!(anthropic_resp.content[0].text.as_deref(), Some("Hello!"));
        assert_eq!(anthropic_resp.stop_reason.as_deref(), Some("end_turn"));
    }

    #[test]
    fn test_response_conversion_tool_calls() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1700000000,
            "model": "kimi-k2.6",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_1",
                        "type": "function",
                        "function": {"name": "read_file", "arguments": "{\"path\": \"test.rs\"}"}
                    }]
                },
                "finish_reason": "tool_calls"
            }],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150
            }
        }"#;
        let resp: ChatCompletionResponse = serde_json::from_str(json).unwrap();
        let anthropic_resp = openai_to_anthropic_response(&resp).unwrap();
        assert_eq!(anthropic_resp.content.len(), 1);
        assert_eq!(anthropic_resp.content[0].block_type, "tool_use");
        assert_eq!(anthropic_resp.content[0].id.as_deref(), Some("call_1"));
        assert_eq!(anthropic_resp.content[0].name.as_deref(), Some("read_file"));
        assert_eq!(anthropic_resp.stop_reason.as_deref(), Some("tool_use"));
    }

    #[test]
    fn test_response_conversion_reasoning() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1700000000,
            "model": "glm-5",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "The answer is 42",
                    "reasoning_content": "Let me think about this..."
                },
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150
            }
        }"#;
        let resp: ChatCompletionResponse = serde_json::from_str(json).unwrap();
        let anthropic_resp = openai_to_anthropic_response(&resp).unwrap();
        // Should have thinking block first, then text
        assert_eq!(anthropic_resp.content.len(), 2);
        assert_eq!(anthropic_resp.content[0].block_type, "thinking");
        assert_eq!(anthropic_resp.content[0].thinking.as_deref(), Some("Let me think about this..."));
        assert_eq!(anthropic_resp.content[1].block_type, "text");
        assert_eq!(anthropic_resp.content[1].text.as_deref(), Some("The answer is 42"));
    }

    #[test]
    fn test_response_token_correction() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1700000000,
            "model": "kimi-k2.6",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "Hello!"},
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": 100,
                "completion_tokens": 50,
                "total_tokens": 150,
                "prompt_tokens_details": {"cached_tokens": 20},
                "completion_tokens_details": {"reasoning_tokens": 10}
            }
        }"#;
        let resp: ChatCompletionResponse = serde_json::from_str(json).unwrap();
        let anthropic_resp = openai_to_anthropic_response(&resp).unwrap();
        // input_tokens = prompt_tokens - cached_tokens = 100 - 20 = 80
        assert_eq!(anthropic_resp.usage.input_tokens, 80);
        // output_tokens = completion_tokens - reasoning_tokens = 50 - 10 = 40
        assert_eq!(anthropic_resp.usage.output_tokens, 40);
        assert_eq!(anthropic_resp.usage.cache_read_input_tokens, Some(20));
    }

    #[test]
    fn test_response_finish_reason_max_tokens() {
        let json = r#"{
            "id": "chatcmpl-123",
            "object": "chat.completion",
            "created": 1700000000,
            "model": "kimi-k2.6",
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": "Hello"},
                "finish_reason": "length"
            }],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}
        }"#;
        let resp: ChatCompletionResponse = serde_json::from_str(json).unwrap();
        let anthropic_resp = openai_to_anthropic_response(&resp).unwrap();
        assert_eq!(anthropic_resp.stop_reason.as_deref(), Some("max_tokens"));
    }

    // ========================================================================
    // DeepSeek Thinking Tests
    // ========================================================================

    #[test]
    fn test_deepseek_thinking_enabled() {
        let json = r#"{
            "model": "deepseek-v4",
            "messages": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi!", "reasoning_content": "thinking..."}
            ],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "deepseek-v4").unwrap();
        let result = apply_deepseek_thinking(openai_req, "deepseek-v4", true);
        assert!(result.thinking.is_some());
        let thinking = result.thinking.unwrap();
        assert_eq!(thinking["type"], "enabled");
    }

    #[test]
    fn test_deepseek_thinking_disabled() {
        let json = r#"{
            "model": "deepseek-v4",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "deepseek-v4").unwrap();
        let result = apply_deepseek_thinking(openai_req, "deepseek-v4", false);
        assert!(result.thinking.is_some());
        let thinking = result.thinking.unwrap();
        assert_eq!(thinking["type"], "disabled");
        // reasoning_effort should be removed
        assert!(result.reasoning_effort.is_none());
    }

    #[test]
    fn test_deepseek_placeholder_for_assistant() {
        let json = r#"{
            "model": "deepseek-v4",
            "messages": [
                {"role": "user", "content": "Hello"},
                {"role": "assistant", "content": "Hi!"}
            ],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "deepseek-v4").unwrap();
        let result = apply_deepseek_thinking(openai_req, "deepseek-v4", true);
        // Assistant message without reasoning_content should get a placeholder
        let assistant_msg = result.messages.iter().find(|m| m.role == "assistant").unwrap();
        assert_eq!(assistant_msg.reasoning_content.as_deref(), Some(" "));
    }

    #[test]
    fn test_non_deepseek_unchanged() {
        let json = r#"{
            "model": "kimi-k2.6",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 4096
        }"#;
        let req: AnthropicMessageRequest = serde_json::from_str(json).unwrap();
        let openai_req = anthropic_to_openai_request(&req, "kimi-k2.6").unwrap();
        let result = apply_deepseek_thinking(openai_req, "kimi-k2.6", false);
        // Non-DeepSeek model should not have thinking field
        assert!(result.thinking.is_none());
    }

    // ========================================================================
    // SSE Conversion Tests
    // ========================================================================

    #[test]
    fn test_stream_text_only() {
        use bytes::Bytes;

        let sse_data = "data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"Hello\"},\"finish_reason\":null}]}\n\n\
                        data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\" world\"},\"finish_reason\":null}]}\n\n\
                        data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}\n\n\
                        data: [DONE]\n\n";

        let chunks: Vec<Result<Bytes, reqwest::Error>> = vec![Ok(Bytes::from(sse_data))];
        let stream = futures::stream::iter(chunks);
        let mut result = proxy_stream(Box::pin(stream));

        // Collect all output
        let mut output = String::new();
        loop {
            match futures::StreamExt::poll_next_unpin(&mut result, &mut std::task::Context::from_waker(
                futures::task::noop_waker_ref()
            )) {
                std::task::Poll::Ready(Some(Ok(bytes))) => {
                    output.push_str(&String::from_utf8_lossy(&bytes));
                }
                std::task::Poll::Ready(None) => break,
                std::task::Poll::Ready(Some(Err(_))) => break,
                std::task::Poll::Pending => break,
            }
        }

        // Should contain message_start, content_block_start, text deltas, content_block_stop, message_delta, message_stop
        assert!(output.contains("message_start"), "should have message_start");
        assert!(output.contains("content_block_start"), "should have content_block_start");
        assert!(output.contains("text_delta"), "should have text_delta");
        assert!(output.contains("content_block_stop"), "should have content_block_stop");
        assert!(output.contains("message_stop"), "should have message_stop");
    }

    #[test]
    fn test_stream_reasoning_and_text() {
        use bytes::Bytes;

        let sse_data = "data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{\"reasoning_content\":\"Let me think\"},\"finish_reason\":null}]}\n\n\
                        data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"The answer\"},\"finish_reason\":null}]}\n\n\
                        data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}\n\n\
                        data: [DONE]\n\n";

        let chunks: Vec<Result<Bytes, reqwest::Error>> = vec![Ok(Bytes::from(sse_data))];
        let stream = futures::stream::iter(chunks);
        let mut result = proxy_stream(Box::pin(stream));

        let mut output = String::new();
        loop {
            match futures::StreamExt::poll_next_unpin(&mut result, &mut std::task::Context::from_waker(
                futures::task::noop_waker_ref()
            )) {
                std::task::Poll::Ready(Some(Ok(bytes))) => {
                    output.push_str(&String::from_utf8_lossy(&bytes));
                }
                std::task::Poll::Ready(None) => break,
                std::task::Poll::Ready(Some(Err(_))) => break,
                std::task::Poll::Pending => break,
            }
        }

        assert!(output.contains("thinking_delta"), "should have thinking_delta");
        assert!(output.contains("text_delta"), "should have text_delta");
        assert!(output.contains("Let me think"), "should contain reasoning text");
        assert!(output.contains("The answer"), "should contain response text");
    }

    #[test]
    fn test_stream_tool_use() {
        use bytes::Bytes;

        let sse_data = "data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\": \\\"test.rs\\\"}\"}}]},\"finish_reason\":null}]}\n\n\
                        data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}\n\n\
                        data: [DONE]\n\n";

        let chunks: Vec<Result<Bytes, reqwest::Error>> = vec![Ok(Bytes::from(sse_data))];
        let stream = futures::stream::iter(chunks);
        let mut result = proxy_stream(Box::pin(stream));

        let mut output = String::new();
        loop {
            match futures::StreamExt::poll_next_unpin(&mut result, &mut std::task::Context::from_waker(
                futures::task::noop_waker_ref()
            )) {
                std::task::Poll::Ready(Some(Ok(bytes))) => {
                    output.push_str(&String::from_utf8_lossy(&bytes));
                }
                std::task::Poll::Ready(None) => break,
                std::task::Poll::Ready(Some(Err(_))) => break,
                std::task::Poll::Pending => break,
            }
        }

        assert!(output.contains("tool_use"), "should have tool_use content block");
        assert!(output.contains("input_json_delta"), "should have input_json_delta");
        assert!(output.contains("call_1"), "should contain tool call id");
        assert!(output.contains("read_file"), "should contain tool name");
    }

    #[test]
    fn test_stream_ghost_chunk() {
        use bytes::Bytes;

        // Ghost chunk: tool_call with no id and no function name
        let sse_data = "data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"path\\\":\\\"test.rs\\\"}\"}}]},\"finish_reason\":null}]}\n\n\
                        data: {\"id\":\"chatcmpl-1\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}\n\n\
                        data: [DONE]\n\n";

        let chunks: Vec<Result<Bytes, reqwest::Error>> = vec![Ok(Bytes::from(sse_data))];
        let stream = futures::stream::iter(chunks);
        let mut result = proxy_stream(Box::pin(stream));

        let mut output = String::new();
        loop {
            match futures::StreamExt::poll_next_unpin(&mut result, &mut std::task::Context::from_waker(
                futures::task::noop_waker_ref()
            )) {
                std::task::Poll::Ready(Some(Ok(bytes))) => {
                    output.push_str(&String::from_utf8_lossy(&bytes));
                }
                std::task::Poll::Ready(None) => break,
                std::task::Poll::Ready(Some(Err(_))) => break,
                std::task::Poll::Pending => break,
            }
        }

        // Ghost chunk should be skipped - no tool_use block should appear
        assert!(!output.contains("tool_use"), "ghost chunk should be skipped");
    }

    // ========================================================================
    // Escape JSON Test
    // ========================================================================

    #[test]
    fn test_escape_json() {
        assert_eq!(escape_json("hello"), "hello");
        assert_eq!(escape_json("hello \"world\""), "hello \\\"world\\\"");
        assert_eq!(escape_json("line1\nline2"), "line1\\nline2");
        assert_eq!(escape_json("tab\there"), "tab\\there");
        assert_eq!(escape_json("back\\slash"), "back\\\\slash");
    }
}
