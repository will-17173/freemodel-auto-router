import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CreateQueueModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void
}

export function CreateQueueModal({ open, onClose, onCreate }: CreateQueueModalProps) {
  const [name, setName] = useState("")
  const [error, setError] = useState("")

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("请输入队列名称")
      return
    }
    onCreate(trimmed)
    setName("")
    setError("")
    onClose()
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setName("")
      setError("")
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>新建队列</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="输入队列名称"
            autoFocus
          />
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
