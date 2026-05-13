export type Protocol = "OpenAI" | "Anthropic";
export type AuthScheme = "Bearer" | "ApiKey";

export interface Model {
  id: string;
  name: string;
  enabled: boolean;
  is_custom?: boolean;
}

export interface Provider {
  id: string;
  name: string;
  anthropic_url: string;
  openai_url: string;
  dual_protocol: boolean;
  protocol: Protocol;
  auth_scheme?: AuthScheme;
  models: Model[];
  enabled: boolean;
  priority: number;
  is_custom?: boolean;
}

export interface RetryConfig {
  max_retries: number;
  retry_delay_secs: number;
}

export interface QueueItem {
  provider_id: string;
  model_id: string;
}

export interface Queue {
  id: string;
  name: string;
  items: QueueItem[];
}

export type MatchRuleType = "user_agent_contains" | "header_equals" | "path_contains";

export interface MatchRule {
  type: MatchRuleType;
  pattern: string;
  header_name?: string;
}

export interface AppMapping {
  app_id: string;
  display_name: string;
  match_rules: MatchRule[];
  queue_id: string;
}

export interface QueueStateInfo {
  active_idx: number;
  exhausted_indices: number[];
  items: QueueItem[];
}

export interface AppConfig {
  providers: Provider[];
  retry: RetryConfig;
  queues: Record<string, Queue>;
  app_mapping: AppMapping[];
  default_queue_id: string;
  queue: QueueItem[];
  port: number;
}

export type ProxyLogLevel = "info" | "warn" | "error";

export interface ProxyLogEntry {
  id: number;
  timestamp_ms: number;
  level: ProxyLogLevel;
  message: string;
  fields: Record<string, string>;
  provider?: string;
  model?: string;
  status?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
  request_headers?: Record<string, string>;
}

export interface ProviderSwitchedPayload {
  queue_id: string;
  provider_name: string;
}

// Draft item for queue creation panel (same structure as QueueItem)
export type DraftItem = QueueItem;
