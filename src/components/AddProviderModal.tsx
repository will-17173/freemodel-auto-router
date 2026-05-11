import { useMemo, useState } from "react";

export interface AddProviderPayload {
  name: string;
  apiKey: string;
  baseUrl: string;
  modelIds: string[];
}

interface Props {
  onSave: (provider: AddProviderPayload) => void;
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

export function AddProviderModal({ onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [error, setError] = useState("");

  const modelIds = useMemo(() => parseModelIds(models), [models]);

  function handleSave() {
    const nextName = name.trim();
    const nextApiKey = apiKey.trim();
    const nextBaseUrl = baseUrl.trim();

    if (!nextName) {
      setError("请填写供应商名");
      return;
    }
    if (!nextApiKey) {
      setError("请填写 API Key");
      return;
    }
    if (!nextBaseUrl) {
      setError("请填写 Base URL");
      return;
    }
    if (modelIds.length === 0) {
      setError("请至少填写一个模型");
      return;
    }

    onSave({
      name: nextName,
      apiKey: nextApiKey,
      baseUrl: nextBaseUrl.replace(/\/+$/, ""),
      modelIds,
    });
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
      <div className="fm-modal" style={{ width: "440px" }}>
        <div style={{
          padding: "20px 24px 18px",
          borderBottom: "1px solid var(--fm-color-hairline)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ color: "#ffffff" }}>
                <path d="M8 2v12M2 8h12"/>
              </svg>
              <span className="fm-headline-sm">添加供应商</span>
            </div>
            <p className="fm-body-sm" style={{ margin: "0 0 0 25px", color: "#ffffff" }}>
              仅支持 Anthropic 协议，Base URL 需兼容 Anthropic Messages API。
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
              color: "#ffffff",
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
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginBottom: "16px" }}>
            <label>
              <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>供应商名</span>
              <input
                value={name}
                onChange={(e) => { setName(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="例如：My Anthropic Proxy"
                autoFocus
                className="fm-input"
              />
            </label>

            <label>
              <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>API Key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="sk-..."
                className="fm-input"
                style={{ fontFamily: "var(--fm-font-mono)", fontSize: "13px" }}
              />
            </label>

            <label>
              <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>Base URL</span>
              <input
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="https://api.example.com"
                className="fm-input"
                style={{ fontFamily: "var(--fm-font-mono)", fontSize: "13px" }}
              />
            </label>

            <label>
              <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>模型列表</span>
              <textarea
                value={models}
                onChange={(e) => { setModels(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder={"claude-3-5-sonnet-latest\nclaude-3-5-haiku-latest"}
                className="fm-input"
                rows={4}
                style={{
                  resize: "vertical",
                  minHeight: "104px",
                  fontFamily: "var(--fm-font-mono)",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              />
              <span className="fm-caption" style={{ display: "block", marginTop: "8px", color: "#aaaaaa" }}>
                一行一个模型，也支持用英文逗号分隔。将按 Anthropic 协议转发请求。
              </span>
            </label>
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}>
            <span className="fm-caption" style={{ color: error ? "var(--fm-warning)" : "#aaaaaa" }}>
              {error || `将添加 ${modelIds.length} 个模型`}
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
