import { useMemo, useState } from "react";

export interface AddProviderPayload {
  name: string;
  apiKey: string;
  anthropicUrl: string;
  openaiUrl: string;
  dualProtocol: boolean;
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
  const [anthropicUrl, setAnthropicUrl] = useState("");
  const [openaiUrl, setOpenaiUrl] = useState("");
  const [dualProtocol, setDualProtocol] = useState(true); // 默认勾选：单一地址模式
  const [models, setModels] = useState("");
  const [error, setError] = useState("");

  const modelIds = useMemo(() => parseModelIds(models), [models]);

  // 当勾选 dualProtocol 时，openaiUrl 与 anthropicUrl 相同
  const effectiveOpenaiUrl = dualProtocol ? anthropicUrl : openaiUrl;

  function handleSave() {
    const nextName = name.trim();
    const nextApiKey = apiKey.trim();
    const nextAnthropicUrl = anthropicUrl.trim();
    const nextOpenaiUrl = effectiveOpenaiUrl.trim();

    if (!nextName) {
      setError("请填写供应商名");
      return;
    }
    if (!nextApiKey) {
      setError("请填写 API Key");
      return;
    }
    if (!nextAnthropicUrl) {
      setError("请填写 Anthropic URL");
      return;
    }
    if (!dualProtocol && !nextOpenaiUrl) {
      setError("请填写 OpenAI URL");
      return;
    }
    if (modelIds.length === 0) {
      setError("请至少填写一个模型");
      return;
    }

    onSave({
      name: nextName,
      apiKey: nextApiKey,
      anthropicUrl: nextAnthropicUrl.replace(/\/+$/, ""),
      openaiUrl: nextOpenaiUrl.replace(/\/+$/, ""),
      dualProtocol,
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
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ color: "var(--fm-color-ink)" }}>
                <path d="M8 2v12M2 8h12"/>
              </svg>
              <span className="fm-headline-sm">添加供应商</span>
            </div>
            <p className="fm-body-sm" style={{ margin: "0 0 0 25px", color: "var(--fm-ink-muted)" }}>
              配置 Anthropic 和 OpenAI 双协议 URL，或勾选单一地址兼容模式。
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

            {/* 单一地址兼容模式 checkbox */}
            <label style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={dualProtocol}
                onChange={(e) => { setDualProtocol(e.target.checked); setError(""); }}
                style={{ width: "15px", height: "15px", accentColor: "var(--fm-color-ink)", cursor: "pointer" }}
              />
              <span className="fm-body-sm">单一地址兼容模式（Anthropic / OpenAI 使用同一个 URL）</span>
            </label>

            <label>
              <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>Anthropic URL</span>
              <input
                value={anthropicUrl}
                onChange={(e) => { setAnthropicUrl(e.target.value); setError(""); }}
                onKeyDown={handleKeyDown}
                placeholder="https://api.example.com"
                className="fm-input"
                style={{ fontFamily: "var(--fm-font-mono)", fontSize: "13px" }}
              />
            </label>

            {/* OpenAI URL - 仅在非单一地址模式时显示 */}
            {!dualProtocol && (
              <label>
                <span className="fm-section-eyebrow" style={{ display: "block", marginBottom: "8px" }}>OpenAI URL</span>
                <input
                  value={openaiUrl}
                  onChange={(e) => { setOpenaiUrl(e.target.value); setError(""); }}
                  onKeyDown={handleKeyDown}
                  placeholder="https://api.example.com/openai"
                  className="fm-input"
                  style={{ fontFamily: "var(--fm-font-mono)", fontSize: "13px" }}
                />
              </label>
            )}

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
              <span className="fm-caption" style={{ display: "block", marginTop: "8px", color: "var(--fm-ink-muted)" }}>
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
            <span className="fm-caption" style={{ color: error ? "var(--fm-warning)" : "var(--fm-ink-muted)" }}>
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
