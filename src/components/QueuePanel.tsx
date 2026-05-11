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
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QueueItem, Provider } from "../types";

interface Props {
  queue: QueueItem[];
  providers: Provider[];
  onReorder: (newQueue: QueueItem[]) => void;
  onRemove: (index: number) => void;
}

function SortableQueueItem({
  item,
  index,
  label,
  isFirst,
  onRemove,
}: {
  item: QueueItem;
  index: number;
  label: string;
  isFirst: boolean;
  onRemove: (i: number) => void;
}) {
  const uid = `${item.provider_id}::${item.model_id}::${index}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isFirst ? "fm-queue-chip fm-queue-chip-first" : "fm-queue-chip"}
    >
      {/* Priority number */}
      <span className="fm-caption" style={{
        fontWeight: 600,
        color: "var(--fm-color-ink)",
        minWidth: "14px",
        textAlign: "center",
        flexShrink: 0,
      }}>
        {index + 1}
      </span>

      {/* Current route indicator for first item */}
      {isFirst && (
        <span className="fm-caption" style={{
          background: "var(--fm-success)",
          color: "#ffffff",
          borderRadius: "4px",
          padding: "2px 6px",
          fontSize: "11px",
          fontWeight: 600,
          letterSpacing: "0.6px",
          textTransform: "uppercase",
          flexShrink: 0,
        }}>
          当前
        </span>
      )}

      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        style={{
          color: "var(--fm-ink-faint)",
          cursor: "grab",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
        }}
        title="拖拽排序"
      >
        <svg width="8" height="10" viewBox="0 0 8 10" fill="currentColor">
          <circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/>
          <circle cx="2" cy="5" r="1"/><circle cx="6" cy="5" r="1"/>
          <circle cx="2" cy="8" r="1"/><circle cx="6" cy="8" r="1"/>
        </svg>
      </span>

      <span className="fm-body-sm" style={{ fontWeight: 500 }}>
        {label}
      </span>

      <button
        onClick={() => onRemove(index)}
        style={{
          marginLeft: "2px",
          color: "var(--fm-ink-faint)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--fm-magenta)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--fm-ink-faint)"; }}
        aria-label="从队列移除"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 4L4 12M4 4l8 8"/>
        </svg>
      </button>
    </div>
  );
}

export function QueuePanel({ queue, providers, onReorder, onRemove }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const ids = queue.map(
    (item, i) => `${item.provider_id}::${item.model_id}::${i}`
  );

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(active.id);
    const newIdx = ids.indexOf(over.id);
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(arrayMove(queue, oldIdx, newIdx));
    }
  }

  function getLabel(item: QueueItem) {
    const provider = providers.find((p) => p.id === item.provider_id);
    const model = provider?.models.find((m) => m.id === item.model_id);
    return `${provider?.name ?? item.provider_id} / ${model?.name ?? item.model_id}`;
  }

  return (
    <div style={{
      padding: "12px 24px 18px",
      borderBottom: "1px solid var(--fm-color-hairline)",
      background: "var(--fm-color-surface-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span className="fm-eyebrow">路由队列</span>
        </div>
        {queue.length > 0 && (
          <span className="fm-caption" style={{
            color: "var(--fm-color-ink)",
            background: "#ffffff",
            border: "1px solid var(--fm-color-hairline)",
            borderRadius: "var(--fm-radius-full)",
            padding: "2px 8px",
            fontWeight: 500,
          }}>
            {queue.length}
          </span>
        )}
      </div>

      {queue.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fm-ink-faint)" }}>
            <path d="M2 4h12M2 8h8M2 12h5"/>
          </svg>
          <span className="fm-body-sm">
            点击模型旁的 + 添加到队列
          </span>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {queue.map((item, i) => (
                <SortableQueueItem
                  key={ids[i]}
                  item={item}
                  index={i}
                  label={getLabel(item)}
                  isFirst={i === 0}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
