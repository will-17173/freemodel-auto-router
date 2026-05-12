import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, ProxyLogEntry, Model } from "./types";

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

// Auth API
export const getAuth = (providerId: string): Promise<string | null> => invoke("get_auth_cmd", { providerId });
export const saveAuth = (providerId: string, apiKey: string): Promise<void> => invoke("save_auth_cmd", { providerId, apiKey });
export const hasAuth = (providerId: string): Promise<boolean> => invoke("has_auth_cmd", { providerId });
export const getAllAuth = (): Promise<Record<string, boolean>> => invoke("get_all_auth_cmd");

// Injection API - now use provider_id and api_key separately
export const injectCodex = (providerId: string, apiKey: string, port: number): Promise<void> =>
  invoke("inject_codex_cmd", { providerId, apiKey, port });
export const removeCodex = (): Promise<void> => invoke("remove_codex_cmd");
export const injectHermes = (providerId: string, apiKey: string, port: number): Promise<void> =>
  invoke("inject_hermes_cmd", { providerId, apiKey, port });
export const removeHermes = (providerId: string): Promise<void> => invoke("remove_hermes_cmd", { providerId });
export const isHermesInjected = (providerId: string): Promise<boolean> => invoke("is_hermes_injected_cmd", { providerId });
export const injectOpenclaw = (providerId: string, apiKey: string, models: Model[], port: number): Promise<void> =>
  invoke("inject_openclaw_cmd", { providerId, apiKey, models, port });
export const removeOpenclaw = (providerId: string): Promise<void> => invoke("remove_openclaw_cmd", { providerId });

export const getExhaustedIndices = (): Promise<number[]> => invoke("get_exhausted_indices_cmd");
export const getActiveIdx = (): Promise<number> => invoke("get_active_idx_cmd");
export const resetExhausted = (): Promise<void> => invoke("reset_exhausted_cmd");