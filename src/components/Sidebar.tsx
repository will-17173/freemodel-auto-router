import { useEffect, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { openUrl } from "@tauri-apps/plugin-opener"
import { cn } from "@/lib/utils"
import {
  Globe,
  LayoutGrid,
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
  { id: "providers", label: "服务商", icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { id: "logs", label: "日志", icon: <FileText className="h-3.5 w-3.5" /> },
  { id: "settings", label: "设置", icon: <Settings className="h-3.5 w-3.5" /> },
]

function GithubIcon() {
  return (
    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33s1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2" />
    </svg>
  )
}

function BilibiliIcon() {
  return (
    <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
        <path d="M4.903 6.934h14.155s1.467 0 1.467 1.468v9.273s0 1.468-1.467 1.468H4.903s-1.468 0-1.468-1.468V8.402s0-1.468 1.468-1.468" />
        <path d="M14.725 15.839c-.06.27-.35.619-.998.619c-1.178 0-1.707-1.468-1.707-1.468s-.53 1.468-1.707 1.468c-.689 0-.998-.35-.998-.62" />
        <path d="M4.653 4.25A3.913 3.913 0 0 0 .75 8.161v9.763a3.903 3.903 0 0 0 3.903 3.903h.998v.22a1.228 1.228 0 0 0 2.446 0v-.25h7.806v.25a1.227 1.227 0 0 0 2.446 0v-.25h.998a3.903 3.903 0 0 0 3.903-3.903V8.162a3.913 3.913 0 0 0-3.903-3.913zm1.068 7.426l3.843-.779m8.675.779l-3.843-.779M6.12.835L9.534 4.25M17.84.835L14.426 4.25" />
      </g>
    </svg>
  )
}

const footerLinks = [
  { label: "官网", url: "https://www.coding-plan.xyz/", icon: <Globe className="h-4 w-4" /> },
  { label: "GitHub", url: "https://github.com/will-17173/freemodel-auto-router", icon: <GithubIcon /> },
  { label: "Bilibili", url: "https://space.bilibili.com/328381287", icon: <BilibiliIcon /> },
]

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const [version, setVersion] = useState("")

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("0.1.1"))
  }, [])

  return (
    <div
      className="w-[200px] h-full flex flex-col shrink-0"
      style={{
        background: "var(--fm-bg-surface)",
        borderRight: "1px solid var(--fm-border-subtle)",
      }}
    >
      {/* Logo */}
      <div className="px-4 py-3 flex items-center gap-2.5" style={{ borderBottom: "1px solid var(--fm-border-subtle)" }}>
        <img src={logoImg} alt="freemodel" className="h-8 w-8 rounded-md flex-shrink-0" />
        <div className="leading-tight min-w-0">
          <div className="font-semibold truncate" style={{ fontSize: "var(--fm-text-md)", color: "var(--fm-text-1)" }}>
            freemodel
          </div>
          <div className="fm-text-tech truncate" style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-4)" }}>
            auto-router
          </div>
        </div>
      </div>

      {/* Menu items */}
      <nav className="flex flex-col gap-0.5 px-2 pt-2" aria-label="主导航">
        {menuItems.map((item) => {
          const isActive = currentPage === item.id
          return (
            <button
              key={item.id}
              onClick={() => onPageChange(item.id)}
              className={cn("flex items-center gap-2 px-3 py-2 text-left w-full transition-colors relative focus-visible:outline-none")}
              style={{
                fontSize: "var(--fm-text-sm)",
                fontWeight: isActive ? "var(--fm-weight-medium)" : "var(--fm-weight-regular)",
                color: isActive ? "var(--fm-primary-text)" : "var(--fm-text-3)",
                background: isActive ? "var(--fm-primary-ghost)" : "transparent",
                borderRadius: "var(--fm-r-sm)",
              }}
              aria-current={isActive ? "page" : undefined}
            >
              {isActive && (
                <span
                  className="absolute left-0 top-1 bottom-1 w-0.5 rounded-r"
                  style={{ background: "var(--fm-primary)" }}
                  aria-hidden="true"
                />
              )}
              <span style={{ color: isActive ? "var(--fm-primary-text)" : "var(--fm-text-3)" }}>
                {item.icon}
              </span>
              <span className="fm-text-zh">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <footer className="mt-auto px-3 pb-3">
        <div style={{ borderTop: "1px solid var(--fm-border-subtle)", paddingTop: "12px" }}>
          <div className="flex items-center justify-center gap-1 mb-2">
            {footerLinks.map((link) => (
              <button
                key={link.url}
                type="button"
                title={link.label}
                onClick={async () => { await openUrl(link.url) }}
                className="flex flex-col items-center gap-1 px-2 py-1.5 rounded transition-colors hover:bg-[var(--fm-bg-hover)]"
                style={{ color: "var(--fm-text-4)", borderRadius: "var(--fm-r-sm)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-text-2)" }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)" }}
              >
                {link.icon}
                <span style={{ fontSize: "9px", lineHeight: 1 }}>{link.label}</span>
              </button>
            ))}
          </div>
          <div className="text-center fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>
            v{version}
          </div>
        </div>
      </footer>
    </div>
  )
}
