import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { X, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { QueueItem, Provider, QueueStateInfo, Queue } from "@/types"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface QueuePageProps {
  queues: Record<string, Queue>
  queueStates: Record<string, QueueStateInfo>
  providers: Provider[]
  defaultQueueId: string
  selectedQueueId: string | null
  onSelectQueue: (queueId: string) => void
  onDeleteQueue: (queueId: string) => void
  onReorder: (queueId: string, items: QueueItem[]) => void
  onRemove: (queueId: string, index: number) => void
  onResetExhausted: (queueId: string) => void
  onOpenDraftPanel?: () => void
}

function SortableQueueItem({
  uid,
  index,
  label,
  isActive,
  isExhausted,
  onRemove,
}: {
  uid: string
  index: number
  label: string
  isActive: boolean
  isExhausted: boolean
  onRemove: (i: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : isExhausted ? 0.4 : 1,
      }}
      className={cn(
        "flex items-center gap-2 py-2 px-3 rounded-lg border",
        isActive && !isExhausted ? "border-primary bg-primary/5" : "border-border bg-card"
      )}
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <span className={cn("font-medium text-sm", isExhausted && "text-muted-foreground line-through")}>
        {index + 1}. {label}
      </span>
      {isActive && !isExhausted && (
        <Badge variant="default" className="text-[10px] px-1.5 py-0">当前</Badge>
      )}
      {isExhausted && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">已用尽</Badge>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 ml-auto hover:text-destructive"
        onClick={() => onRemove(index)}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  )
}

export function QueuePage({
  queues,
  queueStates,
  providers,
  defaultQueueId,
  selectedQueueId,
  onSelectQueue,
  onDeleteQueue,
  onReorder,
  onRemove,
  onResetExhausted,
  onOpenDraftPanel,
}: QueuePageProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const queueList = Object.values(queues).sort((a, b) => {
    if (a.id === defaultQueueId) return -1
    if (b.id === defaultQueueId) return 1
    return 0
  })
  const selectedQueue = selectedQueueId ? queues[selectedQueueId] : null
  const items = selectedQueue?.items ?? []
  const stateInfo = selectedQueueId ? queueStates[selectedQueueId] : undefined
  const ids = items.map((item, i) => `${item.provider_id}::${item.model_id}::${i}`)
  const activeIdx = stateInfo?.active_idx ?? 0
  const exhaustedIndices = stateInfo?.exhausted_indices ?? []
  const hasExhausted = exhaustedIndices.length > 0

  function getLabel(item: QueueItem) {
    const provider = providers.find((p) => p.id === item.provider_id)
    const model = provider?.models.find((m) => m.id === item.model_id)
    return `${provider?.name ?? item.provider_id} / ${model?.name ?? item.model_id}`
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !selectedQueueId) return
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(selectedQueueId, arrayMove(items, oldIdx, newIdx))
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sidebar: queue list */}
      <div className="w-[200px] border-r border-border bg-secondary/30 p-3 flex flex-col gap-1 shrink-0">
        <div className="flex items-center justify-between px-2 py-1 mb-1">
          <span className="text-xs font-medium text-muted-foreground">队列</span>
          {onOpenDraftPanel && (
            <button
              onClick={onOpenDraftPanel}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="新建队列"
            >
              +
            </button>
          )}
        </div>
        {queueList.map((queue) => {
          const state = queueStates[queue.id]
          const isDefault = queue.id === defaultQueueId
          const isSelected = queue.id === selectedQueueId
          const itemCount = queue.items.length
          const exhaustedCount = state?.exhausted_indices.length ?? 0

          return (
            <button
              key={queue.id}
              onClick={() => onSelectQueue(queue.id)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-2 rounded-lg text-sm transition-colors w-full text-left",
                isSelected
                  ? "bg-primary/10 text-primary font-medium border border-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <span className="truncate flex-1">{queue.name}</span>
              {isDefault && (
                <Badge variant="default" className="text-[10px] px-1 py-0 shrink-0">默</Badge>
              )}
              {itemCount > 0 && (
                <Badge
                  variant={exhaustedCount >= itemCount ? "destructive" : "secondary"}
                  className="text-[10px] px-1 py-0 shrink-0"
                >
                  {exhaustedCount >= itemCount ? "尽" : itemCount}
                </Badge>
              )}
            </button>
          )
        })}
      </div>

      {/* Right content: queue details */}
      <div className="flex-1 p-6 overflow-auto">
        {selectedQueueId ? (
          <>
            {/* Header with queue name and actions */}
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-lg font-semibold">
                {selectedQueue?.name ?? "队列"}
              </h1>
              <div className="flex items-center gap-2">
                {hasExhausted && (
                  <Button variant="ghost" size="sm" onClick={() => onResetExhausted(selectedQueueId)}>
                    重置用尽项
                  </Button>
                )}
                {selectedQueueId !== defaultQueueId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (window.confirm(`确定删除队列 "${selectedQueue?.name}"？`)) {
                        onDeleteQueue(selectedQueueId)
                      }
                    }}
                  >
                    删除队列
                  </Button>
                )}
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">
                点击供应商页面的模型 + 添加到队列
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <div className="flex flex-col gap-2">
                    {items.map((item, i) => (
                      <SortableQueueItem
                        key={ids[i]}
                        uid={ids[i]}
                        index={i}
                        label={getLabel(item)}
                        isActive={i === activeIdx}
                        isExhausted={exhaustedIndices.includes(i)}
                        onRemove={(idx) => onRemove(selectedQueueId, idx)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-8">
            请选择一个队列
          </div>
        )}
      </div>
    </div>
  )
}
