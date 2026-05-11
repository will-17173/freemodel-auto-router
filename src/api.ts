import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "./types";

export const getConfig = (): Promise<AppConfig> => invoke("get_config");
export const saveConfig = (cfg: AppConfig): Promise<void> => invoke("save_config_cmd", { cfg });
export const injectProxy = (authToken: string, model: string): Promise<void> =>
  invoke("inject_proxy_cmd", { authToken, model });
export const updateActive = (authToken: string, model: string): Promise<void> =>
  invoke("update_active_cmd", { authToken, model });
export const removeProxy = (): Promise<void> => invoke("remove_proxy_cmd");
export const restoreBackup = (): Promise<void> => invoke("restore_backup_cmd");
export const hasBackup = (): Promise<boolean> => invoke("has_backup_cmd");
export const isInjected = (): Promise<boolean> => invoke("is_injected_cmd");
