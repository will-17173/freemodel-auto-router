import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Queue, QueueStateInfo } from "@/types"

interface QueueTabsProps {
  queues: Record<string, Queue>
  queueStates: Record<string, QueueStateInfo>
  defaultQueueId: string
  selectedQueueId: string | null
  onSelectQueue: (queueId: string) => void
  onNewQueue: () => void
}

export function QueueTabs({
  queues,
  queueStates,
  defaultQueueId,
  selectedQueueId,
  onSelectQueue,
  onNewQueue,
}: QueueTabsProps) {
  const queueList = Object.values(queues).sort((a, b) => {
    if (a.id === defaultQueueId) return -1
    if (b.id === defaultQueueId) return 1
    return 0
  })

  return (
    <div className="h-10 px-6 flex items-center gap-1 border-b border-border bg-secondary/30">
      {queueList.map((queue) => {
        const isSelected = queue.id === selectedQueueId
        const isDefault = queue.id === defaultQueueId
        const state = queueStates[queue.id]
        const exhaustedCount = state?.exhausted_indices.length ?? 0
        const itemCount = queue.items.length
        const allExhausted = itemCount > 0 && exhaustedCount >= itemCount

        return (
          <button
            key={queue.id}
            onClick={() => onSelectQueue(queue.id)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors",
              isSelected
                ? "bg-primary/10 text-primary font-medium border border-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className="truncate">{queue.name}</span>
            {isDefault && (
              <span className="text-xs text-primary/60">(当前)</span>
            )}
            {allExhausted && (
              <span className="text-xs text-destructive">尽</span>
            )}
          </button>
        )
      })}
      <button
        onClick={onNewQueue}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        新建
      </button>
    </div>
  )
}
