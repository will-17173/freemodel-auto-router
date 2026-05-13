import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  LayoutGrid,
  ListOrdered,
  FileText,
  Settings,
} from "lucide-react"

export type PageId = "providers" | "queue" | "logs" | "settings"

interface SidebarProps {
  currentPage: PageId
  onPageChange: (page: PageId) => void
}

const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: "providers", label: "供应商", icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "queue", label: "路由队列", icon: <ListOrdered className="h-4 w-4" /> },
  { id: "logs", label: "日志", icon: <FileText className="h-4 w-4" /> },
  { id: "settings", label: "设置", icon: <Settings className="h-4 w-4" /> },
]

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <div className="w-[200px] h-full bg-secondary border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-5">
        <div className="font-semibold text-base text-foreground">freemodel</div>
        <div className="text-xs text-muted-foreground">auto-router</div>
      </div>

      {/* Menu items */}
      <nav className="flex flex-col gap-1 px-3">
        {menuItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={cn(
              "justify-start gap-2",
              currentPage === item.id && "bg-background border border-border font-medium"
            )}
            onClick={() => onPageChange(item.id)}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </nav>
    </div>
  )
}
