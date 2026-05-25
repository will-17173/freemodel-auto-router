import React from "react"
import { X } from "lucide-react"

type ToastType = "success" | "error" | "info" | "warn"

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  showToast: (type: ToastType, message: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within ToastProvider")
  return ctx
}

const TOAST_BAR_COLOR: Record<ToastType, string> = {
  success: "var(--fm-success)",
  error: "var(--fm-error)",
  warn: "var(--fm-warning)",
  info: "var(--fm-primary)",
}

const TOAST_TEXT_COLOR: Record<ToastType, string> = {
  success: "var(--fm-success-text)",
  error: "var(--fm-error-text)",
  warn: "var(--fm-warning-text)",
  info: "var(--fm-primary-text)",
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([])

  const showToast = (type: ToastType, message: string) => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
        aria-live="polite"
        aria-label="通知"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="flex items-center gap-2 animate-in slide-in-from-right-5 fade-in overflow-hidden"
            style={{
              background: "var(--fm-bg-elevated)",
              border: "1px solid var(--fm-border-default)",
              borderRadius: "var(--fm-r-md)",
              maxWidth: "360px",
              minWidth: "200px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
              borderLeft: `2px solid ${TOAST_BAR_COLOR[toast.type]}`,
            }}
            role="alert"
          >
            <div className="flex items-center gap-2 px-3 py-2.5 flex-1 min-w-0">
              <span
                className="fm-text-zh flex-1 min-w-0"
                style={{
                  fontSize: "var(--fm-text-sm)",
                  color: TOAST_TEXT_COLOR[toast.type],
                  wordBreak: "break-word",
                }}
              >
                {toast.message}
              </span>
              <button
                onClick={() => removeToast(toast.id)}
                className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded transition-colors"
                style={{ color: "var(--fm-text-4)", background: "transparent", border: "none", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-text-1)"; e.currentTarget.style.background = "var(--fm-bg-hover)" }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)"; e.currentTarget.style.background = "transparent" }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
