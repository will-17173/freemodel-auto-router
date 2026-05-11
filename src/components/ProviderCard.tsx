import type { Provider } from "../types";

interface Props {
  provider: Provider;
  isActive: boolean;
  onToggleModel: (providerId: string, modelId: string) => void;
  onToggleProvider: (providerId: string) => void;
  onEdit: (providerId: string) => void;
  dragHandleProps?: Record<string, unknown>;
}

export function ProviderCard({
  provider,
  isActive,
  onToggleModel,
  onToggleProvider,
  onEdit,
  dragHandleProps,
}: Props) {
  const borderColor = isActive
    ? "border-t-green-500"
    : provider.enabled
    ? "border-t-neutral-600"
    : "border-t-neutral-800";

  const statusLabel = isActive
    ? <span className="text-[9px] bg-green-950 text-green-400 rounded px-1.5 py-0.5">● 活跃</span>
    : provider.enabled
    ? <span className="text-[9px] bg-neutral-900 text-neutral-500 rounded px-1.5 py-0.5">○ 待机</span>
    : <span className="text-[9px] bg-neutral-900 text-neutral-600 rounded px-1.5 py-0.5">— 已禁用</span>;

  return (
    <div className={`bg-neutral-900 border border-neutral-800 border-t-2 ${borderColor} rounded-lg p-2.5 ${!provider.enabled ? "opacity-50" : ""}`}>
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[12px] font-semibold text-neutral-200">{provider.name}</span>
        <span {...dragHandleProps} className="text-neutral-600 cursor-grab text-sm select-none">⠿</span>
      </div>

      {/* 状态 */}
      <div className="mb-2">{statusLabel}</div>

      {/* 模型标签 */}
      <div className="text-[9px] text-neutral-600 uppercase tracking-wide mb-1">模型</div>
      <div className="flex flex-wrap gap-1 mb-2.5">
        {provider.models.map((m) => (
          <button
            key={m.id}
            onClick={() => onToggleModel(provider.id, m.id)}
            className={`text-[9px] rounded px-1.5 py-0.5 border cursor-pointer transition-colors ${
              m.enabled
                ? "bg-blue-950 text-blue-400 border-blue-800"
                : "bg-neutral-900 text-neutral-600 border-neutral-800"
            }`}
          >
            {m.enabled ? `${m.name} ✓` : m.name}
          </button>
        ))}
        {provider.models.length === 0 && (
          <span className="text-[9px] text-neutral-700">未配置 API Key</span>
        )}
      </div>

      {/* 底部：优先级 + 编辑 + 开关 */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-neutral-700">#{provider.priority + 1}</span>
        <div className="flex gap-1.5 items-center">
          <button
            onClick={() => onEdit(provider.id)}
            className="bg-neutral-800 border border-neutral-700 rounded px-1.5 py-0.5 text-[9px] text-neutral-500 cursor-pointer"
          >✎</button>
          {/* 开关 */}
          <button
            onClick={() => onToggleProvider(provider.id)}
            className={`w-[22px] h-[12px] rounded-full relative transition-colors ${provider.enabled ? "bg-green-500" : "bg-neutral-700"}`}
          >
            <span className={`absolute top-[1px] w-[10px] h-[10px] bg-white rounded-full transition-all ${provider.enabled ? "right-[1px]" : "left-[1px]"}`} />
          </button>
        </div>
      </div>
    </div>
  );
}
