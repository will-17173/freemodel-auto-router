import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"

interface Props {
  providerName: string
  existingModelIds: string[]
  onSave: (modelIds: string[]) => void
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

export function AddModelModal({ providerName, existingModelIds, onSave, onClose }: Props) {
  const [models, setModels] = useState("")
  const [error, setError] = useState("")

  const parsedIds = useMemo(() => parseModelIds(models), [models])

  function handleSave() {
    if (parsedIds.length === 0) {
      setError("请至少填写一个模型")
      return
    }
    const duplicates = parsedIds.filter((id) => existingModelIds.includes(id))
    if (duplicates.length > 0) {
      setError(`已存在: ${duplicates.join(", ")}`)
      return
    }
    onSave(parsedIds)
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") handleSave()
    if (e.key === "Escape") onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="fm-text-zh">添加模型</DialogTitle>
          <DialogDescription className="fm-text-zh">{providerName}</DialogDescription>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <label className="fm-text-zh" style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-3)", fontWeight: "var(--fm-weight-medium)" }}>模型列表</label>
          <textarea
            value={models}
            onChange={(e) => { setModels(e.target.value); setError("") }}
            onKeyDown={handleKeyDown}
            placeholder={"claude-sonnet-4-6"}
            rows={4}
            autoFocus
            className="fm-input fm-text-tech resize-y"
            style={{ minHeight: "96px", fontFamily: "var(--fm-font-mono)" }}
          />
          <p className="fm-text-zh" style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-4)" }}>
            一行一个模型，填写模型 ID
          </p>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="fm-text-zh" style={{ fontSize: "var(--fm-text-xs)", color: error ? "var(--fm-error-text)" : "var(--fm-text-4)" }}>
            {error || `将添加 ${parsedIds.length} 个模型`}
          </span>
          <button className="fm-btn-primary" onClick={handleSave}>
            <span className="fm-text-zh">添加</span>
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
