import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { sendNotification } from "@tauri-apps/plugin-notification";
import {
  getConfig, saveConfig, injectProxy, updateActive, restoreBackup, isInjected, restartProxy,
  injectCodex, removeCodex, injectHermes, removeHermes, isHermesInjected,
  injectOpenclaw, removeOpenclaw,
  getQueueStates, resetQueueExhausted, createQueue, deleteQueue, updateQueue,
  getAuth, saveAuth, getAllAuth,
} from "./api";
import { Sidebar, type PageId } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { ProvidersPage } from "./components/ProvidersPage";
import { QueuePage } from "./components/QueuePage";
import { LogsPage } from "./components/LogsPage";
import { SettingsPage } from "./components/SettingsPage";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { AddProviderModal, type AddProviderPayload } from "./components/AddProviderModal";
import { AddModelModal } from "./components/AddModelModal";
import type { AppConfig, Provider, QueueItem, QueueStateInfo, ProviderSwitchedPayload, DraftItem } from "./types";
import "./App.css";

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

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
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
  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(null);

  // Draft queue panel state
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const [draftQueueName, setDraftQueueName] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  useEffect(() => {
    getConfig().then(setConfig);
    getAllAuth().then(setAuthMap);
  }, []);

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
    setSelectedQueueId(config.default_queue_id);
  }, [config?.default_queue_id]);

  // 当代理已注入且队列首项（provider key 或 model）发生变化时，
  // 同步刷新 settings.json 里的 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL。
  useEffect(() => {
    if (!appStates.cc || !config) return;
    const defaultQueue = config.queues[config.default_queue_id];
    const head = defaultQueue?.items[0];
    if (!head) return;
    const provider = config.providers.find((p) => p.id === head.provider_id);
    if (!provider) return;
    if (!authMap[provider.id]) return;
    getAuth(provider.id).then((key) => {
      if (key && key.trim().length > 0) {
        updateActive(key).catch(console.error);
      }
    }).catch(console.error);
  }, [
    appStates.cc,
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
      ? config.providers.find((p) => p.id === activeItem.provider_id)
      : undefined;
    if (!provider) return;
    isHermesInjected(provider.id)
      .then((v) => setAppStates(prev => ({ ...prev, hermes: v })))
      .catch(console.error);
  }, [config, queueStates]);

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

  function addToQueue(providerId: string, modelId: string) {
    if (!authMap[providerId]) return;  // 需要 API key 才能添加

    if (showDraftPanel) {
      addToDraft(providerId, modelId);
      return;
    }

    if (!selectedQueueId) return;
    const newItem: QueueItem = { provider_id: providerId, model_id: modelId };
    const queue = config!.queues[selectedQueueId];
    if (!queue) return;
    const updatedQueue = { ...queue, items: [...queue.items, newItem] };
    updateAndSave({ ...config!, queues: { ...config!.queues, [selectedQueueId]: updatedQueue } });
  }

  function removeFromQueue(queueId: string, index: number) {
    const queue = config!.queues[queueId];
    if (!queue) return;
    const newItems = queue.items.filter((_, i) => i !== index);
    const updatedQueue = { ...queue, items: newItems };
    updateAndSave({ ...config!, queues: { ...config!.queues, [queueId]: updatedQueue } });
    // If default queue is now empty, turn off all injections
    if (queueId === config!.default_queue_id && newItems.length === 0) {
      if (appStates.cc) { restoreBackup().catch(console.error); }
      if (appStates.codex) { removeCodex().catch(console.error); }
      if (appStates.hermes && activeProvider) { removeHermes(activeProvider.id).catch(console.error); }
      if (appStates.openclaw && activeProvider) { removeOpenclaw(activeProvider.id).catch(console.error); }
      setAppStates({ cc: false, codex: false, hermes: false, openclaw: false });
    }
  }

  function reorderQueue(queueId: string, newItems: QueueItem[]) {
    const queue = config!.queues[queueId];
    if (!queue) return;
    const updatedQueue = { ...queue, items: newItems };
    updateAndSave({ ...config!, queues: { ...config!.queues, [queueId]: updatedQueue } });
  }

  function handleCreateQueue(name: string) {
    createQueue(name).then((newQueue) => {
      setConfig(prev => prev ? {
        ...prev,
        queues: { ...prev.queues, [newQueue.id]: newQueue }
      } : prev);
      setSelectedQueueId(newQueue.id);
      // Save already done by create_queue_cmd on backend
    }).catch(console.error);
  }

  function handleDeleteQueue(queueId: string) {
    deleteQueue(queueId).then(() => {
      setConfig(prev => {
        if (!prev) return prev;
        const updatedQueues = { ...prev.queues };
        delete updatedQueues[queueId];
        return { ...prev, queues: updatedQueues };
      });
      setSelectedQueueId(prev => {
        if (prev !== queueId) return prev;
        const remaining = Object.keys(config!.queues).filter(id => id !== queueId);
        return remaining[0] ?? null;
      });
    }).catch(console.error);
  }

  function handleResetQueueExhausted(queueId: string) {
    resetQueueExhausted(queueId).then(() => {
      getQueueStates().then(setQueueStates).catch(console.error);
    }).catch(console.error);
  }

  function clearAndCloseDraft() {
    setDraftItems([]);
    setDraftQueueName("");
    setShowDraftPanel(false);
  }

  function openDraftPanel() {
    const queueCount = Object.keys(config!.queues).length;
    const defaultName = `队列 ${queueCount + 1}`;
    setDraftQueueName(defaultName);
    setDraftItems([]);
    setShowDraftPanel(true);
  }

  function addToDraft(providerId: string, modelId: string) {
    const exists = draftItems.some(
      (item) => item.provider_id === providerId && item.model_id === modelId
    );
    if (exists) {
      alert("该模型已存在于缓存区");
      return;
    }
    setDraftItems([...draftItems, { provider_id: providerId, model_id: modelId }]);
  }

  function removeFromDraft(index: number) {
    setDraftItems(draftItems.filter((_, i) => i !== index));
  }

  function reorderDraftItems(newItems: DraftItem[]) {
    setDraftItems(newItems);
  }

  function clearDraftItems() {
    setDraftItems([]);
  }

  function closeDraftPanel() {
    if (draftItems.length > 0) {
      if (window.confirm("缓存区有未保存的内容，关闭将丢弃。确定关闭？")) {
        clearAndCloseDraft();
      }
      return;
    }
    clearAndCloseDraft();
  }

  function cancelDraftPanel() {
    if (draftItems.length > 0) {
      if (window.confirm("未保存的内容将丢弃。确定取消？")) {
        clearAndCloseDraft();
      }
      return;
    }
    clearAndCloseDraft();
  }

  async function saveDraftQueue() {
    if (!draftQueueName.trim()) {
      alert("队列名不能为空");
      return;
    }
    if (draftItems.length === 0) {
      alert("缓存区为空，请添加至少一个模型");
      return;
    }

    try {
      const newQueue = await createQueue(draftQueueName);
      await updateQueue(newQueue.id, draftQueueName, draftItems);

      setConfig((prev) =>
        prev
          ? {
              ...prev,
              queues: { ...prev.queues, [newQueue.id]: { ...newQueue, items: draftItems } },
            }
          : prev
      );
      setSelectedQueueId(newQueue.id);

      clearAndCloseDraft();
      alert(`队列 "${draftQueueName}" 创建成功`);
    } catch (e) {
      alert("创建队列失败");
      console.error(e);
    }
  }

  async function saveApiKey(providerId: string, key: string) {
    await saveAuth(providerId, key);
    setAuthMap((prev) => ({ ...prev, [providerId]: key.trim().length > 0 }));
  }

  function addModel(providerId: string, modelId: string) {
    const providers = config!.providers.map((p) =>
      p.id !== providerId
        ? p
        : { ...p, models: [...p.models, { id: modelId, name: modelId, enabled: true }] }
    );
    updateAndSave({ ...config!, providers });
    setAddingModelProviderId(null);
  }

  async function handleAppToggle(appId: string, enabled: boolean) {
    if (appId === "cc") {
      if (enabled) {
        await injectProxy(config!.port, await getAuth(activeProvider!.id) || "");
        setAppStates(prev => ({ ...prev, cc: true }));
      } else {
        await restoreBackup();
        setAppStates(prev => ({ ...prev, cc: false }));
      }
    } else if (appId === "codex") {
      if (enabled) {
        const apiKey = await getAuth(activeProvider!.id) || "";
        await injectCodex(activeProvider!.id, apiKey, config!.port);
        setAppStates(prev => ({ ...prev, codex: true }));
      } else {
        await removeCodex();
        setAppStates(prev => ({ ...prev, codex: false }));
      }
    } else if (appId === "hermes") {
      try {
        if (enabled) {
          const apiKey = await getAuth(activeProvider!.id) || "";
          await injectHermes(activeProvider!.id, apiKey, config!.port);
          setAppStates(prev => ({ ...prev, hermes: true }));
        } else {
          await removeHermes(activeProvider!.id);
          setAppStates(prev => ({ ...prev, hermes: false }));
        }
      } catch (e) {
        console.error("Hermes 配置操作失败:", e);
      }
    } else if (appId === "openclaw") {
      if (enabled) {
        const apiKey = await getAuth(activeProvider!.id) || "";
        await injectOpenclaw(activeProvider!.id, apiKey, activeProvider!.models, config!.port);
        setAppStates(prev => ({ ...prev, openclaw: true }));
      } else {
        await removeOpenclaw(activeProvider!.id);
        setAppStates(prev => ({ ...prev, openclaw: false }));
      }
    }
  }

  async function addProvider(input: AddProviderPayload) {
    const nextProvider: Provider = {
      id: createProviderId(input.name, config!.providers),
      name: input.name,
      anthropic_url: input.anthropicUrl,
      openai_url: input.openaiUrl,
      dual_protocol: input.dualProtocol,
      protocol: "Anthropic",
      auth_scheme: "ApiKey",
      models: input.modelIds.map((modelId) => ({
        id: modelId,
        name: modelId,
        enabled: true,
      })),
      enabled: true,
      priority: Math.max(0, ...config!.providers.map((provider) => provider.priority)) + 1,
    };

    updateAndSave({ ...config!, providers: [...config!.providers, nextProvider] });
    if (input.apiKey.trim().length > 0) {
      await saveAuth(nextProvider.id, input.apiKey);
      setAuthMap((prev) => ({ ...prev, [nextProvider.id]: true }));
    }
  }

  const editingKeyProvider = editingKeyProviderId
    ? config.providers.find((p) => p.id === editingKeyProviderId) ?? null
    : null;

  const addingModelProvider = addingModelProviderId
    ? config.providers.find((p) => p.id === addingModelProviderId) ?? null
    : null;

  // Use default queue's active item for global status display
  const defaultQueueState = queueStates[config.default_queue_id];
  const defaultQueue = config.queues[config.default_queue_id];
  const defaultActiveIdx = defaultQueueState?.active_idx ?? 0;
  const activeQueueItem = defaultQueue?.items[defaultActiveIdx] ?? defaultQueue?.items[0];
  const activeProvider = activeQueueItem
    ? config.providers.find((p) => p.id === activeQueueItem.provider_id)
    : undefined;
  const activeModel = activeProvider?.models.find((m) => m.id === activeQueueItem?.model_id);
  const isActive = !!(activeProvider && activeModel);


  return (
    <div className="h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* TopBar */}
        <TopBar
          port={config.port}
          isActive={isActive}
          appStates={appStates}
          onAppToggle={handleAppToggle}
        />

        {/* Page content */}
        {currentPage === "providers" && (
          <ProvidersPage
            providers={config.providers}
            authMap={authMap}
            activeProviderId={activeQueueItem?.provider_id}
            queues={config.queues}
            selectedQueueId={selectedQueueId}
            onAddToQueue={addToQueue}
            onConfigKey={(id) => setEditingKeyProviderId(id)}
            onAddModel={(id) => setAddingModelProviderId(id)}
            onAddProvider={() => setShowAddProvider(true)}
            onSelectQueue={setSelectedQueueId}
            onCreateQueue={handleCreateQueue}
            onOpenDraftPanel={openDraftPanel}
            onRemoveDraftItem={removeFromDraft}
            onReorderDraftItems={reorderDraftItems}
            onClearDraftItems={clearDraftItems}
            onCloseDraftPanel={closeDraftPanel}
            onCancelDraftPanel={cancelDraftPanel}
            onSaveDraftQueue={saveDraftQueue}
          />
        )}
        {currentPage === "queue" && (
          <QueuePage
            queues={config.queues}
            queueStates={queueStates}
            providers={config.providers}
            defaultQueueId={config.default_queue_id}
            selectedQueueId={selectedQueueId}
            onSelectQueue={setSelectedQueueId}
            onDeleteQueue={handleDeleteQueue}
            onReorder={(queueId, items) => reorderQueue(queueId, items)}
            onRemove={(queueId, index) => removeFromQueue(queueId, index)}
            onResetExhausted={(queueId) => handleResetQueueExhausted(queueId)}
          />
        )}
        {currentPage === "logs" && (
          <LogsPage port={config.port} />
        )}
        {currentPage === "settings" && (
          <SettingsPage
            retry={config.retry}
            port={config.port}
            onSave={(retry, newPort, portChanged) => {
              const next = { ...config, retry, port: newPort };
              updateAndSave(next);
              if (portChanged) {
                restartProxy(newPort).then(async () => {
                  if (appStates.cc) {
                    const dq = next.queues[next.default_queue_id];
                    const head = dq?.items[0];
                    const p = head ? next.providers.find((pr) => pr.id === head.provider_id) : undefined;
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
