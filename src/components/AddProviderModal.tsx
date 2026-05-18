import { useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

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

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>添加服务商</DialogTitle>
          <DialogDescription>
            配置 Anthropic 和 OpenAI 双协议 URL，或勾选单一地址兼容模式。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">服务商名</label>
            <Input
              value={name}
              onChange={(e) => { setName(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder="例如：My Anthropic Proxy"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">API Key</label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder=""
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">服务商网站</label>
            <Input
              value={link}
              onChange={(e) => { setLink(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder="https://example.com"
              className="font-mono text-xs"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={dualProtocol}
              onChange={(e) => { setDualProtocol(e.target.checked); setError("") }}
              className="h-4 w-4"
            />
            双协议兼容（使用同一地址同时支持 Anthropic 和 OpenAI 协议）
          </label>

          <div className="space-y-2">
            <label className="text-sm font-medium">Anthropic URL</label>
            <Input
              value={anthropicUrl}
              onChange={(e) => { setAnthropicUrl(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder="https://api.example.com"
              className="font-mono text-xs"
            />
          </div>

          {!dualProtocol && (
            <div className="space-y-2">
              <label className="text-sm font-medium">OpenAI URL</label>
              <Input
                value={openaiUrl}
                onChange={(e) => { setOpenaiUrl(e.target.value); setError("") }}
                onKeyDown={handleKeyDown}
                placeholder="https://api.example.com/openai"
                className="font-mono text-xs"
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">模型列表</label>
            <textarea
              value={models}
              onChange={(e) => { setModels(e.target.value); setError("") }}
              onKeyDown={handleKeyDown}
              placeholder={"claude-sonnet-4-6\nglm-5.1"}
              rows={4}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[104px] font-mono"
            />
            <p className="text-xs text-muted-foreground">
              一行一个模型，填写模型 ID
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {error ? <span className="text-destructive">{error}</span> : `将添加 ${modelIds.length} 个模型`}
          </span>
          <Button onClick={handleSave}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
