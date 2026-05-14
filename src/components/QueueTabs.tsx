import { CheckCircle2, Plus, Route, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Queue, QueueStateInfo } from "@/types"

interface QueueTabsProps {
  queues: Record<string, Queue>
  queueStates: Record<string, QueueStateInfo>
  defaultQueueId: string
  selectedQueueId: string | null
  onSelectQueue: (queueId: string) => void
  onSetDefaultQueue: (queueId: string) => void
  onDeleteQueue: (queueId: string) => void
  onNewQueue: () => void
}

export function QueueTabs({
  queues,
  queueStates,
  defaultQueueId,
  selectedQueueId,
  onSelectQueue,
  onSetDefaultQueue,
  onDeleteQueue,
  onNewQueue,
}: QueueTabsProps) {
  const queueList = Object.values(queues).sort((a, b) => {
    if (a.id === defaultQueueId) return -1
    if (b.id === defaultQueueId) return 1
    return 0
  })

  return (
    <div className="px-6 py-3 border-b border-border bg-card shadow-[0_1px_0_rgba(16,24,20,0.04),0_10px_24px_rgba(16,24,20,0.05)]">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Route className="h-4 w-4" />
          </span>
          <div className="leading-none">
            <div className="text-sm font-semibold text-foreground">队列</div>
            <div className="text-xs text-muted-foreground mt-1">{queueList.length} 个路由队列</div>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto py-0.5">
          {queueList.map((queue) => {
            const isSelected = queue.id === selectedQueueId
            const isDefault = queue.id === defaultQueueId
            const state = queueStates[queue.id]
            const exhaustedCount = state?.exhausted_indices.length ?? 0
            const itemCount = queue.items.length
            const allExhausted = itemCount > 0 && exhaustedCount >= itemCount

            return (
              <div
                key={queue.id}
                className={cn(
                  "min-h-9 max-w-72 flex items-center rounded-lg text-sm border transition-colors shrink-0 overflow-hidden",
                  isSelected
                    ? "bg-primary/10 text-primary font-semibold border-primary/40 shadow-[0_0_0_3px_var(--fm-primary-ring)]"
                    : isDefault
                      ? "bg-[var(--fm-primary-ghost)] text-foreground border-primary/25 hover:border-primary/45"
                      : "bg-[var(--fm-surface-wash)] border-border text-muted-foreground hover:bg-card hover:text-foreground hover:border-primary/30"
                )}
              >
                <button
                  onClick={() => onSelectQueue(queue.id)}
                  className="min-w-0 flex items-center gap-2 px-3 py-2 flex-1 text-left"
                >
                  <span className="truncate">{queue.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{itemCount} 个模型</span>
                  {isDefault && (
                    <span className="rounded-full bg-primary text-primary-foreground px-1.5 py-0.5 text-[11px] leading-none shrink-0">
                      当前
                    </span>
                  )}
                  {allExhausted && (
                    <span className="rounded-full bg-destructive/10 text-destructive px-1.5 py-0.5 text-[11px] leading-none shrink-0">
                      耗尽
                    </span>
                  )}
                </button>
                {!isDefault && (
                  <div className="self-stretch flex items-center gap-0.5 px-1.5 border-l border-border/70 shrink-0">
                    <button
                      onClick={() => onSetDefaultQueue(queue.id)}
                      title="设为当前"
                      aria-label={`设为当前队列：${queue.name}`}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteQueue(queue.id)}
                      title="删除队列"
                      aria-label={`删除队列：${queue.name}`}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <button
          onClick={onNewQueue}
          className="h-9 shrink-0 flex items-center gap-1.5 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="h-3.5 w-3.5" />
          新建队列
        </button>
      </div>
    </div>
  )
}
