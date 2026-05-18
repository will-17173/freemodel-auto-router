import { useState, useMemo } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

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
          <DialogTitle>添加模型</DialogTitle>
          <DialogDescription>{providerName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium">模型列表</label>
          <textarea
            value={models}
            onChange={(e) => { setModels(e.target.value); setError("") }}
            onKeyDown={handleKeyDown}
            placeholder={"claude-sonnet-4-6"}
            rows={4}
            autoFocus
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y min-h-[104px] font-mono"
          />
          <p className="text-xs text-muted-foreground">
            一行一个模型，填写模型 ID
          </p>
        </div>

        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {error ? <span className="text-destructive">{error}</span> : `将添加 ${parsedIds.length} 个模型`}
          </span>
          <Button onClick={handleSave}>添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
