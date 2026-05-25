import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

export interface AddProviderPayload {
  name: string
  apiKey: string
  link: string
  anthropicUrl: string
  openaiUrl: string
  dualProtocol: boolean
  modelIds: string[]
}

interface Props {
  onSave: (provider: AddProviderPayload) => void
  onClose: () => void
}

function parseModelIds(value: string) {
  const seen = new Set<string>()
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false
      seen.add(item)
      return true
    })
}

export function AddProviderModal({ onSave, onClose }: Props) {
  const [name, setName] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [link, setLink] = useState("")
  const [anthropicUrl, setAnthropicUrl] = useState("")
  const [openaiUrl, setOpenaiUrl] = useState("")
  const [dualProtocol, setDualProtocol] = useState(true)
  const [models, setModels] = useState("")
  const [error, setError] = useState("")

  const modelIds = useMemo(() => parseModelIds(models), [models])
  const effectiveOpenaiUrl = dualProtocol ? anthropicUrl : openaiUrl

  function handleSave() {
    const nextName = name.trim()
    const nextApiKey = apiKey.trim()
    const nextLink = link.trim()
    const nextAnthropicUrl = anthropicUrl.trim()
    const nextOpenaiUrl = effectiveOpenaiUrl.trim()

    if (!nextName) { setError("请填写服务商名"); return }
    if (!nextApiKey) { setError("请填写 API Key"); return }
    if (!nextAnthropicUrl) { setError("请填写 Anthropic URL"); return }
    if (!dualProtocol && !nextOpenaiUrl) { setError("请填写 OpenAI URL"); return }
    if (modelIds.length === 0) { setError("请至少填写一个模型"); return }

    onSave({
      name: nextName,
      apiKey: nextApiKey,
      link: nextLink,
      anthropicUrl: nextAnthropicUrl.replace(/\/+$/, ""),
      openaiUrl: nextOpenaiUrl.replace(/\/+$/, ""),
      dualProtocol,
      modelIds,
    })
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave()
    if (e.key === "Escape") onClose()
  }

  const fieldStyle = {
    display: "flex",
    flexDirection: "column" as const,
    gap: "6px",
  }

  const labelStyle = {
    fontSize: "var(--fm-text-xs)",
    color: "var(--fm-text-3)",
    fontWeight: "var(--fm-weight-medium)",
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="fm-text-zh">添加服务商</DialogTitle>
          <DialogDescription className="fm-text-zh">
            配置 Anthropic 和 OpenAI 双协议 URL，或勾选单一地址兼容模式。
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={fieldStyle}>
            <label className="fm-text-zh" style={labelStyle}>服务商名</label>
            <input
              className="fm-input"
              value={name}
              onChange={(e) => { setName(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder="例如：My Anthropic Proxy"
              autoFocus
            />
          </div>

          <div style={fieldStyle}>
            <label className="fm-text-tech" style={labelStyle}>API Key</label>
            <input
              type="password"
              className="fm-input fm-text-tech"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder="sk-..."
            />
          </div>

          <div style={fieldStyle}>
            <label className="fm-text-zh" style={labelStyle}>服务商网站</label>
            <input
              className="fm-input fm-text-tech"
              value={link}
              onChange={(e) => { setLink(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dualProtocol}
              onChange={(e) => { setDualProtocol(e.target.checked); setError("") }}
              className="h-4 w-4 rounded"
              style={{ accentColor: "var(--fm-primary)" }}
            />
            <span className="fm-text-zh" style={{ fontSize: "var(--fm-text-sm)", color: "var(--fm-text-2)" }}>
              双协议兼容（使用同一地址同时支持 Anthropic 和 OpenAI 协议）
            </span>
          </label>

          <div style={fieldStyle}>
            <label className="fm-text-tech" style={labelStyle}>Anthropic URL</label>
            <input
              className="fm-input fm-text-tech"
              value={anthropicUrl}
              onChange={(e) => { setAnthropicUrl(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder="https://api.example.com"
            />
          </div>

          {!dualProtocol && (
            <div style={fieldStyle}>
              <label className="fm-text-tech" style={labelStyle}>OpenAI URL</label>
              <input
                className="fm-input fm-text-tech"
                value={openaiUrl}
                onChange={(e) => { setOpenaiUrl(e.target.value); setError("") }}
                onKeyDown={handleKeyDown}
                placeholder="https://api.example.com/openai"
              />
            </div>
          )}

          <div style={fieldStyle}>
            <label className="fm-text-zh" style={labelStyle}>模型列表</label>
            <textarea
              value={models}
              onChange={(e) => { setModels(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder={"claude-sonnet-4-6\nglm-5.1"}
              rows={4}
              className="fm-input fm-text-tech resize-y"
              style={{ minHeight: "96px", fontFamily: "var(--fm-font-mono)" }}
            />
            <p className="fm-text-zh" style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-4)" }}>
              一行一个模型，填写模型 ID
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span style={{ fontSize: "var(--fm-text-xs)", color: error ? "var(--fm-error-text)" : "var(--fm-text-4)" }} className="fm-text-zh">
            {error || `将添加 ${modelIds.length} 个模型`}
          </span>
          <button className="fm-btn-primary" onClick={handleSave}>
            <span className="fm-text-zh">添加</span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
