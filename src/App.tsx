import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { sendNotification } from "@tauri-apps/plugin-notification";
import {
  getConfig, saveConfig, injectProxy, updateActive, restoreBackup, isInjected, restartProxy,
  detectAppInstallations,
  injectCodex, removeCodex, injectHermes, removeHermes, isHermesInjected,
  injectOpenclaw, removeOpenclaw,
  getQueueStates, createQueue, deleteQueue, updateQueue, setDefaultQueue,
  getAuth, saveAuth, getAllAuth,
  getProviders, deleteCustomProvider, deleteCustomModelFromBuiltin, addCustomModelToBuiltin, saveCustomProvider,
} from "./api";
import { Sidebar, type PageId } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ProvidersPage } from "./components/ProvidersPage";
import { LogsPage } from "./components/LogsPage";
import { SettingsPage } from "./components/SettingsPage";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { AddProviderModal, type AddProviderPayload } from "./components/AddProviderModal";
import { AddModelModal } from "./components/AddModelModal";
import { OnboardingModal } from "./components/OnboardingModal";
import { ToastProvider, useToast } from "./components/ui/toast";
import { dedupeQueueItems } from "./lib/queue";
import { ONBOARDING_SEEN_VALUE, shouldShowOnboarding } from "./lib/onboarding";
import { trackEvent } from "./lib/analytics";
import { initTheme, getTheme as getStoredTheme, setTheme as applyTheme, type ThemeMode } from "./lib/theme";
import type { AppConfig, Provider, QueueStateInfo, ProviderSwitchedPayload, DraftItem, AppInstallations } from "./types";
import "./App.css";

// Init theme immediately (before first render)
initTheme();

function slugifyProviderName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "custom-provider";
}

