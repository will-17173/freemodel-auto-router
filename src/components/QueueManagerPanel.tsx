import type { Queue, QueueStateInfo, Provider } from "../types";

interface Props {
  queues: Record<string, Queue>;
  queueStates: Record<string, QueueStateInfo>;
  providers: Provider[];
  defaultQueueId: string;
  selectedQueueId: string | null;
  onSelectQueue: (queueId: string) => void;
  onCreateQueue: (name: string) => void;
  onDeleteQueue: (queueId: string) => void;
}

export function QueueManagerPanel({
  queues,
  queueStates,
  providers: _providers,
  defaultQueueId,
  selectedQueueId,
  onSelectQueue,
  onCreateQueue,
  onDeleteQueue,
}: Props) {
  const queueList = Object.values(queues);

  return (
    <div style={{
      padding: "12px 24px 18px",
      borderBottom: "1px solid var(--fm-color-hairline)",
      background: "var(--fm-color-surface-soft)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <span className="fm-eyebrow">队列管理</span>
        <button
          className="fm-btn-text"
          style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
          onClick={() => {
            const name = prompt("输入队列名称")?.trim();
            if (name) onCreateQueue(name);
          }}
        >
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M8 2v12M2 8h12"/>
          </svg>
          新建
        </button>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {queueList.map((queue) => {
          const state = queueStates[queue.id];
          const isDefault = queue.id === defaultQueueId;
          const isSelected = queue.id === selectedQueueId;
          const itemCount = queue.items.length;
          const exhaustedCount = state?.exhausted_indices.length ?? 0;

          return (
            <div
              key={queue.id}
              onClick={() => onSelectQueue(queue.id)}
              style={{
                padding: "8px 12px",
                borderRadius: "8px",
                border: isSelected ? "2px solid var(--fm-color-ink)" : "1px solid var(--fm-color-hairline)",
                background: isSelected ? "var(--fm-color-surface)" : "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s",
              }}
            >
              <span className="fm-body-sm" style={{ fontWeight: 500 }}>
                {queue.name}
              </span>
              {isDefault && (
                <span className="fm-caption" style={{
                  background: "var(--fm-success)",
                  color: "#fff",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "10px",
                }}>
                  默认
                </span>
              )}
              {itemCount > 0 && (
                <span className="fm-caption" style={{
                  background: exhaustedCount >= itemCount ? "var(--fm-magenta)" : "var(--fm-color-surface-soft)",
                  color: exhaustedCount >= itemCount ? "#fff" : "var(--fm-color-ink)",
                  borderRadius: "var(--fm-radius-full)",
                  padding: "2px 6px",
                  fontSize: "11px",
                }}>
                  {exhaustedCount >= itemCount ? "用尽" : `${itemCount}项`}
                </span>
              )}
              {!isDefault && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`确定删除队列 "${queue.name}"？`)) {
                      onDeleteQueue(queue.id);
                    }
                  }}
                  style={{
                    marginLeft: "4px",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--fm-ink-faint)",
                    display: "flex",
                    alignItems: "center",
                    padding: "0",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 4L4 12M4 4l8 8"/>
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
