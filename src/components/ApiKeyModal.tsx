import { useState } from "react";

interface Props {
  providerName: string;
  currentKey: string;
  onSave: (key: string) => void;
  onClose: () => void;
}

export function ApiKeyModal({ providerName, currentKey, onSave, onClose }: Props) {
  const [key, setKey] = useState(currentKey);
  const [show, setShow] = useState(false);

  function handleSave() {
    onSave(key.trim());
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") onClose();
  }

  return (
    <div
      className="fm-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fm-modal" style={{ width: "340px" }}>
        {/* Header — lilac color block */}
        <div style={{
          padding: "20px 24px 18px",
          borderBottom: "1px solid var(--fm-color-hairline)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--fm-color-ink)" }}>
                <path d="M11 1a3 3 0 013 3 3 3 0 01-3 3 3 3 0 01-2.83-2H3l-1 1-1-1 1-1H2V3h1V2h1l1-1h3.17A3 3 0 0111 1z"/>
                <circle cx="11" cy="4" r="1" fill="currentColor" stroke="none"/>
              </svg>
              <span className="fm-headline-sm">配置 API Key</span>
            </div>
            <p className="fm-body-sm" style={{
              margin: "0 0 0 25px",
              color: "var(--fm-ink-muted)",
            }}>
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
              transition: "background 0.15s, color 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--fm-ink-hover-bg)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--fm-color-ink)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--fm-color-ink)";
            }}
            aria-label="关闭"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 4L4 12M4 4l8 8"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 24px 24px" }}>
          <div style={{ position: "relative", marginBottom: "16px" }}>
            <input
              type={show ? "text" : "password"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="sk-..."
              autoFocus
              className="fm-input"
              style={{
                fontFamily: "var(--fm-font-mono)",
                fontSize: "13px",
                paddingRight: "60px",
                letterSpacing: show ? "normal" : "0.08em",
              }}
            />
            <button
              onClick={() => setShow(!show)}
              className="fm-caption"
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                color: "var(--fm-color-ink)",
                cursor: "pointer",
                padding: "3px 4px",
                fontWeight: 500,
                transition: "color 0.15s",
                letterSpacing: "0.40px",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--fm-magenta)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--fm-color-ink)"; }}
            >
              {show ? "隐藏" : "显示"}
            </button>
          </div>

          <button
            onClick={handleSave}
            className="fm-btn-primary"
            style={{ width: "100%", justifyContent: "center", padding: "11px 20px", fontSize: "14px" }}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
