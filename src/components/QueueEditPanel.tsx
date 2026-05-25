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
  providerName,
  modelName,
  onRemove,
}: {
  uid: string
  index: number
  providerName: string
  modelName: string
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
      className="fm-queue-draft-item"
    >
      <span {...attributes} {...listeners} className="fm-queue-draft-grip">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <span className="fm-queue-draft-index">{index + 1}.</span>
      <span className="fm-queue-draft-copy">
        <span className="fm-queue-draft-provider">{providerName}</span>
        <span className="fm-queue-draft-model">{modelName}</span>
      </span>
      <button
        onClick={() => onRemove(index)}
        className="fm-queue-draft-remove"
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

  function getItemDisplay(item: DraftItem): { providerName: string; modelName: string } {
    const provider = providers.find((p) => p.id === item.provider_id)
    const providerName = provider?.name ?? item.provider_id
    const model = provider?.models.find((m) => m.id === item.model_id)
    const modelName = model?.name ?? item.model_id
    return { providerName, modelName }
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
        "fixed right-0 top-12 bottom-0 w-[260px] z-40",
        "transition-transform duration-200 ease-in-out",
        open ? "translate-x-0" : "translate-x-full"
      )}
      style={{
        borderLeft: "1px solid var(--fm-border-default)",
        background: "var(--fm-bg-surface)",
      }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div
          className="p-3"
          style={{ borderBottom: "1px solid var(--fm-border-default)" }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <h2
              className="fm-text-zh"
              style={{ fontWeight: "var(--fm-weight-semibold)", color: "var(--fm-text-1)" }}
            >
              {mode === "new" ? "新建队列" : "编辑队列"}
            </h2>
            <button
              onClick={onClose}
              className="h-6 w-6 rounded flex items-center justify-center transition-colors"
              style={{ color: "var(--fm-text-4)", background: "transparent", border: "none", cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-text-1)"; e.currentTarget.style.background = "var(--fm-bg-hover)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)"; e.currentTarget.style.background = "transparent" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="fm-text-tech flex-shrink-0" style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-3)" }}>名称</span>
            <input
              value={queueName}
              onChange={(e) => onQueueNameChange(e.target.value)}
              placeholder="队列名称"
              className="fm-input flex-1"
              style={{ height: "28px", padding: "4px 8px" }}
            />
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-auto p-3">
          <div className="fm-text-tech mb-2" style={{ fontSize: "10px", color: "var(--fm-text-4)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            队列项 ({items.length})
          </div>
          {items.length === 0 ? (
            <div className="fm-text-zh text-center py-8" style={{ color: "var(--fm-text-4)" }}>
              点击左侧模型添加
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1.5">
                  {items.map((item, i) => {
                    const display = getItemDisplay(item)
                    return (
                      <SortableDraftItem
                        key={ids[i]}
                        uid={ids[i]}
                        index={i}
                        providerName={display.providerName}
                        modelName={display.modelName}
                        onRemove={onRemoveItem}
                      />
                    )
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Footer */}
        <div className="p-3" style={{ borderTop: "1px solid var(--fm-border-default)" }}>
          {items.length > 0 && (
            <button
              onClick={onClearAll}
              className="fm-text-tech block mb-2.5 transition-colors"
              style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-4)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-error-text)" }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)" }}
            >
              清空全部
            </button>
          )}
          <div className="flex items-center gap-2">
            <button className="fm-btn-secondary flex-1" onClick={onCancel}>取消</button>
            <button className="fm-btn-primary flex-1" onClick={onSave}>
              {mode === "new" ? "创建" : "保存"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
