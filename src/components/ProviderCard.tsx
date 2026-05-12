import type { Provider } from "../types";

interface Props {
  provider: Provider;
  hasKey: boolean;
  isActive: boolean;
  onAddToQueue: (providerId: string, modelId: string) => void;
  onConfigKey: (providerId: string) => void;
  onAddModel: (providerId: string) => void;
}

export function ProviderCard({ provider, hasKey, isActive, onAddToQueue, onConfigKey, onAddModel }: Props) {
  return (
    <div className={isActive ? "fm-card-active" : "fm-card"} style={{ position: "relative" }}>
      {isActive && (
        <div style={{
          position: "absolute",
          top: 0,
          left: "24px",
          right: "24px",
          height: "4px",
          borderRadius: "0 0 2px 2px",
          background: "var(--fm-color-primary)",
        }} />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "14px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
            {isActive && (
              <div style={{
                width: "7px", height: "7px", borderRadius: "50%",
                background: "var(--fm-success)", flexShrink: 0,
              }} />
            )}
            <span style={{
              fontSize: "20px", fontWeight: 700, color: "var(--fm-color-ink)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {provider.name}
            </span>
          </div>
        </div>

        <button
          onClick={() => onConfigKey(provider.id)}
          style={hasKey ? {
            display: "inline-flex", alignItems: "center", gap: "5px",
            fontFamily: "var(--fm-font-sans)",
            fontSize: "14px", fontWeight: 500,
            borderRadius: "999px",
            padding: "7px 14px",
            border: "1.5px solid var(--fm-color-hairline)",
            background: "var(--fm-color-surface-soft)",
            color: "var(--fm-color-ink)",
            cursor: "pointer",
            flexShrink: 0, marginLeft: "8px",
          } : {
            display: "inline-flex", alignItems: "center", gap: "5px",
            fontFamily: "var(--fm-font-sans)",
            fontSize: "14px", fontWeight: 500,
            borderRadius: "999px",
            padding: "7px 14px",
            border: "1.5px solid rgba(245,158,11,0.45)",
            background: "rgba(245,158,11,0.14)",
            color: "#fbbf24",
            cursor: "pointer",
            flexShrink: 0, marginLeft: "8px",
          }}
          aria-label={hasKey ? "编辑 API Key" : "配置 API Key"}
        >
          {hasKey ? (
            <>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 1a3 3 0 013 3 3 3 0 01-3 3 3 3 0 01-2.83-2H3l-1 1-1-1 1-1H2V3h1V2h1l1-1h3.17A3 3 0 0111 1z"/>
                <circle cx="11" cy="4" r="1" fill="currentColor" stroke="none"/>
              </svg>
              Key ✓
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M8 2v12M2 8h12"/>
              </svg>
              配置 Key
            </>
          )}
        </button>
      </div>

      {/* Models section */}
      <div>
        <div style={{
          fontFamily: "var(--fm-font-mono)",
          fontSize: "13px", fontWeight: 500,
          letterSpacing: "0.8px", textTransform: "uppercase" as const,
          color: "var(--fm-color-ink)",
          marginBottom: "10px",
        }}>
          模型
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {provider.models.map((m) => (
            <button
              key={m.id}
              onClick={() => onAddToQueue(provider.id, m.id)}
              disabled={!hasKey}
              title={hasKey ? `添加 ${m.name} 到队列` : "请先配置 API Key"}
              style={{
                fontFamily: "var(--fm-font-sans)",
                fontSize: "14px", fontWeight: 500,
                borderRadius: "999px",
                padding: "7px 14px 8px",
                border: "1.5px solid var(--fm-color-hairline)",
                background: hasKey ? "var(--fm-color-surface-soft)" : "#ffffff",
                color: "var(--fm-color-ink)",
                cursor: hasKey ? "pointer" : "not-allowed",
                display: "inline-flex", alignItems: "center", gap: "5px",
                opacity: hasKey ? 1 : 0.55,
              }}
            >
              <span>{m.name}</span>
              {hasKey && (
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ opacity: 0.5 }}>
                  <path d="M8 2v12M2 8h12"/>
                </svg>
              )}
            </button>
          ))}
          {/* Add model button */}
          <button
            onClick={() => onAddModel(provider.id)}
            title="添加模型"
            style={{
              fontFamily: "var(--fm-font-sans)",
              fontSize: "14px", fontWeight: 500,
              borderRadius: "999px",
              padding: "7px 14px 8px",
              border: "1.5px dashed var(--fm-color-hairline)",
              background: "transparent",
              color: "var(--fm-ink-faint)",
              cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: "5px",
              transition: "border-color 0.15s, color 0.15s, background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#000000";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--fm-color-ink)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--fm-color-surface-soft)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--fm-color-hairline)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--fm-ink-faint)";
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M8 2v12M2 8h12"/>
            </svg>
          </button>
          {provider.models.length === 0 && (
            <span style={{ fontSize: "15px", color: "var(--fm-ink-faint)", fontStyle: "italic" }}>暂无模型</span>
          )}
        </div>
      </div>
    </div>
  );
}