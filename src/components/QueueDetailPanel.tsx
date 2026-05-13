import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { QueueItem, Provider, QueueStateInfo } from "../types";

interface SortableItemProps {
  uid: string;
  item: QueueItem;
  index: number;
  label: string;
  isActive: boolean;
  isExhausted: boolean;
  onRemove: (i: number) => void;
}

function SortableQueueItem({
  uid,
  item: _item,
  index,
  label,
  isActive,
  isExhausted,
  onRemove,
}: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : isExhausted ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "6px 10px",
    borderRadius: "var(--fm-r-sm)",
    border: isActive && !isExhausted
      ? "1px solid var(--fm-success)"
      : "1px solid var(--fm-color-hairline)",
    background: isActive && !isExhausted ? "#f0faf4" : "#ffffff",
    cursor: "default",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <span className="fm-caption" style={{
        fontWeight: 600,
        color: isExhausted ? "var(--fm-ink-faint)" : "var(--fm-color-ink)",
        minWidth: "14px",
        textAlign: "center",
        flexShrink: 0,
      }}>
        {index + 1}
      </span>

      {isActive && !isExhausted && (
        <span className="fm-caption" style={{
          background: "var(--fm-success)",
          color: "#ffffff",
          borderRadius: "4px",
          padding: "1px 5px",
          fontSize: "10px",
          fontWeight: 600,
          flexShrink: 0,
        }}>
          当前
        </span>
      )}

      {isExhausted && (
        <span className="fm-caption" style={{
          background: "var(--fm-ink-faint)",
          color: "#ffffff",
          borderRadius: "4px",
          padding: "1px 5px",
          fontSize: "10px",
          flexShrink: 0,
        }}>
          已用尽
        </span>
      )}

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
          <circle cx="2" cy="2" r="1"/>
          <circle cx="6" cy="2" r="1"/>
          <circle cx="2" cy="5" r="1"/>
          <circle cx="6" cy="5" r="1"/>
          <circle cx="2" cy="8" r="1"/>
          <circle cx="6" cy="8" r="1"/>
        </svg>
      </span>

      <span className="fm-body-sm" style={{
        fontWeight: 500,
        color: isExhausted ? "var(--fm-ink-faint)" : "var(--fm-color-ink)",
      }}>
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
        }}
        aria-label="从队列移除"
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 4L4 12M4 4l8 8"/>
        </svg>
      </button>
    </div>
  );
}

interface Props {
  queueId: string;
  items: QueueItem[];
  providers: Provider[];
  stateInfo: QueueStateInfo | undefined;
  onReorder: (newItems: QueueItem[]) => void;
  onRemove: (index: number) => void;
  onResetExhausted: () => void;
}

export function QueueDetailPanel({
  queueId: _queueId,
  items,
  providers,
  stateInfo,
  onReorder,
  onRemove,
  onResetExhausted,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const ids = items.map(
    (item, i) => `${item.provider_id}::${item.model_id}::${i}`
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(arrayMove(items, oldIdx, newIdx));
    }
  }

  function getLabel(item: QueueItem): string {
    const provider = providers.find((p) => p.id === item.provider_id);
    const model = provider?.models.find((m) => m.id === item.model_id);
    return `${provider?.name ?? item.provider_id} / ${model?.name ?? item.model_id}`;
  }

  const exhaustedIndices = stateInfo?.exhausted_indices ?? [];
  const activeIdx = stateInfo?.active_idx ?? 0;
  const hasExhausted = exhaustedIndices.length > 0;

  if (items.length === 0) {
    return (
      <div style={{
        padding: "12px 24px",
        borderBottom: "1px solid var(--fm-color-hairline)",
      }}>
        <span className="fm-body-sm" style={{ color: "var(--fm-ink-faint)" }}>
          队列为空，点击供应商旁的 + 按钮添加
        </span>
      </div>
    );
  }

  return (
    <div style={{
      padding: "12px 24px 18px",
      borderBottom: "1px solid var(--fm-color-hairline)",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: "12px",
      }}>
        <span className="fm-caption" style={{ color: "var(--fm-ink-muted)" }}>
          队列内容
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="fm-caption" style={{
            background: "#fff",
            border: "1px solid var(--fm-color-hairline)",
            borderRadius: "var(--fm-radius-full)",
            padding: "2px 8px",
          }}>
            {items.length}
          </span>
          {hasExhausted && (
            <button
              className="fm-btn-text"
              style={{ fontSize: "12px", color: "var(--fm-magenta)" }}
              onClick={onResetExhausted}
            >
              重置
            </button>
          )}
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {items.map((item, i) => (
              <SortableQueueItem
                key={ids[i]}
                uid={ids[i]}
                item={item}
                index={i}
                label={getLabel(item)}
                isActive={i === activeIdx}
                isExhausted={exhaustedIndices.includes(i)}
                onRemove={onRemove}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
