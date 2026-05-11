import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { sendNotification } from "@tauri-apps/plugin-notification";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getConfig, saveConfig } from "./api";
import { ProviderCard } from "./components/ProviderCard";
import type { AppConfig, Provider } from "./types";
import "./App.css";

function SortableCard(props: {
  provider: Provider;
  isActive: boolean;
  onToggleModel: (pid: string, mid: string) => void;
  onToggleProvider: (pid: string) => void;
  onEdit: (pid: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: props.provider.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style}>
      <ProviderCard {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    getConfig().then(setConfig);
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

  const sensors = useSensors(useSensor(PointerSensor));

  if (!config) return (
    <div className="bg-[#0f0f0f] min-h-screen flex items-center justify-center text-neutral-500 text-sm">
      加载中…
    </div>
  );

  const sorted = [...config.providers].sort((a, b) => a.priority - b.priority);
  const activeProvider = sorted.find((p) => p.enabled);

  function updateAndSave(next: AppConfig) {
    setConfig(next);
    saveConfig(next);
  }

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = sorted.findIndex((p) => p.id === active.id);
    const newIdx = sorted.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(sorted, oldIdx, newIdx).map((p, i) => ({
      ...p,
      priority: i,
    }));
    updateAndSave({ retry: config!.retry, providers: reordered });
  }

  function toggleModel(providerId: string, modelId: string) {
    const providers = config!.providers.map((p) =>
      p.id !== providerId ? p : {
        ...p,
        models: p.models.map((m) =>
          m.id !== modelId ? m : { ...m, enabled: !m.enabled }
        ),
      }
    );
    updateAndSave({ retry: config!.retry, providers });
  }

  function toggleProvider(providerId: string) {
    const providers = config!.providers.map((p) =>
      p.id !== providerId ? p : { ...p, enabled: !p.enabled }
    );
    updateAndSave({ retry: config!.retry, providers });
  }

  return (
    <div className="bg-[#0f0f0f] min-h-screen font-mono text-white">
      {/* 顶部栏 */}
      <div className="bg-[#161616] border-b border-neutral-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_6px_#22c55e88]" />
          <span className="text-[13px] font-semibold text-neutral-200">freemodel router</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-neutral-600">代理运行中 :7860</span>
          <button className="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-[11px] text-neutral-400">⚙ 设置</button>
        </div>
      </div>

      {/* 活跃供应商 banner */}
      {activeProvider && (
        <div className="bg-green-950/40 border-b border-green-900/40 px-4 py-2.5 flex justify-between items-center">
          <div>
            <div className="text-[10px] text-green-400 uppercase tracking-widest mb-0.5">当前活跃</div>
            <div className="text-[13px] font-semibold text-neutral-200">{activeProvider.name}</div>
            <div className="text-[11px] text-green-400">
              {activeProvider.models.find((m) => m.enabled)?.name ?? "—"}
            </div>
          </div>
        </div>
      )}

      {/* 供应商网格 */}
      <div className="px-3 pt-3 pb-2 flex items-center justify-between">
        <span className="text-[10px] text-neutral-600 uppercase tracking-widest">供应商 · 拖拽调整优先级</span>
        <button className="text-[11px] text-blue-400">+ 添加</button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sorted.map((p) => p.id)} strategy={rectSortingStrategy}>
          <div className="px-3 grid grid-cols-3 gap-2 pb-3">
            {sorted.map((p) => (
              <SortableCard
                key={p.id}
                provider={p}
                isActive={p.id === activeProvider?.id}
                onToggleModel={toggleModel}
                onToggleProvider={toggleProvider}
                onEdit={(id) => console.log("edit", id)}
              />
            ))}
            <button className="border border-dashed border-neutral-800 rounded-lg flex items-center justify-center min-h-[100px] text-[11px] text-blue-400">
              + 添加供应商
            </button>
          </div>
        </SortableContext>
      </DndContext>

      {/* 底部 */}
      <div className="border-t border-neutral-900 px-4 py-2 flex justify-between items-center">
        <button className="bg-neutral-900 border border-neutral-800 rounded px-2 py-1 text-[10px] text-neutral-500">
          重试: {config.retry.max_retries}次 · 间隔 {config.retry.retry_delay_secs}s
        </button>
        <span className="text-[10px] text-neutral-800">v0.1.0</span>
      </div>
    </div>
  );
}
