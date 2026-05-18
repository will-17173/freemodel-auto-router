import { GripVertical, X } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { queueItemKey } from "@/lib/queue"
import type { DraftItem, Provider } from "@/types"

interface QueueEditPanelProps {
  open: boolean
  mode: "new" | "edit"
  queueId?: string
  queueName: string
  items: DraftItem[]
  providers: Provider[]
  onQueueNameChange: (name: string) => void
  onRemoveItem: (index: number) => void
  onClearAll: () => void
  onReorder: (items: DraftItem[]) => void
  onSave: () => void
  onCancel: () => void
  onClose: () => void
}

function SortableDraftItem({
  uid,
  index,
  label,
  onRemove,
}: {
  uid: string
  index: number
  label: string
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
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 py-2 px-3 rounded-lg border border-border bg-card shadow-sm"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <span className="font-medium text-sm">
        {index + 1}. {label}
      </span>
      <button
        onClick={() => onRemove(index)}
        className="h-5 w-5 ml-auto rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

export function QueueEditPanel({
  open,
  mode,
  queueId: _queueId,
  queueName,
  items,
  providers,
  onQueueNameChange,
  onRemoveItem,
  onClearAll,
  onReorder,
  onSave,
  onCancel,
  onClose,
}: QueueEditPanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function getLabel(item: DraftItem): string {
    const provider = providers.find((p) => p.id === item.provider_id)
    const providerName = provider?.name ?? item.provider_id
    const model = provider?.models.find((m) => m.id === item.model_id)
    const modelName = model?.name ?? item.model_id
    return `${providerName} / ${modelName}`
  }

  const ids = items.map(queueItemKey)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(arrayMove(items, oldIdx, newIdx))
    }
  }

  return (
    <div
      className={cn(
        "fixed right-0 top-12 bottom-0 w-[280px] border-l border-border bg-[var(--fm-surface-wash)] shadow-2xl z-40",
        "transition-transform duration-300 ease-in-out",
        open ? "translate-x-0" : "translate-x-full"
      )}
    >
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border bg-card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-sm">
              {mode === "new" ? "新建队列" : "编辑队列"}
            </h2>
            <button
              onClick={onClose}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground shrink-0">队列名:</span>
            <Input
              value={queueName}
              onChange={(e) => onQueueNameChange(e.target.value)}
              placeholder="输入队列名称"
              className="h-8 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          <div className="text-xs font-medium text-muted-foreground mb-2">
            队列项 ({items.length} 项)
          </div>
          {items.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              点击服务商模型的 + 添加
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {items.map((item, i) => (
                    <SortableDraftItem
                      key={ids[i]}
                      uid={ids[i]}
                      index={i}
                      label={getLabel(item)}
                      onRemove={onRemoveItem}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="p-4 border-t border-border bg-card">
          {items.length > 0 && (
            <button
              onClick={onClearAll}
              className="text-xs text-muted-foreground hover:text-destructive mb-3 transition-colors block"
            >
              清空全部
            </button>
          )}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
              取消
            </Button>
            <Button size="sm" className="flex-1" onClick={onSave}>
              {mode === "new" ? "保存创建" : "保存修改"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
