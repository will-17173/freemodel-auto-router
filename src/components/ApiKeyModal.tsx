import { useState, useEffect } from "react"
import { getAuth } from "@/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface Props {
  providerId: string
  providerName: string
  onSave: (key: string) => void
  onClose: () => void
}

export function ApiKeyModal({ providerId, providerName, onSave, onClose }: Props) {
  const [key, setKey] = useState("")
  const [show, setShow] = useState(false)

  useEffect(() => {
    getAuth(providerId).then((k) => { setKey(k || "") })
  }, [providerId])

  function handleSave() {
    onSave(key.trim())
    onClose()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSave()
    if (e.key === "Escape") onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-[340px]">
        <DialogHeader>
          <DialogTitle>配置 API Key</DialogTitle>
          <DialogDescription>{providerName}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Input
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="sk-..."
            autoFocus
            className="font-mono text-xs pr-16"
          />
          <button
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            type="button"
          >
            {show ? "隐藏" : "显示"}
          </button>
        </div>

        <Button onClick={handleSave} className="w-full">保存</Button>
      </DialogContent>
    </Dialog>
  )
}
