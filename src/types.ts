export type Protocol = "OpenAI" | "Anthropic";
export type AuthScheme = "Bearer" | "ApiKey";

export interface Model {
  id: string;
  name: string;
  enabled: boolean;
}

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

export interface RetryConfig {
  max_retries: number;
  retry_delay_secs: number;
}

export interface QueueItem {
  provider_id: string;
  model_id: string;
}

export interface AppConfig {
  providers: Provider[];
  retry: RetryConfig;
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
}
