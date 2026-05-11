import { useEffect, useState } from "react";
import { getProxyLogs } from "../api";
import type { ProxyLogEntry, ProxyLogLevel } from "../types";

interface ProxyLogPanelProps {
  onClose: () => void;
}

export function ProxyLogPanel({ onClose }: ProxyLogPanelProps) {
  const [logs, setLogs] = useState<ProxyLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const next = await getProxyLogs();
        if (!cancelled) setLogs(next);
      } catch (e) {
        console.error(e);
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="fm-modal-overlay" onClick={onClose}>
      <div
        className="fm-modal"
        style={{ width: "min(900px, calc(100vw - 32px))", maxHeight: "78vh", display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: "18px 20px",
          borderBottom: "1px solid var(--fm-color-hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}>
          <div>
            <div className="fm-eyebrow" style={{ color: "#ffffff" }}>代理日志</div>
            <div className="fm-caption" style={{ color: "#aaaaaa", marginTop: "6px" }}>
              GET localhost:7860/logs · 最近 {logs.length} 条
            </div>
          </div>
          <button className="fm-btn-secondary" onClick={onClose}>关闭</button>
        </div>

        <div style={{ overflow: "auto", padding: "14px", background: "var(--fm-color-canvas)" }}>
          {logs.length === 0 ? (
            <div className="fm-body-sm" style={{ color: "#aaaaaa", padding: "22px" }}>
              还没有代理请求日志。向 localhost:7860 发起请求后会显示在这里。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {logs.slice().reverse().map((entry) => (
                <LogRow key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LogRow({ entry }: { entry: ProxyLogEntry }) {
  return (
    <div style={{
      border: "1px solid var(--fm-color-hairline)",
      borderRadius: "14px",
      background: "var(--fm-color-surface-soft)",
      padding: "12px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <LevelBadge level={entry.level} />
          <span className="fm-body-sm" style={{ color: "#ffffff", fontWeight: 600 }}>
            {entry.message}
          </span>
        </div>
        <span className="fm-caption" style={{ color: "#aaaaaa", whiteSpace: "nowrap" }}>
          {formatTime(entry.timestamp_ms)}
        </span>
      </div>

      {Object.keys(entry.fields).length > 0 && (
        <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {Object.entries(entry.fields).map(([key, value]) => (
            <span
              key={key}
              className="fm-caption"
              style={{
                border: "1px solid var(--fm-color-hairline)",
                borderRadius: "999px",
                padding: "5px 8px",
                background: "rgba(255,255,255,0.04)",
                color: "#ffffff",
              }}
            >
              {key}={value || "-"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LevelBadge({ level }: { level: ProxyLogLevel }) {
  const color = level === "error" ? "var(--fm-magenta)" : level === "warn" ? "var(--fm-warning)" : "var(--fm-success)";
  return (
    <span className="fm-caption" style={{ color, textTransform: "uppercase" }}>
      {level}
    </span>
  );
}

function formatTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString();
}
