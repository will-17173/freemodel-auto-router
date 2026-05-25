import { CheckCircle2, Plus, Route, Trash2 } from "lucide-react"
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
    <div
      className="px-4 flex items-center gap-2 shrink-0 overflow-hidden"
      style={{
        height: "40px",
        borderBottom: "1px solid var(--fm-border-subtle)",
        background: "var(--fm-bg-surface)",
      }}
    >
      <div
        className="flex items-center gap-1 flex-shrink-0 mr-2"
        style={{ color: "var(--fm-text-4)" }}
      >
        <Route className="h-3 w-3" aria-hidden="true" />
      </div>

      <div className="flex items-center overflow-x-auto min-w-0 flex-1 gap-0">
        {queueList.map((queue) => {
          const isSelected = queue.id === selectedQueueId
          const isDefault = queue.id === defaultQueueId
          const state = queueStates[queue.id]
          const exhaustedCount = state?.exhausted_indices.length ?? 0
          const itemCount = queue.items.length
          const allExhausted = itemCount > 0 && exhaustedCount >= itemCount
          const activeItem = queue.items[state?.active_idx ?? 0]

          return (
            <div
              key={queue.id}
              className="flex items-center flex-shrink-0 relative group"
              style={{
                borderBottom: isSelected
                  ? "2px solid var(--fm-primary)"
                  : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              <button
                onClick={() => onSelectQueue(queue.id)}
                className="flex items-center gap-1.5 px-3 py-2 transition-colors focus-visible:outline-none"
                style={{
                  fontSize: "var(--fm-text-sm)",
                  fontWeight: isSelected ? "var(--fm-weight-medium)" : "var(--fm-weight-regular)",
                  color: isSelected ? "var(--fm-text-1)" : isDefault ? "var(--fm-text-2)" : "var(--fm-text-3)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <span className="fm-text-zh">{queue.name}</span>

                {/* Item count badge */}
                <span
                  className="fm-text-tech inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full"
                  style={{
                    fontSize: "10px",
                    background: isSelected ? "var(--fm-primary-subtle)" : "var(--fm-bg-hover)",
                    color: isSelected ? "var(--fm-primary-text)" : "var(--fm-text-4)",
                  }}
                >
                  {itemCount}
                </span>

                {isDefault && (
                  <span
                    className="fm-text-tech"
                    style={{
                      fontSize: "10px",
                      background: "var(--fm-primary-subtle)",
                      color: "var(--fm-primary-text)",
                      padding: "1px 5px",
                      borderRadius: "var(--fm-r-pill)",
                    }}
                  >
                    当前
                  </span>
                )}

                {allExhausted && (
                  <span
                    className="fm-text-tech"
                    style={{
                      fontSize: "10px",
                      background: "var(--fm-error-subtle)",
                      color: "var(--fm-error-text)",
                      padding: "1px 5px",
                      borderRadius: "var(--fm-r-pill)",
                    }}
                  >
                    耗尽
                  </span>
                )}

                {/* Active model hint */}
                {activeItem && isSelected && (
                  <span className="fm-text-tech hidden" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>
                    {activeItem.model_id}
                  </span>
                )}
              </button>

              {/* Actions (visible on hover if not default) */}
              {!isDefault && (
                <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSetDefaultQueue(queue.id) }}
                    title="设为当前"
                    className="h-5 w-5 rounded flex items-center justify-center transition-colors"
                    style={{ color: "var(--fm-text-4)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-primary-text)"; e.currentTarget.style.background = "var(--fm-primary-ghost)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)"; e.currentTarget.style.background = "transparent" }}
                  >
                    <CheckCircle2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDeleteQueue(queue.id) }}
                    title="删除队列"
                    className="h-5 w-5 rounded flex items-center justify-center transition-colors"
                    style={{ color: "var(--fm-text-4)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-error-text)"; e.currentTarget.style.background = "var(--fm-error-subtle)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)"; e.currentTarget.style.background = "transparent" }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* New queue button - ghost style */}
      <button
        type="button"
        onClick={onNewQueue}
        className="flex items-center gap-1 px-2 py-1 transition-colors flex-shrink-0"
        style={{
          fontSize: "var(--fm-text-xs)",
          color: "var(--fm-text-4)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          borderRadius: "var(--fm-r-sm)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-text-2)"; e.currentTarget.style.background = "var(--fm-bg-hover)" }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)"; e.currentTarget.style.background = "transparent" }}
      >
        <Plus className="h-3 w-3" />
        <span className="fm-text-tech">新建</span>
      </button>
    </div>
  )
}
