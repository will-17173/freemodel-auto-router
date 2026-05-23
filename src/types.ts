export type Protocol = "OpenAI" | "Anthropic";
export type AuthScheme = "Bearer" | "ApiKey";

export interface Model {
  id: string;
  name: string;
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
  priority: number;
  is_custom?: boolean;
  link?: string;
  description?: string;
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

export interface ScenarioRoutingConfig {
  long_context_model: string;
  complex_model: string;
  think_model: string;
  background_model: string;
  default_model: string;
  fast_model: string;
  long_context_threshold: number;
}

export interface AppConfig {
  retry: RetryConfig;
  queues: Record<string, Queue>;
  app_mapping: AppMapping[];
  default_queue_id: string;
  scenario_routing: ScenarioRoutingConfig;
  respect_requested_model: boolean;
  queue: QueueItem[];
  port: number;
}

export type ProxyLogLevel = "info" | "warn" | "error";

export interface ProxyLogEntry {
  id: number;
  request_id?: string;  // 用于关联同一请求的开始和结束
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
  response_headers?: Record<string, string>;  // 新增响应头
  is_final: boolean;  // true 表示请求完成，false 表示进行中
}

export interface ProviderSwitchedPayload {
  queue_id: string;
  provider_name: string;
}

export interface AppInstallInfo {
  installed: boolean;
  command_found: boolean;
  config_found: boolean;
  version?: string | null;
}

export interface AppInstallations {
  cc: AppInstallInfo;
  codex: AppInstallInfo;
  hermes: AppInstallInfo;
  openclaw: AppInstallInfo;
}

// Draft item for queue creation panel (same structure as QueueItem)
export type DraftItem = QueueItem;

// providers.json 结构
export interface ProvidersConfig {
  version: number;
  format_version: number;
  providers: Provider[];
}

// custom_providers.json 结构
export interface CustomProvidersConfig {
  custom_providers: Provider[];
  custom_models_in_builtin: Record<string, Model[]>;
}

// 版本更新信息
export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_url: string;
  release_notes?: string;
}
