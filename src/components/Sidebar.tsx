import { useState, useEffect } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { cn } from "@/lib/utils"
import {
  LayoutGrid,
  ListOrdered,
  FileText,
  Settings,
} from "lucide-react"
import logoImg from "@/assets/images/logo.png"

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
  const [version, setVersion] = useState("")
  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("0.1.0"))
  }, [])

  return (
    <div className="w-[240px] h-full bg-secondary border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-5 pb-4 flex items-center gap-3">
        <img src={logoImg} alt="freemodel-auto-router" className="h-12 w-12 rounded-lg" />
        <div className="leading-[1.15]">
          <div className="font-semibold text-base text-foreground">freemodel</div>
          <div className="text-xs text-muted-foreground -mt-0.5">auto-router</div>
        </div>
      </div>

      {/* Menu items */}
      <nav className="flex flex-col gap-0.5 px-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onPageChange(item.id)}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left",
              currentPage === item.id
                ? "bg-primary/10 text-primary font-medium border border-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      {/* Version footer */}
      <div className="mt-auto px-4 py-3 text-xs text-muted-foreground">
        v{version}
      </div>
    </div>
  )
}
