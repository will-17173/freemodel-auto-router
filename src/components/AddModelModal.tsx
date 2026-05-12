import { useState, useMemo } from "react";

interface Props {
  providerName: string;
  existingModelIds: string[];
  onSave: (modelIds: string[]) => void;
  onClose: () => void;
}

function parseModelIds(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

export function AddModelModal({ providerName, existingModelIds, onSave, onClose }: Props) {
  const [models, setModels] = useState("");
  const [error, setError] = useState("");

  const parsedIds = useMemo(() => parseModelIds(models), [models]);

  function handleSave() {
    if (parsedIds.length === 0) {
      setError("请至少填写一个模型");
      return;
    }

    // Check for duplicates with existing models
    const duplicates = parsedIds.filter((id) => existingModelIds.includes(id));
    if (duplicates.length > 0) {
      setError(`已存在: ${duplicates.join(", ")}`);
      return;
    }

    onSave(parsedIds);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fm-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fm-modal" style={{ width: "420px" }}>
        <div style={{
          padding: "20px 24px 18px",
          borderBottom: "1px solid var(--fm-color-hairline)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ color: "var(--fm-color-ink)" }}>
                <path d="M8 2v12M2 8h12"/>
              </svg>
              <span className="fm-headline-sm">添加模型</span>
            </div>
            <p className="fm-body-sm" style={{ margin: "0 0 0 25px", color: "var(--fm-ink-muted)" }}>
              {providerName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: "28px",
              height: "28px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--fm-radius-full)",
              border: "none",
              background: "transparent",
              color: "var(--fm-color-ink)",
              cursor: "pointer",
              flexShrink: 0,
            }}
            aria-label="关闭"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 4L4 12M4 4l8 8"/>
            </svg>
          </button>
        </div>

        <div style={{ padding: "20px 24px 24px" }}>
          <label style={{ display: "block", marginBottom: "16px" }}>
            <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>模型列表</span>
            <textarea
              value={models}
              onChange={(e) => { setModels(e.target.value); setError(""); }}
              onKeyDown={handleKeyDown}
              placeholder={"claude-3-5-sonnet-latest\nclaude-3-5-haiku-latest"}
              className="fm-input"
              rows={4}
              autoFocus
              style={{
                resize: "vertical",
                minHeight: "104px",
                fontFamily: "var(--fm-font-mono)",
                fontSize: "13px",
                lineHeight: 1.5,
              }}
            />
            <span className="fm-caption" style={{ display: "block", marginTop: "8px", color: "var(--fm-ink-muted)" }}>
              一行一个模型，也支持用英文逗号分隔。
            </span>
          </label>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}>
            <span className="fm-caption" style={{ color: error ? "var(--fm-warning)" : "var(--fm-ink-muted)" }}>
              {error || `将添加 ${parsedIds.length} 个模型`}
            </span>
            <button
              onClick={handleSave}
              className="fm-btn-primary"
              style={{ justifyContent: "center", padding: "11px 20px", fontSize: "14px" }}
            >
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
