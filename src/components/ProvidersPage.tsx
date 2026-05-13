import { useState } from "react"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { CreateQueueModal } from "./CreateQueueModal"
import type { Provider, Queue, DraftItem } from "@/types"

interface ProvidersPageProps {
  providers: Provider[]
  authMap: Record<string, boolean>
  activeProviderId: string | undefined
  queues: Record<string, Queue>
  selectedQueueId: string | null
  onAddToQueue: (providerId: string, modelId: string) => void
  onConfigKey: (providerId: string) => void
  onAddModel: (providerId: string) => void
  onAddProvider: () => void
  onSelectQueue: (queueId: string) => void
  onCreateQueue: (name: string) => void
  // Draft panel props (wired in Task 8)
  onOpenDraftPanel?: () => void
  onRemoveDraftItem?: (index: number) => void
  onReorderDraftItems?: (items: DraftItem[]) => void
  onClearDraftItems?: () => void
  onCloseDraftPanel?: () => void
  onCancelDraftPanel?: () => void
  onSaveDraftQueue?: () => void
}

export function ProvidersPage({
  providers,
  authMap,
  activeProviderId,
  queues,
  selectedQueueId,
  onAddToQueue,
  onConfigKey,
  onAddModel,
  onAddProvider,
  onSelectQueue,
  onCreateQueue,
  onOpenDraftPanel: _onOpenDraftPanel,
  onRemoveDraftItem: _onRemoveDraftItem,
  onReorderDraftItems: _onReorderDraftItems,
  onClearDraftItems: _onClearDraftItems,
  onCloseDraftPanel: _onCloseDraftPanel,
  onCancelDraftPanel: _onCancelDraftPanel,
  onSaveDraftQueue: _onSaveDraftQueue,
}: ProvidersPageProps) {
  const [showCreateQueueModal, setShowCreateQueueModal] = useState(false)

  return (
    <div className="flex-1 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">供应商</h1>
        <div className="flex items-center gap-2">
          {/* Queue selector */}
          <select
            value={selectedQueueId ?? ""}
            onChange={(e) => onSelectQueue(e.target.value)}
            className="text-sm px-3 py-1.5 rounded-lg border border-border bg-background text-foreground"
          >
            {Object.values(queues).map((q) => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreateQueueModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-border text-muted-foreground text-sm rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            新建队列
          </button>
          <button
            onClick={onAddProvider}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            添加
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={cn(
              "bg-card rounded-xl border p-5 transition-all",
              activeProviderId === provider.id
                ? "border-primary shadow-[0_0_0_3px_rgba(255,85,0,0.12)]"
                : "border-border shadow-sm hover:border-primary/40 hover:shadow-md"
            )}
          >
            {/* Card header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {activeProviderId === provider.id && (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
                <span className="font-semibold text-sm text-foreground">{provider.name}</span>
              </div>
              <button
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition-colors",
                  authMap[provider.id]
                    ? "border-border text-muted-foreground bg-muted hover:border-primary hover:text-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                )}
                onClick={() => onConfigKey(provider.id)}
              >
                {authMap[provider.id] ? "✓ Key" : "配置 Key"}
              </button>
            </div>
            {/* Models */}
            <div className="flex flex-wrap gap-1.5">
              {provider.models.map((model) => (
                <button
                  key={model.id}
                  disabled={!authMap[provider.id]}
                  onClick={() => authMap[provider.id] && onAddToQueue(provider.id, model.id)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border transition-colors",
                    authMap[provider.id]
                      ? "border-border text-foreground bg-muted/50 hover:border-primary hover:text-primary hover:bg-orange-50 cursor-pointer"
                      : "border-border text-muted-foreground bg-muted/30 cursor-not-allowed opacity-60"
                  )}
                >
                  {model.name} +
                </button>
              ))}
              <button
                className="text-xs px-2.5 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                onClick={() => onAddModel(provider.id)}
              >
                + 模型
              </button>
            </div>
          </div>
        ))}

        {/* Add provider placeholder */}
        <button
          onClick={onAddProvider}
          className="h-[120px] border border-dashed border-border rounded-xl flex items-center justify-center text-sm text-muted-foreground hover:border-primary hover:bg-secondary transition-colors"
        >
          + 添加供应商
        </button>
      </div>

      <CreateQueueModal
        open={showCreateQueueModal}
        onClose={() => setShowCreateQueueModal(false)}
        onCreate={(name) => {
          onCreateQueue(name)
          setShowCreateQueueModal(false)
        }}
      />
    </div>
  )
}
