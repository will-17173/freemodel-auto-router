import { useState } from "react";
import type { RetryConfig } from "../types";

interface Props {
  retry: RetryConfig;
  onSave: (retry: RetryConfig) => void;
  onClose: () => void;
}

export function SettingsModal({ retry, onSave, onClose }: Props) {
  const [maxRetries, setMaxRetries] = useState(String(retry.max_retries));
  const [retryDelay, setRetryDelay] = useState(String(retry.retry_delay_secs));

  function handleSave() {
    const max = parseInt(maxRetries, 10);
    const delay = parseInt(retryDelay, 10);
    if (isNaN(max) || isNaN(delay) || max < 0 || delay < 0) return;
    onSave({ max_retries: max, retry_delay_secs: delay });
    onClose();
  }

  return (
    <div
      className="fm-modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="fm-modal" style={{ width: "320px" }}>
        {/* Modal header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px 18px",
          borderBottom: "1px solid var(--fm-color-hairline)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#ffffff" }}>
              <circle cx="8" cy="8" r="2.5"/>
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06"/>
            </svg>
            <span className="fm-headline-sm">全局设置</span>
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
              color: "#ffffff",
              cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.09)";
              (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "#ffffff";
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
          <div className="fm-section-eyebrow" style={{ marginBottom: "14px" }}>失败重试</div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <span className="fm-body" style={{ color: "#ffffff" }}>最大重试次数</span>
              <input
                type="number"
                min={0}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(e.target.value)}
                className="fm-input"
                style={{ width: "72px", textAlign: "right", fontFamily: "var(--fm-font-mono)", fontSize: "14px" }}
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
              <span className="fm-body" style={{ color: "#ffffff" }}>重试间隔（秒）</span>
              <input
                type="number"
                min={0}
                max={60}
                value={retryDelay}
                onChange={(e) => setRetryDelay(e.target.value)}
                className="fm-input"
                style={{ width: "72px", textAlign: "right", fontFamily: "var(--fm-font-mono)", fontSize: "14px" }}
              />
            </label>
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
