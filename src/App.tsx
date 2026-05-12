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
  restartProxy,
  injectCodex, removeCodex,
  injectHermes, removeHermes, isHermesInjected,
  injectOpenclaw, removeOpenclaw,
  getExhaustedIndices,
  getActiveIdx,
  resetExhausted,
} from "./api";
import { ProviderCard } from "./components/ProviderCard";
import { QueuePanel } from "./components/QueuePanel";
import { SettingsModal } from "./components/SettingsModal";
import { ApiKeyModal } from "./components/ApiKeyModal";
import { ProxyLogPanel } from "./components/ProxyLogPanel";
import { AddProviderModal, type AddProviderPayload } from "./components/AddProviderModal";
import { AddModelModal } from "./components/AddModelModal";
import { AppToggle } from "./components/AppToggle";
import type { AppConfig, Provider, QueueItem } from "./types";
import hermesImg from "./assets/images/hermes.png";
import openclawImg from "./assets/images/openclaw.png";
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
  const [addingModelProviderId, setAddingModelProviderId] = useState<string | null>(null);
  const [appStates, setAppStates] = useState({
    cc: false,
    codex: false,
    hermes: false,
    openclaw: false,
  });
  const [exhaustedIndices, setExhaustedIndices] = useState<number[]>([]);
  const [activeIdx, setActiveIdx] = useState<number>(0);

  useEffect(() => {
    getConfig().then(setConfig);
  }, []);

  useEffect(() => {
    if (config) isInjected(config.port).then((v) => setAppStates(prev => ({ ...prev, cc: v }))).catch(console.error);
  }, [config?.port]);

  useEffect(() => {
    const unlisten = listen<string>("provider-switched", (e) => {
      sendNotification({
        title: "freemodel router",
        body: `已切换到 ${e.payload}`,
      });
      // 更新用尽状态和活跃索引
      getExhaustedIndices().then(setExhaustedIndices).catch(console.error);
      getActiveIdx().then(setActiveIdx).catch(console.error);
    });
    return () => { unlisten.then(f => f()); };
  }, []);

  // 定期轮询用尽状态（每 5 秒）
  useEffect(() => {
    if (!config || config.queue.length === 0) return;
    const interval = setInterval(() => {
      getExhaustedIndices().then(setExhaustedIndices).catch(console.error);
      getActiveIdx().then(setActiveIdx).catch(console.error);
    }, 5000);
    return () => clearInterval(interval);
  }, [config?.queue.length]);

  // 初始加载用尽状态
  useEffect(() => {
    if (!config || config.queue.length === 0) return;
    getExhaustedIndices().then(setExhaustedIndices).catch(console.error);
    getActiveIdx().then(setActiveIdx).catch(console.error);
  }, [config?.queue]);

  // 当代理已注入且队列首项（provider key 或 model）发生变化时，
  // 同步刷新 settings.json 里的 ANTHROPIC_AUTH_TOKEN / ANTHROPIC_MODEL。
  useEffect(() => {
    if (!appStates.cc || !config) return;
    const head = config.queue[0];
    if (!head) return;
    const provider = config.providers.find((p) => p.id === head.provider_id);
    if (!provider || provider.api_key.trim().length === 0) return;
updateActive(provider.api_key).catch(console.error);
  }, [
    appStates.cc,
    config?.queue[0]?.provider_id,
    config?.queue[0]?.model_id,
    config?.queue[0]
      ? config.providers.find((p) => p.id === config.queue[0].provider_id)?.api_key
      : undefined,
  ]);

  if (!config) return (
    <div style={{ background: "var(--fm-color-canvas)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--fm-color-ink)", animation: "pulse 2s infinite" }} />
        <span className="fm-eyebrow">初始化中…</span>
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
    if (queue.length === 0) {
      if (appStates.cc) { restoreBackup().catch(console.error); }
      if (appStates.codex) { removeCodex().catch(console.error); }
      if (appStates.hermes && activeProvider) { removeHermes(activeProvider.id).catch(console.error); }
      if (appStates.openclaw && activeProvider) { removeOpenclaw(activeProvider.id).catch(console.error); }
      setAppStates({ cc: false, codex: false, hermes: false, openclaw: false });
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

  function addModel(providerId: string, modelId: string) {
    const providers = config!.providers.map((p) =>
      p.id !== providerId
        ? p
        : { ...p, models: [...p.models, { id: modelId, name: modelId, enabled: true }] }
    );
    updateAndSave({ ...config!, providers });
    setAddingModelProviderId(null);
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

  const addingModelProvider = addingModelProviderId
    ? config.providers.find((p) => p.id === addingModelProviderId) ?? null
    : null;

  const activeQueueItem = config.queue[activeIdx];
  const activeProvider = activeQueueItem
    ? config.providers.find((p) => p.id === activeQueueItem.provider_id)
    : undefined;
  const activeModel = activeProvider?.models.find((m) => m.id === activeQueueItem?.model_id);
  const isActive = !!(activeProvider && activeModel);

  // 初始化时检查 Hermes 配置状态
  useEffect(() => {
    if (!activeProvider) return;
    isHermesInjected(activeProvider.id)
      .then((v) => setAppStates(prev => ({ ...prev, hermes: v })))
      .catch(console.error);
  }, [activeProvider?.id]);

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
        padding: "0 24px",
        height: "56px",
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        flexShrink: 0,
        borderBottom: "1px solid var(--fm-color-hairline)",
      }}>
        {/* Left: Logo */}
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
              background: isActive ? "var(--fm-success)" : "var(--fm-ink-faint)",
              transition: "background 0.5s",
            }} />
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <span className="fm-headline-sm" style={{ fontWeight: 700 }}>freemodel</span>
            <span className="fm-eyebrow" style={{ color: "var(--fm-ink-muted)" }}>router</span>
          </div>
        </div>

        {/* Center: 4 App Toggles */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {/* Claude Code icon - coral flower shape */}
          <AppToggle
            icon={
              <svg width="20" height="20" viewBox="0 0 1200 1200" fill="none">
                <path d="M233.96 800.21L468.64 668.54L472.59 657.1L468.64 650.74L457.21 650.74L417.99 648.32L283.89 644.7L167.6 639.87L54.93 633.83L26.58 627.79L0 592.75L2.74 575.28L26.58 559.25L60.72 562.23L136.19 567.38L249.42 575.19L331.57 580.03L453.26 592.67L472.59 592.67L475.33 584.86L468.72 580.03L463.57 575.19L346.39 495.79L219.54 411.87L153.1 363.54L117.18 339.06L99.06 316.11L91.25 266.01L123.87 230.09L167.68 233.07L178.87 236.05L223.25 270.2L318.04 343.57L441.83 434.74L459.95 449.8L467.19 444.64L468.08 441.02L459.95 427.41L392.62 305.72L320.78 181.93L288.81 130.63L280.35 99.87C277.37 87.22 275.19 76.59 275.19 63.62L312.32 13.21L332.86 6.6L382.39 13.21L403.25 31.33L434.01 101.72L483.87 212.54L561.18 363.22L583.81 407.92L595.89 449.32L600.4 461.96L608.21 461.96L608.21 454.71L614.58 369.83L626.34 265.61L637.77 131.52L641.72 93.75L660.4 48.48L697.53 24L726.52 37.85L750.36 72L747.06 94.07L732.89 186.2L705.1 330.52L686.98 427.17L697.53 427.17L709.61 415.09L758.5 350.17L840.64 247.49L876.89 206.74L919.17 161.72L946.31 140.29L997.61 140.29L1035.38 196.43L1018.47 254.42L965.64 321.42L921.83 378.2L859.01 462.77L819.79 530.42L823.41 535.81L832.75 534.93L974.66 504.72L1051.33 490.87L1142.82 475.17L1184.21 494.5L1188.72 514.15L1172.46 554.34L1074.6 578.5L959.84 601.45L788.94 641.88L786.85 643.41L789.26 646.39L866.25 653.64L899.19 655.41L979.81 655.41L1129.93 666.6L1169.15 692.54L1192.67 724.27L1188.72 748.43L1128.32 779.19L1046.82 759.87L856.59 714.6L791.36 698.34L782.34 698.34L782.34 703.73L836.7 756.89L936.32 846.85L1061.07 962.82L1067.44 991.49L1051.41 1014.12L1034.5 1011.7L924.89 929.23L882.6 892.11L786.85 811.49L780.48 811.49L780.48 819.95L802.55 852.24L919.09 1027.41L925.13 1081.13L916.67 1098.6L886.47 1109.15L853.29 1103.11L785.07 1007.36L714.68 899.52L657.91 802.87L650.98 806.82L617.48 1167.7L601.77 1186.15L565.53 1200L535.33 1177.05L519.3 1139.92L535.33 1066.55L554.66 970.79L570.36 894.68L584.54 800.13L592.99 768.72L592.43 766.63L585.5 767.52L514.23 865.37L405.83 1011.87L320.05 1103.68L299.52 1111.81L263.92 1093.37L267.22 1060.43L287.11 1031.11L405.83 880.11L477.42 786.52L523.65 732.48L523.33 724.67L520.59 724.67L205.29 929.4L149.15 936.64L124.99 914.01L127.97 876.89L139.41 864.81L234.2 799.57L233.88 799.89Z" fill="#fff"/>
              </svg>
            }
            color="#d97757"
            enabled={appStates.cc}
            disabled={!isActive}
            title={!isActive ? "队列为空，无法启用" : appStates.cc ? "关闭 Claude Code 注入" : "注入到 Claude Code 配置"}
            onToggle={async () => {
              if (appStates.cc) {
                await restoreBackup();
                setAppStates(prev => ({ ...prev, cc: false }));
              } else {
await injectProxy(config.port, activeProvider!.api_key);
                setAppStates(prev => ({ ...prev, cc: true }));
              }
            }}
          />
          {/* Codex icon - gradient code symbol */}
          <AppToggle
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M9.064 3.344a4.578 4.578 0 012.285-.312c1 .115 1.891.54 2.673 1.275.01.01.024.017.037.021a.09.09 0 00.043 0 4.55 4.55 0 013.046.275l.047.022.116.057a4.581 4.581 0 012.188 2.399c.209.51.313 1.041.315 1.595a4.24 4.24 0 01-.134 1.223.123.123 0 00.03.115c.594.607.988 1.33 1.183 2.17.289 1.425-.007 2.71-.887 3.854l-.136.166a4.548 4.548 0 01-2.201 1.388.123.123 0 00-.081.076c-.191.551-.383 1.023-.74 1.494-.9 1.187-2.222 1.846-3.711 1.838-1.187-.006-2.239-.44-3.157-1.302a.107.107 0 00-.105-.024c-.388.125-.78.143-1.204.138a4.441 4.441 0 01-1.945-.466 4.544 4.544 0 01-1.61-1.335c-.152-.202-.303-.392-.414-.617a5.81 5.81 0 01-.37-.961 4.582 4.582 0 01-.014-2.298.124.124 0 00.006-.056.085.085 0 00-.027-.048 4.467 4.467 0 01-1.034-1.651 3.896 3.896 0 01-.251-1.192 5.189 5.189 0 01.141-1.6c.337-1.112.982-1.985 1.933-2.618.212-.141.413-.251.601-.33.215-.089.43-.164.646-.227a.098.098 0 00.065-.066 4.51 4.51 0 01.829-1.615 4.535 4.535 0 011.837-1.388zm3.482 10.565a.637.637 0 000 1.272h3.636a.637.637 0 100-1.272h-3.636zM8.462 9.23a.637.637 0 00-1.106.631l1.272 2.224-1.266 2.136a.636.636 0 101.095.649l1.454-2.455a.636.636 0 00.005-.64L8.462 9.23z" fill="url(#codex-gradient)"/>
                <defs><linearGradient id="codex-gradient" x1="12" x2="12" y1="3" y2="21"><stop stopColor="#B1A7FF"/><stop offset=".5" stopColor="#7A9DFF"/><stop offset="1" stopColor="#3941FF"/></linearGradient></defs>
              </svg>
            }
            color="#7A9DFF"
            enabled={appStates.codex}
            disabled={!isActive}
            title={!isActive ? "队列为空，无法启用" : appStates.codex ? "关闭 Codex 注入" : "注入到 Codex 配置"}
            onToggle={async () => {
              if (appStates.codex) {
                await removeCodex();
                setAppStates(prev => ({ ...prev, codex: false }));
              } else {
                await injectCodex(activeProvider!);
                setAppStates(prev => ({ ...prev, codex: true }));
              }
            }}
          />
          {/* Hermes icon */}
          <AppToggle
            icon={<img src={hermesImg} width="20" height="20" alt="Hermes" style={{ objectFit: "contain" }} />}
            color="#8b5cf6"
            enabled={appStates.hermes}
            disabled={!isActive}
            title={!isActive ? "队列为空，无法启用" : appStates.hermes ? "关闭 Hermes 注入" : "注入到 Hermes 配置"}
            onToggle={async () => {
              try {
                if (appStates.hermes) {
                  await removeHermes(activeProvider!.id);
                  setAppStates(prev => ({ ...prev, hermes: false }));
                } else {
                  await injectHermes(activeProvider!);
                  setAppStates(prev => ({ ...prev, hermes: true }));
                }
              } catch (e) {
                console.error("Hermes 配置操作失败:", e);
              }
            }}
          />
          {/* OpenClaw icon */}
          <AppToggle
            icon={<img src={openclawImg} width="20" height="20" alt="OpenClaw" style={{ objectFit: "contain" }} />}
            color="#ef0011"
            enabled={appStates.openclaw}
            disabled={!isActive}
            title={!isActive ? "队列为空，无法启用" : appStates.openclaw ? "关闭 OpenClaw 注入" : "注入到 OpenClaw 配置"}
            onToggle={async () => {
              if (appStates.openclaw) {
                await removeOpenclaw(activeProvider!.id);
                setAppStates(prev => ({ ...prev, openclaw: false }));
              } else {
                await injectOpenclaw(activeProvider!);
                setAppStates(prev => ({ ...prev, openclaw: true }));
              }
            }}
          />
        </div>

        {/* Right: Server status + 日志 + 设置 */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", justifyContent: "flex-end" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "var(--fm-color-surface-soft)",
            borderRadius: "8px",
            padding: "6px 12px",
            border: "1px solid var(--fm-color-hairline)",
          }}>
            <span className="fm-caption">服务器状态</span>
            <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--fm-success)", opacity: 0.7 }} />
            <span className="fm-caption" style={{ fontFamily: "var(--fm-font-mono)" }}>:{config.port}</span>
          </div>

          <button onClick={() => setShowLogs(true)} className="fm-btn-secondary" aria-label="打开代理日志">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3h10M3 8h10M3 13h6"/>
            </svg>
            日志
          </button>

          <button onClick={() => setShowSettings(true)} className="fm-btn-secondary" aria-label="打开设置">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
            </svg>
            设置
          </button>
        </div>
      </div>

            <QueuePanel
        queue={config.queue}
        providers={config.providers}
        exhaustedIndices={exhaustedIndices}
        activeIdx={activeIdx}
        onReorder={reorderQueue}
        onRemove={removeFromQueue}
        onResetExhausted={() => resetExhausted().then(() => {
          setExhaustedIndices([]);
          setActiveIdx(0);
        }).catch(console.error)}
      />

      {/* Provider grid header */}
      <div style={{ padding: "24px 24px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="fm-eyebrow">供应商</span>
          <span className="fm-caption" style={{
            color: "var(--fm-color-ink)",
            background: "var(--fm-color-surface-soft)",
            border: "1px solid var(--fm-color-hairline)",
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
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: "14px",
        alignContent: "start",
      }}>
        {config.providers.map((p) => (
          <ProviderCard
            key={p.id}
            provider={p}
            isActive={activeQueueItem?.provider_id === p.id}
            onAddToQueue={addToQueue}
            onConfigKey={(id) => setEditingKeyProviderId(id)}
            onAddModel={(id) => setAddingModelProviderId(id)}
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
            minHeight: "132px",
            gap: "8px",
            background: "transparent",
            cursor: "pointer",
            transition: "border-color 0.2s, background 0.2s",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "#000000";
            (e.currentTarget as HTMLButtonElement).style.background = "var(--fm-color-surface-soft)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--fm-color-hairline)";
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: "var(--fm-ink-faint)" }}>
            <path d="M8 2v12M2 8h12"/>
          </svg>
          <span className="fm-caption" style={{ color: "var(--fm-ink-faint)", textTransform: "uppercase", letterSpacing: "0.7px" }}>添加供应商</span>
        </button>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: "1px solid var(--fm-color-hairline)",
        padding: "12px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
        background: "var(--fm-color-surface-soft)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span className="fm-caption" style={{ fontFamily: "var(--fm-font-mono)" }}>重试 {config.retry.max_retries}×</span>
          <span className="fm-caption" style={{ color: "var(--fm-ink-faint)" }}>·</span>
          <span className="fm-caption" style={{ fontFamily: "var(--fm-font-mono)" }}>间隔 {config.retry.retry_delay_secs}s</span>
        </div>
        <span className="fm-caption" style={{ color: "var(--fm-ink-faint)", fontFamily: "var(--fm-font-mono)" }}>v0.1.0</span>
      </div>

      {showSettings && (
        <SettingsModal
          retry={config.retry}
          port={config.port}
          onSave={(retry, newPort, portChanged) => {
            const next = { ...config, retry, port: newPort };
            updateAndSave(next);
            if (portChanged) {
              restartProxy(newPort).then(() => {
                if (appStates.cc) {
                  const head = next.queue[0];
                  const p = head ? next.providers.find((pr) => pr.id === head.provider_id) : undefined;
                  if (p && p.api_key.trim()) {
injectProxy(newPort, p.api_key).catch(console.error);
                  }
                }
                setShowSettings(false);
              }).catch(console.error);
            }
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showLogs && (
        <ProxyLogPanel port={config.port} onClose={() => setShowLogs(false)} />
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
