import type { ReactNode } from "react";

interface AppToggleProps {
  icon: ReactNode;
  color: string;
  enabled: boolean;
  disabled?: boolean;
  title?: string;
  onToggle: () => Promise<void>;
}

export function AppToggle({ icon, color, enabled, disabled, title, onToggle }: AppToggleProps) {
  // 边框和图标背景始终使用原色，不随 enabled 状态变灰
  const borderColor = color;

  return (
    <div
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        background: "var(--fm-color-surface-soft)",
        borderRadius: "8px",
        padding: "5px 10px",
        border: `1px solid ${borderColor}`,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "border-color 0.2s",
        userSelect: "none",
      }}
      onClick={async () => {
        if (disabled) return;
        try {
          await onToggle();
        } catch (e) {
          console.error(e);
        }
      }}
    >
      {/* Icon Badge */}
      <span style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "24px",
        height: "24px",
        borderRadius: "4px",
        background: color,
        transition: "background 0.2s",
      }}>
        {icon}
      </span>
      {/* Toggle track */}
      <div style={{
        position: "relative",
        width: "24px",
        height: "14px",
        borderRadius: "7px",
        background: enabled ? color : "var(--fm-ink-faint)",
        transition: "background 0.2s",
        flexShrink: 0,
      }}>
        <div style={{
          position: "absolute",
          top: "2px",
          left: enabled ? "12px" : "2px",
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
        }} />
      </div>
    </div>
  );
}
