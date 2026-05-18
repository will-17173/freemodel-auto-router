import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

type Props = {
  open: boolean
  onClose: () => void
}

const steps = [
  "在「服务商」里添加或配置 API Key。",
  "在「路由」里拖拽模型，调整优先级。",
  "打开本应用右上角的客户端开关后，应用会自动把该应用的 API 地址改为本应用提供的地址。",
  "请求会按顺序尝试模型，失败时自动切换到下一个。",
]

export function OnboardingModal({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose() }}>
      <DialogContent className="w-[calc(100vw-32px)] max-w-[520px] gap-8">
        <DialogHeader className="space-y-3 text-left">
          <DialogTitle className="text-2xl">使用说明</DialogTitle>
          <DialogDescription className="text-base leading-7">
            FreeModel Auto Router 会把不同 AI 客户端的请求自动转发到可用模型。
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 text-sm leading-6 text-foreground">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <DialogFooter>
          <Button className="w-full sm:w-auto" onClick={onClose}>
            我知道了
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
