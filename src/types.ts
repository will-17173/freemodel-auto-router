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
  base_url: string;
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
}
