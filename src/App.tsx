import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { sendNotification } from "@tauri-apps/plugin-notification";
import {
  getConfig,
  saveConfig,
  injectProxy,
  updateActive,
  restoreBackup,
  isInjected,
} from "./api";
import { ProviderCard } from "./components/ProviderCard";
import { QueuePanel } from "./components/QueuePanel";
import { SettingsModal } from "./components/SettingsModal";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ProxyLogPanel } from "./components/ProxyLogPanel";
import { AddProviderModal, type AddProviderPayload } from "./components/AddProviderModal";
import type { AppConfig, Provider, QueueItem } from "./types";
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
  const [showSettings, setShowSettings] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editingKeyProviderId, setEditingKeyProviderId] = useState<string | null>(null);
  const [proxyEnabled, setProxyEnabled] = useState(false);

  useEffect(() => {
    getConfig().then(setConfig);
    isInjected().then(setProxyEnabled).catch(console.error);
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("provider-switched", (e) => {
      sendNotification({
        title: "freemodel router",
        body: `已切换到 ${e.payload}`,
      });
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // 当代理已注入且队列首项（provider key 或 model）发生变化时，
  // 同步刷新 settings.json 里的 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL。
  useEffect(() => {
    if (!proxyEnabled || !config) return;
    const head = config.queue[0];
    if (!head) return;
    const provider = config.providers.find((p) => p.id === head.provider_id);
    if (!provider || provider.api_key.trim().length === 0) return;
    updateActive(provider.api_key, head.model_id).catch(console.error);
  }, [
    proxyEnabled,
    config?.queue[0]?.provider_id,
    config?.queue[0]?.model_id,
    config?.queue[0]
      ? config.providers.find((p) => p.id === config.queue[0].provider_id)?.api_key
      : undefined,
  ]);

  if (!config) return (
    <div style={{ background: "var(--fm-color-canvas)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#ffffff", animation: "pulse 2s infinite" }} />
        <span className="fm-eyebrow" style={{ color: "#ffffff" }}>初始化中…</span>
      </div>
    </div>
  );

  function updateAndSave(next: AppConfig) {
    setConfig(next);
    saveConfig(next);
  }

  function addToQueue(providerId: string, modelId: string) {
    const provider = config!.providers.find((p) => p.id === providerId);
    if (!provider || provider.api_key.trim().length === 0) return;
    const newItem: QueueItem = { provider_id: providerId, model_id: modelId };
    updateAndSave({ ...config!, queue: [...config!.queue, newItem] });
  }

  function removeFromQueue(index: number) {
    const queue = config!.queue.filter((_, i) => i !== index);
    updateAndSave({ ...config!, queue });
    if (queue.length === 0 && proxyEnabled) {
      restoreBackup().catch(console.error);
      setProxyEnabled(false);
    }
  }

  function reorderQueue(newQueue: QueueItem[]) {
    updateAndSave({ ...config!, queue: newQueue });
  }

  function saveApiKey(providerId: string, key: string) {
    const providers = config!.providers.map((p) =>
      p.id !== providerId ? p : { ...p, api_key: key }
    );
    updateAndSave({ ...config!, providers });
  }

  function addProvider(input: AddProviderPayload) {
    const nextProvider: Provider = {
      id: createProviderId(input.name, config!.providers),
      name: input.name,
      base_url: input.baseUrl,
      protocol: "Anthropic",
      auth_scheme: "ApiKey",
      api_key: input.apiKey,
      models: input.modelIds.map((modelId) => ({
        id: modelId,
        name: modelId,
        enabled: true,
      })),
      enabled: true,
      priority: Math.max(0, ...config!.providers.map((provider) => provider.priority)) + 1,
    };

    updateAndSave({ ...config!, providers: [...config!.providers, nextProvider] });
  }

  const editingKeyProvider = editingKeyProviderId
    ? config.providers.find((p) => p.id === editingKeyProviderId) ?? null
    : null;

  const activeQueueItem = config.queue[0];
  const activeProvider = activeQueueItem
    ? config.providers.find((p) => p.id === activeQueueItem.provider_id)
    : undefined;
  const activeModel = activeProvider?.models.find((m) => m.id === activeQueueItem?.model_id);
  const isActive = !!(activeProvider && activeModel);

  return (
    <div style={{
      background: "var(--fm-color-canvas)",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      color: "var(--fm-color-ink)",
      fontFamily: "var(--fm-font-sans)",
    }}>

      {/* Top Nav */}
      <div className="fm-top-nav" style={{
        padding: "0 20px",
        height: "56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        borderBottom: "1px solid var(--fm-color-hairline)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isActive && (
              <div style={{
                position: "absolute",
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "var(--fm-success)",
                opacity: 0.15,
                animation: "ping 1.5s ease-in-out infinite",
              }} />
            )}
            <div style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: isActive ? "var(--fm-success)" : "#888888",
              transition: "background 0.5s",
            }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span className="fm-headline-sm" style={{ fontWeight: 700 }}>freemodel</span>
            <span className="fm-eyebrow" style={{ color: "#ffffff" }}>router</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--fm-color-surface-soft)",
            borderRadius: "8px",
            padding: "6px 12px",
            border: "1px solid var(--fm-color-hairline)",
          }}>
            <span className="fm-caption" style={{ color: "#ffffff" }}>服务器状态</span>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--fm-success)", opacity: 0.7 }} />
            <span className="fm-caption" style={{ color: "#ffffff" }}>:7860</span>
          </div>

          {/* Proxy inject toggle */}
          <div
            title={!isActive ? "队列为空，无法启用" : proxyEnabled ? "关闭代理注入" : "注入到 Claude Code 配置"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--fm-color-surface-soft)",
              borderRadius: "8px",
              padding: "6px 12px",
              border: `1px solid ${proxyEnabled ? "var(--fm-success)" : "var(--fm-color-hairline)"}`,
              cursor: isActive ? "pointer" : "not-allowed",
              opacity: isActive ? 1 : 0.45,
              transition: "border-color 0.2s, opacity 0.2s",
              userSelect: "none",
            }}
            onClick={async () => {
              if (!isActive) return;
              const next = !proxyEnabled;
              try {
                if (next) {
                  await injectProxy(activeProvider!.api_key, activeModel!.id);
                } else {
                  await restoreBackup();
                }
                setProxyEnabled(next);
              } catch (e) {
                console.error(e);
              }
            }}
          >
            {/* Toggle track */}
            <div style={{
              position: "relative",
              width: "28px",
              height: "16px",
              borderRadius: "8px",
              background: proxyEnabled ? "var(--fm-success)" : "#888888",
              transition: "background 0.2s",
              flexShrink: 0,
            }}>
              <div style={{
                position: "absolute",
                top: "2px",
                left: proxyEnabled ? "14px" : "2px",
                width: "12px",
                height: "12px",
                borderRadius: "50%",
                background: "var(--fm-color-canvas)",
                transition: "left 0.2s",
              }} />
            </div>
            <span className="fm-caption" style={{
              color: proxyEnabled ? "var(--fm-success)" : "#ffffff",
              transition: "color 0.2s",
            }}>
              {proxyEnabled ? "已接入" : "接入 CC"}
            </span>
          </div>

          <button
            onClick={() => setShowLogs(true)}
            className="fm-btn-secondary"
            aria-label="打开代理日志"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h10M3 8h10M3 13h6"/>
            </svg>
            日志
          </button>

          <button
            onClick={() => setShowSettings(true)}
            className="fm-btn-secondary"
            aria-label="打开设置"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
            </svg>
            设置
          </button>
        </div>
      </div>

      {/* Active status — color block */}
      <div style={{
        flexShrink: 0,
        padding: "12px 20px",
        borderBottom: "1px solid var(--fm-color-hairline)",
        background: isActive ? "var(--fm-block-lime)" : "var(--fm-color-surface-soft)",
        transition: "background 0.3s",
      }}>
        {isActive ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span className="fm-eyebrow" style={{ color: "#ffffff" }}>当前路由</span>
              <div style={{ width: "1px", height: "14px", background: "#888888" }} />
              <span className="fm-body-sm" style={{ fontWeight: 600, color: "#ffffff" }}>{activeProvider!.name}</span>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#ffffff" }}>
                <path d="M9 3l5 5-5 5M2 8h12"/>
              </svg>
              <span className="fm-body-sm" style={{ color: "#ffffff" }}>{activeModel!.name}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--fm-success)" }} />
              <span className="fm-caption" style={{ color: "var(--fm-success)", letterSpacing: "0.7px", textTransform: "uppercase" }}>活跃</span>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#aaaaaa" }}>
              <circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 11h.01"/>
            </svg>
            <span className="fm-body-sm" style={{ color: "#ffffff" }}>队列为空，尚未路由任何请求</span>
          </div>
        )}
      </div>

      {/* Queue panel */}
      <QueuePanel
        queue={config.queue}
        providers={config.providers}
        onReorder={reorderQueue}
        onRemove={removeFromQueue}
      />

      {/* Provider grid header */}
      <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="fm-eyebrow" style={{ color: "#ffffff" }}>供应商</span>
          <span className="fm-caption" style={{
            color: "#ffffff",
            background: "rgba(255,255,255,0.07)",
            borderRadius: "999px",
            padding: "2px 8px",
            fontFamily: "var(--fm-font-mono)",
          }}>
            {config.providers.length}
          </span>
        </div>
        <button
          className="fm-btn-text"
          style={{ display: "flex", alignItems: "center", gap: "5px" }}
          onClick={() => setShowAddProvider(true)}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M8 2v12M2 8h12"/>
          </svg>
          添加
        </button>
      </div>

      {/* Provider grid */}
      <div style={{
        flex: 1,
        padding: "0 16px 16px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px",
        alignContent: "start",
      }}>
        {config.providers.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            isActive={activeQueueItem?.provider_id === p.id}
            onAddToQueue={addToQueue}
            onConfigKey={(id) => setEditingKeyProviderId(id)}
          />
        ))}
        <button
          onClick={() => setShowAddProvider(true)}
          style={{
            border: "1.5px dashed var(--fm-color-hairline)",
            borderRadius: "24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "108px",
            gap: "8px",
            background: "transparent",
            cursor: "pointer",
            transition: "border-color 0.2s, background 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#ffffff";
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.07)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--fm-color-hairline)";
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "#aaaaaa" }}>
            <path d="M8 2v12M2 8h12"/>
          </svg>
          <span className="fm-caption" style={{ color: "#aaaaaa", textTransform: "uppercase", letterSpacing: "0.7px" }}>添加供应商</span>
        </button>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid var(--fm-color-hairline)",
        padding: "10px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
        background: "var(--fm-color-surface-soft)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span className="fm-caption" style={{ color: "#ffffff", fontFamily: "var(--fm-font-mono)" }}>重试 {config.retry.max_retries}×</span>
          <span className="fm-caption" style={{ color: "#aaaaaa" }}>·</span>
          <span className="fm-caption" style={{ color: "#ffffff", fontFamily: "var(--fm-font-mono)" }}>间隔 {config.retry.retry_delay_secs}s</span>
        </div>
        <span className="fm-caption" style={{ color: "#aaaaaa", fontFamily: "var(--fm-font-mono)" }}>v0.1.0</span>
      </div>

      {showSettings && (
        <SettingsModal
          retry={config.retry}
          onSave={(retry) => updateAndSave({ ...config, retry })}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showLogs && (
        <ProxyLogPanel onClose={() => setShowLogs(false)} />
      )}

      {showAddProvider && (
        <AddProviderModal
          onSave={addProvider}
          onClose={() => setShowAddProvider(false)}
        />
      )}

      {editingKeyProvider && (
        <ApiKeyModal
          providerName={editingKeyProvider.name}
          currentKey={editingKeyProvider.api_key}
          onSave={(key) => saveApiKey(editingKeyProvider.id, key)}
          onClose={() => setEditingKeyProviderId(null)}
        />
      )}
    </div>
  );
}
