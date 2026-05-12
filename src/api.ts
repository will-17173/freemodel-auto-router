import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, ProxyLogEntry, Provider } from "./types";

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

export const injectCodex    = (provider: Provider): Promise<void> => invoke("inject_codex_cmd", { provider });
export const removeCodex    = (): Promise<void>                    => invoke("remove_codex_cmd");
export const injectHermes   = (provider: Provider): Promise<void> => invoke("inject_hermes_cmd", { provider });
export const removeHermes   = (providerId: string): Promise<void> => invoke("remove_hermes_cmd", { providerId });
export const isHermesInjected = (providerId: string): Promise<boolean> => invoke("is_hermes_injected_cmd", { providerId });
export const injectOpenclaw = (provider: Provider): Promise<void> => invoke("inject_openclaw_cmd", { provider });
export const removeOpenclaw = (providerId: string): Promise<void> => invoke("remove_openclaw_cmd", { providerId });

export const getExhaustedIndices = (): Promise<number[]> => invoke("get_exhausted_indices_cmd");
export const getActiveIdx = (): Promise<number> => invoke("get_active_idx_cmd");
export const resetExhausted = (): Promise<void> => invoke("reset_exhausted_cmd");
