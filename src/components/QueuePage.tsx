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
  rectSortingStrategy,
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
  onCreateQueue: (name: string) => void
  onDeleteQueue: (queueId: string) => void
  onReorder: (queueId: string, items: QueueItem[]) => void
  onRemove: (queueId: string, index: number) => void
  onResetExhausted: (queueId: string) => void
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
  onCreateQueue,
  onDeleteQueue,
  onReorder,
  onRemove,
  onResetExhausted,
}: QueuePageProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const queueList = Object.values(queues)
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
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">路由队列</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const name = prompt("输入队列名称")?.trim()
            if (name) onCreateQueue(name)
          }}
        >
          新建队列
        </Button>
      </div>

      {/* Queue selector */}
      <div className="flex flex-wrap gap-2 mb-6">
        {queueList.map((queue) => {
          const state = queueStates[queue.id]
          const isDefault = queue.id === defaultQueueId
          const isSelected = queue.id === selectedQueueId
          const itemCount = queue.items.length
          const exhaustedCount = state?.exhausted_indices.length ?? 0

          return (
            <div
              key={queue.id}
              onClick={() => onSelectQueue(queue.id)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-sm",
                isSelected ? "border-foreground bg-card font-medium" : "border-border hover:border-foreground/50"
              )}
            >
              <span>{queue.name}</span>
              {isDefault && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">默认</Badge>
              )}
              {itemCount > 0 && (
                <Badge
                  variant={exhaustedCount >= itemCount ? "destructive" : "secondary"}
                  className="text-[10px] px-1.5 py-0"
                >
                  {exhaustedCount >= itemCount ? "用尽" : `${itemCount}项`}
                </Badge>
              )}
              {!isDefault && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (window.confirm(`确定删除队列 "${queue.name}"？`)) {
                      onDeleteQueue(queue.id)
                    }
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )
        })}
      </div>

      {/* Queue items */}
      {selectedQueueId && (
        <>
          {hasExhausted && (
            <div className="mb-3">
              <Button variant="ghost" size="sm" onClick={() => onResetExhausted(selectedQueueId)}>
                重置用尽项
              </Button>
            </div>
          )}

          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              点击供应商页面的模型 + 添加到队列
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ids} strategy={rectSortingStrategy}>
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
      )}
    </div>
  )
}
