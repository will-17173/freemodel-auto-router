import { invoke } from "@tauri-apps/api/core";
import type { AppConfig, ProxyLogEntry } from "./types";

export const getConfig = (): Promise<AppConfig> => invoke("get_config");
export const saveConfig = (cfg: AppConfig): Promise<void> => invoke("save_config_cmd", { cfg });
export const injectProxy = (port: number, authToken: string, model: string): Promise<void> =>
  invoke("inject_proxy_cmd", { port, authToken, model });
export const updateActive = (authToken: string, model: string): Promise<void> =>
  invoke("update_active_cmd", { authToken, model });
export const removeProxy = (): Promise<void> => invoke("remove_proxy_cmd");
export const restoreBackup = (): Promise<void> => invoke("restore_backup_cmd");
export const hasBackup = (): Promise<boolean> => invoke("has_backup_cmd");
export const isInjected = (port: number): Promise<boolean> => invoke("is_injected_cmd", { port });
export const getProxyLogs = (): Promise<ProxyLogEntry[]> => invoke("get_proxy_logs_cmd");
export const restartProxy = (port: number): Promise<void> => invoke("restart_proxy_cmd", { port });
