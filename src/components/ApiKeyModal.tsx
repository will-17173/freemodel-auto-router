import { useState, useEffect } from "react"
import { getAuth } from "@/api"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"

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
          <DialogTitle className="fm-text-zh">配置 API Key</DialogTitle>
          <DialogDescription className="fm-text-zh">{providerName}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <input
            type={show ? "text" : "password"}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="sk-..."
            autoFocus
            className="fm-input fm-text-tech w-full"
            style={{ paddingRight: "48px", fontFamily: "var(--fm-font-mono)" }}
          />
          <button
            onClick={() => setShow(!show)}
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 fm-text-tech transition-colors"
            style={{ fontSize: "10px", color: "var(--fm-text-4)", background: "none", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-text-1)" }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)" }}
          >
            {show ? "隐藏" : "显示"}
          </button>
        </div>

        <button className="fm-btn-primary w-full" onClick={handleSave}>
          <span className="fm-text-zh">保存</span>
        </button>
      </DialogContent>
    </Dialog>
  )
}
