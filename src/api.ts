import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, ProxyLogEntry, Model, Provider, Queue, AppMapping, QueueStateInfo, QueueItem, AppInstallations, UpdateInfo } from "./types";

export const getConfig = (): Promise<AppConfig> => invoke("get_config");
export const saveConfig = (cfg: AppConfig): Promise<void> => invoke("save_config_cmd", { cfg });
export const injectProxy = (port: number, authToken: string): Promise<void> =>
  invoke("inject_proxy_cmd", { port, authToken });
export const updateActive = (authToken: string): Promise<void> =>
  invoke("update_active_cmd", { authToken });
export const removeProxy = (): Promise<void> => invoke("remove_proxy_cmd");
export const restoreBackup = (): Promise<void> => invoke("restore_backup_cmd");
export const hasBackup = (): Promise<boolean> => invoke("has_backup_cmd");
export const isInjected = (port: number): Promise<boolean> => invoke("is_injected_cmd", { port });
export const getProxyLogs = (): Promise<ProxyLogEntry[]> => invoke("get_proxy_logs_cmd");
export const restartProxy = (port: number): Promise<void> => invoke("restart_proxy_cmd", { port });
export const detectAppInstallations = (): Promise<AppInstallations> => invoke("detect_app_installations_cmd");

// Auth API
export const getAuth = (providerId: string): Promise<string | null> => invoke("get_auth_cmd", { providerId });
export const saveAuth = (providerId: string, apiKey: string): Promise<void> => invoke("save_auth_cmd", { providerId, apiKey });
export const hasAuth = (providerId: string): Promise<boolean> => invoke("has_auth_cmd", { providerId });
export const getAllAuth = (): Promise<Record<string, boolean>> => invoke("get_all_auth_cmd");

// Injection API
export const injectCodex = (providerId: string, apiKey: string, port: number): Promise<void> =>
  invoke("inject_codex_cmd", { providerId, apiKey, port });
export const removeCodex = (): Promise<void> => invoke("remove_codex_cmd");
export const injectHermes = (providerId: string, apiKey: string, port: number): Promise<void> =>
  invoke("inject_hermes_cmd", { providerId, apiKey, port });
export const removeHermes = (providerId: string): Promise<void> => invoke("remove_hermes_cmd", { providerId });
export const isHermesInjected = (providerId: string): Promise<boolean> => invoke("is_hermes_injected_cmd", { providerId });
export const injectOpenclaw = (apiKey: string, port: number): Promise<void> =>
  invoke("inject_openclaw_cmd", { apiKey, port });
export const removeOpenclaw = (providerId: string): Promise<void> => invoke("remove_openclaw_cmd", { providerId });

// Queue state API
export const getQueueStates = (): Promise<Record<string, QueueStateInfo>> => invoke("get_queue_states_cmd");
export const resetQueueExhausted = (queueId: string): Promise<void> => invoke("reset_queue_exhausted_cmd", { queueId });

// Queue management API
export const createQueue = (name: string): Promise<Queue> => invoke("create_queue_cmd", { name });
export const deleteQueue = (queueId: string): Promise<void> => invoke("delete_queue_cmd", { queueId });
export const updateQueue = (queueId: string, name: string, items: QueueItem[]): Promise<void> =>
  invoke("update_queue_cmd", { queueId, name, items });
export const setDefaultQueue = (queueId: string): Promise<void> =>
  invoke("set_default_queue_cmd", { queueId });

// App mapping API
export const getAppMappings = (): Promise<AppMapping[]> => invoke("get_app_mappings_cmd");
export const updateAppMapping = (appId: string, queueId: string): Promise<void> =>
  invoke("update_app_mapping_cmd", { appId, queueId });

// Test connection
export interface TestConnectionResult {
  success: boolean;
  message: string;
  latency_ms: number | null;
}
export const testProviderConnection = (providerId: string): Promise<TestConnectionResult> =>
  invoke("test_provider_connection_cmd", { providerId });

// Provider API (new providers architecture)
export const getProviders = (): Promise<Provider[]> => invoke("get_providers_cmd");
export const saveCustomProvider = (provider: Provider): Promise<void> =>
  invoke("save_custom_provider_cmd", { provider });
export const deleteCustomProvider = (providerId: string): Promise<void> =>
  invoke("delete_custom_provider_cmd", { providerId });
export const addCustomModelToBuiltin = (providerId: string, model: Model): Promise<void> =>
  invoke("add_custom_model_to_builtin_cmd", { providerId, model });
export const deleteCustomModelFromBuiltin = (providerId: string, modelId: string): Promise<void> =>
  invoke("delete_custom_model_from_builtin_cmd", { providerId, modelId });

// Update check
export const checkUpdate = (): Promise<UpdateInfo> => invoke("check_update_cmd");