function createProviderId(name: string, providers: Provider[]) {
  const usedIds = new Set(providers.map((provider) => provider.id));
  const baseId = slugifyProviderName(name);
  let id = baseId;
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function AppContent() {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);  // 独立 providers 状态
  const [authMap, setAuthMap] = useState<Record<string, boolean>>({});  // provider_id -> hasKey
  const [currentPage, setCurrentPage] = useState<PageId>("providers");
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editingKeyProviderId, setEditingKeyProviderId] = useState<string | null>(null);
  const [addingModelProviderId, setAddingModelProviderId] = useState<string | null>(null);
  const [appStates, setAppStates] = useState({
    cc: false,
    codex: false,
    hermes: false,
    openclaw: false,
  });
  const [queueStates, setQueueStates] = useState<Record<string, QueueStateInfo>>({});
  const [appInstallations, setAppInstallations] = useState<AppInstallations | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(getStoredTheme);

  // Edit panel state
  const [editPanelMode, setEditPanelMode] = useState<"new" | "edit" | null>(null);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editPanelName, setEditPanelName] = useState("");
  const [editPanelItems, setEditPanelItems] = useState<DraftItem[]>([]);
  const { showToast } = useToast();

  function handlePageChange(page: PageId) {
    if (page !== currentPage) {
      trackEvent("page_viewed", { page });
    }
    setCurrentPage(page);
  }

  useEffect(() => {
    getConfig().then(setConfig);
    getProviders().then(setProviders);
    getAllAuth().then(setAuthMap);
    detectAppInstallations().then(setAppInstallations).catch(console.error);
    setShowOnboarding(shouldShowOnboarding(localStorage.getItem("freemodel:onboarding")));
  }, []);

  function closeOnboarding() {
    localStorage.setItem("freemodel:onboarding", ONBOARDING_SEEN_VALUE);
    setShowOnboarding(false);
  }

  useEffect(() => {
    if (config) isInjected(config.port).then((v) => setAppStates(prev => ({ ...prev, cc: v }))).catch(console.error);
  }, [config?.port]);

  useEffect(() => {
    const unlisten = listen<ProviderSwitchedPayload>("provider-switched", (e) => {
      sendNotification({
        title: "freemodel router",
        body: `队列 ${e.payload.queue_id} 已切换到 ${e.payload.provider_name}`,
      });
      getQueueStates().then(setQueueStates).catch(console.error);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // Poll queue states every 5 seconds (start once config is available)
  const configLoaded = config !== null;
  useEffect(() => {
    if (!configLoaded) return;
    const interval = setInterval(() => {
      getQueueStates().then(setQueueStates).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [configLoaded]);

  // Load queue states on config load
  useEffect(() => {
    if (!config) return;
    getQueueStates().then(setQueueStates).catch(console.error);
  }, [config?.default_queue_id]);

  // 当代理已注入且队列首项（provider key 或 model）发生变化时，
  // 同步刷新 settings.json 里的 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL。
  useEffect(() => {
    if (!appStates.cc || !config) return;
    const defaultQueue = config.queues[config.default_queue_id];
    const head = defaultQueue?.items[0];
    if (!head) return;
    const provider = providers.find((p) => p.id === head.provider_id);
    if (!provider) return;
    if (!authMap[provider.id]) return;
    getAuth(provider.id).then((key) => {
      if (key && key.trim().length > 0) {
        updateActive(key).catch(console.error);
      }
    }).catch(console.error);
  }, [
    appStates.cc,
    providers,
    config?.queues?.[config?.default_queue_id ?? ""]?.items[0]?.provider_id,
    config?.queues?.[config?.default_queue_id ?? ""]?.items[0]?.model_id,
    authMap,
  ]);

  // 初始化时检查 Hermes 配置状态（必须在所有早期 return 之前）
  useEffect(() => {
    if (!config) return;
    const defaultQueue = config.queues[config.default_queue_id];
    const defaultQueueState = queueStates[config.default_queue_id];
    const activeIdx = defaultQueueState?.active_idx ?? 0;
    const activeItem = defaultQueue?.items[activeIdx];
    const provider = activeItem
      ? providers.find((p) => p.id === activeItem.provider_id)
      : undefined;
    if (!provider) return;
    isHermesInjected(provider.id)
      .then((v) => setAppStates(prev => ({ ...prev, hermes: v })))
      .catch(console.error);
  }, [config, providers, queueStates]);

  // Close edit panel when switching away from providers page
  useEffect(() => {
    if (currentPage !== "providers" && editPanelMode) {
      closeEditPanel();
    }
  }, [currentPage]);

  if (!config) return (
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-foreground animate-pulse" />
        <span className="text-sm text-muted-foreground">初始化中…</span>
      </div>
    </div>
  );

  function updateAndSave(next: AppConfig) {
    setConfig(next);
    saveConfig(next);
    getQueueStates().then(setQueueStates).catch(console.error);
  }

  // === 编辑面板操作 ===

  function addToEditPanel(providerId: string, modelId: string) {
    if (!authMap[providerId]) return;  // 需要 API key 才能添加
    if (!editPanelMode) return;        // 面板未打开时不添加
    let duplicated = false;
    setEditPanelItems((currentItems) => {
      const exists = currentItems.some(
        (item) => item.provider_id === providerId && item.model_id === modelId
      );
      if (exists) {
        duplicated = true;
        return currentItems;
      }
      trackEvent("queue_item_added");
      return [...currentItems, { provider_id: providerId, model_id: modelId }];
    });
    if (duplicated) showToast("info", "该模型已存在于队列中");
  }

  function openEditPanel(queueId: string) {
    const queue = config!.queues[queueId];
    if (!queue) return;
    setEditPanelMode("edit");
    setEditingQueueId(queueId);
    setEditPanelName(queue.name);
    setEditPanelItems(dedupeQueueItems(queue.items));
  }

  function openNewPanel() {
    const queueCount = Object.keys(config!.queues).length;
    const defaultName = `队列 ${queueCount + 1}`;
    setEditPanelMode("new");
    setEditingQueueId(null);
    setEditPanelName(defaultName);
    setEditPanelItems([]);
  }

  function closeEditPanel() {
    setEditPanelMode(null);
    setEditingQueueId(null);
    setEditPanelName("");
    setEditPanelItems([]);
  }

  function cancelEditPanel() {
    closeEditPanel();
  }

  function removeFromEditPanel(index: number) {
    setEditPanelItems(editPanelItems.filter((_, i) => i !== index));
    trackEvent("queue_item_removed");
  }

  function reorderEditPanelItems(newItems: DraftItem[]) {
    setEditPanelItems(dedupeQueueItems(newItems));
    trackEvent("queue_reordered", { item_count: newItems.length });
  }

  function clearEditPanelItems() {
    setEditPanelItems([]);
    trackEvent("queue_cleared");
  }

  async function saveEditPanel() {
    if (!editPanelName.trim()) {
      showToast("error", "队列名不能为空");
      return;
    }
    if (editPanelItems.length === 0) {
      showToast("error", "队列为空，请添加至少一个模型");
      return;
    }

    try {
      const savedItems = dedupeQueueItems(editPanelItems);
      if (editPanelMode === "new") {
        const newQueue = await createQueue(editPanelName);
        await updateQueue(newQueue.id, editPanelName, savedItems);
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                queues: { ...prev.queues, [newQueue.id]: { ...newQueue, items: savedItems } },
              }
            : prev
        );
        trackEvent("queue_created", { item_count: savedItems.length });
        showToast("success", `队列 "${editPanelName}" 创建成功`);
      } else {
        await updateQueue(editingQueueId!, editPanelName, savedItems);
        setConfig((prev) =>
          prev
            ? {
                ...prev,
                queues: {
                  ...prev.queues,
                  [editingQueueId!]: { ...prev.queues[editingQueueId!], name: editPanelName, items: savedItems },
                },
              }
            : prev
        );
        trackEvent("queue_updated", { item_count: savedItems.length });
        showToast("success", `队列 "${editPanelName}" 已保存`);
      }
      closeEditPanel();
    } catch (e) {
      showToast("error", "保存失败");
      console.error(e);
    }
  }

  async function handleSetDefaultQueue(queueId: string) {
    if (queueId === config?.default_queue_id) return;
    try {
      await setDefaultQueue(queueId);
      setConfig((prev) => prev ? { ...prev, default_queue_id: queueId } : prev);
      trackEvent("queue_default_changed");
    } catch (e) {
      showToast("error", "切换当前队列失败");
      console.error(e);
    }
  }

  async function handleDeleteQueue(queueId: string) {
    if (queueId === config?.default_queue_id) return;
    const queue = config!.queues[queueId];
    if (!queue) return;

    try {
      await deleteQueue(queueId);
      setConfig((prev) => {
        if (!prev) return prev;
        const updatedQueues = { ...prev.queues };
        delete updatedQueues[queueId];
        return {
          ...prev,
          queues: updatedQueues,
          app_mapping: prev.app_mapping.filter((mapping) => mapping.queue_id !== queueId),
        };
      });
      setQueueStates((prev) => {
        const next = { ...prev };
        delete next[queueId];
        return next;
      });
      if (editingQueueId === queueId) {
        closeEditPanel();
      }
      trackEvent("queue_deleted");
      showToast("success", `队列 "${queue.name}" 已删除`);
    } catch (e) {
      showToast("error", "删除队列失败");
      console.error(e);
    }
  }

  async function saveApiKey(providerId: string, key: string) {
    await saveAuth(providerId, key);
    setAuthMap((prev) => ({ ...prev, [providerId]: key.trim().length > 0 }));
    trackEvent("api_key_saved", {
      provider_type: providers.find((provider) => provider.id === providerId)?.is_custom ? "custom" : "builtin",
      has_key: key.trim().length > 0,
    });
  }

  async function addModel(providerId: string, modelId: string) {
    await addCustomModelToBuiltin(providerId, { id: modelId, name: modelId, is_custom: true });
    setProviders(await getProviders());
    setAddingModelProviderId(null);
    trackEvent("model_added", {
      provider_type: providers.find((provider) => provider.id === providerId)?.is_custom ? "custom" : "builtin",
    });
  }

  async function handleAppToggle(appId: string, enabled: boolean) {
    if (appId === "cc") {
      if (enabled) {
        await injectProxy(config!.port, await getAuth(activeProvider!.id) || "");
        setAppStates(prev => ({ ...prev, cc: true }));
        trackEvent("app_integration_toggled", { app_id: appId, enabled });
      } else {
        await restoreBackup();
        setAppStates(prev => ({ ...prev, cc: false }));
        trackEvent("app_integration_toggled", { app_id: appId, enabled });
      }
    } else if (appId === "codex") {
      if (enabled) {
        const apiKey = await getAuth(activeProvider!.id) || "";
        await injectCodex(activeProvider!.id, apiKey, config!.port);
        setAppStates(prev => ({ ...prev, codex: true }));
        trackEvent("app_integration_toggled", { app_id: appId, enabled });
      } else {
        await removeCodex();
        setAppStates(prev => ({ ...prev, codex: false }));
        trackEvent("app_integration_toggled", { app_id: appId, enabled });
      }
    } else if (appId === "hermes") {
      try {
        if (enabled) {
          const apiKey = await getAuth(activeProvider!.id) || "";
          await injectHermes(activeProvider!.id, apiKey, config!.port);
          setAppStates(prev => ({ ...prev, hermes: true }));
          trackEvent("app_integration_toggled", { app_id: appId, enabled });
        } else {
          await removeHermes(activeProvider!.id);
          setAppStates(prev => ({ ...prev, hermes: false }));
          trackEvent("app_integration_toggled", { app_id: appId, enabled });
        }
      } catch (e) {
        console.error("Hermes 配置操作失败:", e);
      }
    } else if (appId === "openclaw") {
      if (enabled) {
        const apiKey = await getAuth(activeProvider!.id) || "";
        await injectOpenclaw(apiKey, config!.port);
        setAppStates(prev => ({ ...prev, openclaw: true }));
        trackEvent("app_integration_toggled", { app_id: appId, enabled });
      } else {
        await removeOpenclaw(activeProvider!.id);
        setAppStates(prev => ({ ...prev, openclaw: false }));
        trackEvent("app_integration_toggled", { app_id: appId, enabled });
      }
    }
  }

  async function addProvider(input: AddProviderPayload) {
    const nextProvider: Provider = {
      id: createProviderId(input.name, providers),
      name: input.name,
      anthropic_url: input.anthropicUrl,
      openai_url: input.openaiUrl,
      dual_protocol: input.dualProtocol,
      protocol: "Anthropic",
      auth_scheme: "ApiKey",
      models: input.modelIds.map((modelId) => ({
        id: modelId,
        name: modelId,
        is_custom: true,
      })),
      priority: Math.max(0, ...providers.map((provider) => provider.priority)) + 1,
      is_custom: true,
      link: input.link || undefined,
    };

    await saveCustomProvider(nextProvider);
    setProviders(await getProviders());
    if (input.apiKey.trim().length > 0) {
      await saveAuth(nextProvider.id, input.apiKey);
      setAuthMap((prev) => ({ ...prev, [nextProvider.id]: true }));
    }
    trackEvent("provider_created", {
      model_count: nextProvider.models.length,
      dual_protocol: nextProvider.dual_protocol,
    });
  }

  function handleDeleteProvider(providerId: string) {
    deleteCustomProvider(providerId).then(async () => {
      setProviders(await getProviders());
      // 从所有队列中移除该服务商的项目
      setConfig((prev) => {
        if (!prev) return prev;
        const updatedQueues = { ...prev.queues };
        for (const queueId in updatedQueues) {
          updatedQueues[queueId] = {
            ...updatedQueues[queueId],
            items: updatedQueues[queueId].items.filter((item) => item.provider_id !== providerId),
          };
        }
        // 更新队列
        for (const queueId in updatedQueues) {
          updateQueue(queueId, updatedQueues[queueId].name, updatedQueues[queueId].items).catch(console.error);
        }
        return { ...prev, queues: updatedQueues };
      });
      setAuthMap((prev) => {
        const next = { ...prev };
        delete next[providerId];
        return next;
      });
      trackEvent("provider_deleted");
    }).catch((e) => {
      alert(`删除失败: ${e}`);
      console.error(e);
    });
  }

  function handleDeleteModel(providerId: string, modelId: string) {
    deleteCustomModelFromBuiltin(providerId, modelId).then(async () => {
      setProviders(await getProviders());
      // 从所有队列中移除该模型
      setConfig((prev) => {
        if (!prev) return prev;
        const updatedQueues = { ...prev.queues };
        for (const queueId in updatedQueues) {
          updatedQueues[queueId] = {
            ...updatedQueues[queueId],
            items: updatedQueues[queueId].items.filter(
              (item) => item.provider_id !== providerId || item.model_id !== modelId
            ),
          };
        }
        // 更新队列
        for (const queueId in updatedQueues) {
          updateQueue(queueId, updatedQueues[queueId].name, updatedQueues[queueId].items).catch(console.error);
        }
        return { ...prev, queues: updatedQueues };
      });
      trackEvent("model_deleted");
    }).catch((e) => {
      alert(`删除失败: ${e}`);
      console.error(e);
    });
  }

  const editingKeyProvider = editingKeyProviderId
    ? providers.find((p) => p.id === editingKeyProviderId) ?? null
    : null;

  const addingModelProvider = addingModelProviderId
    ? providers.find((p) => p.id === addingModelProviderId) ?? null
    : null;

  // Use default queue's active item for global status display
  const defaultQueueState = queueStates[config.default_queue_id];
  const defaultQueue = config.queues[config.default_queue_id];
  const defaultActiveIdx = defaultQueueState?.active_idx ?? 0;
  const activeQueueItem = defaultQueue?.items[defaultActiveIdx] ?? defaultQueue?.items[0];
  const activeProvider = activeQueueItem
    ? providers.find((p) => p.id === activeQueueItem.provider_id)
    : undefined;
  const activeModel = activeProvider?.models.find((m) => m.id === activeQueueItem?.model_id);
  const isActive = !!(activeProvider && activeModel);


  return (
    <div className="h-screen flex bg-background text-foreground">
        {/* Sidebar */}
        <Sidebar currentPage={currentPage} onPageChange={handlePageChange} />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* TopBar */}
          <TopBar
            port={config.port}
            isActive={isActive}
            appStates={appStates}
            appInstallations={appInstallations}
            onAppToggle={handleAppToggle}
            config={config}
            providers={providers}
            queueStates={queueStates}
          />

          {/* Page content */}
          {currentPage === "providers" && (
            <ProvidersPage
              providers={providers}
              authMap={authMap}
              onAddToQueue={addToEditPanel}
              onConfigKey={(id) => setEditingKeyProviderId(id)}
              onAddModel={(id) => setAddingModelProviderId(id)}
              onAddProvider={() => setShowAddProvider(true)}
              onDeleteProvider={handleDeleteProvider}
              onDeleteModel={handleDeleteModel}
              // 队列标签栏
              queues={config.queues}
              queueStates={queueStates}
              defaultQueueId={config.default_queue_id}
              selectedQueueId={editingQueueId}
              onSelectQueue={openEditPanel}
              onSetDefaultQueue={handleSetDefaultQueue}
              onDeleteQueue={handleDeleteQueue}
              onNewQueue={openNewPanel}
              // 编辑面板
              editPanelMode={editPanelMode}
              editPanelName={editPanelName}
              editPanelItems={editPanelItems}
              onEditPanelNameChange={setEditPanelName}
              onRemoveEditPanelItem={removeFromEditPanel}
              onReorderEditPanelItems={reorderEditPanelItems}
              onClearEditPanelItems={clearEditPanelItems}
              onCloseEditPanel={closeEditPanel}
              onCancelEditPanel={cancelEditPanel}
              onSaveEditPanel={saveEditPanel}
              onTrackEvent={trackEvent}
            />
          )}
          {currentPage === "logs" && (
            <LogsPage port={config.port} />
          )}
          {currentPage === "settings" && (
            <SettingsPage
              retry={config.retry}
              port={config.port}
              themeMode={themeMode}
              onThemeChange={(mode) => {
                setThemeMode(mode);
                applyTheme(mode);
              }}
              onSave={(retry, newPort, portChanged) => {
                const next = { ...config, retry, port: newPort };
                updateAndSave(next);
                trackEvent("settings_saved", {
                  port_changed: portChanged,
                  max_retries: retry.max_retries,
                  retry_delay_secs: retry.retry_delay_secs,
                });
                if (portChanged) {
                  restartProxy(newPort).then(async () => {
                    if (appStates.cc) {
                      const dq = next.queues[next.default_queue_id];
                      const head = dq?.items[0];
                      const p = head ? providers.find((pr) => pr.id === head.provider_id) : undefined;
                      if (p) {
                        const apiKey = await getAuth(p.id);
                        if (apiKey && apiKey.trim().length > 0) {
                          injectProxy(newPort, apiKey).catch(console.error);
                        }
                      }
                    }
                  }).catch(console.error);
                }
              }}
            />
          )}
        </div>

      {/* Modals */}
      <OnboardingModal open={showOnboarding} onClose={closeOnboarding} />

      {showAddProvider && (
        <AddProviderModal
          onSave={addProvider}
          onClose={() => setShowAddProvider(false)}
        />
      )}

      {editingKeyProvider && (
        <ApiKeyModal
          providerId={editingKeyProvider.id}
          providerName={editingKeyProvider.name}
          onSave={(key) => saveApiKey(editingKeyProvider.id, key)}
          onClose={() => setEditingKeyProviderId(null)}
        />
      )}

      {addingModelProvider && (
        <AddModelModal
          providerName={addingModelProvider.name}
          existingModelIds={addingModelProvider.models.map((m) => m.id)}
          onSave={(modelIds) => {
            modelIds.forEach((modelId) => addModel(addingModelProvider.id, modelId));
          }}
          onClose={() => setAddingModelProviderId(null)}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
