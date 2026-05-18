import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface Props {
  open: boolean
  onClose: () => void
}

export function ProviderInfoModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="max-w-[360px]">
        <DialogHeader>
          <DialogTitle>服务商说明</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-3">
          <p>
            预设列表里的模型可能是不全的，你可以添加自己需要的模型，注意要填模型 ID。
          </p>
          <p>
            你也可以添加自己的服务商，免费或者付费的都是可以使用的。
          </p>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={onClose}>知道了</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}