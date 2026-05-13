import { useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import type { ProxyLogEntry } from "@/types"
import { getProxyLogs } from "@/api"

interface LogsPageProps {
  port: number
}

function formatTime(ms: number) {
  const date = new Date(ms)
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

export function LogsPage({ port: _port }: LogsPageProps) {
  const [logs, setLogs] = useState<ProxyLogEntry[]>([])

  useEffect(() => {
    getProxyLogs().then(setLogs).catch(console.error)
    const interval = setInterval(() => {
      getProxyLogs().then(setLogs).catch(console.error)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex-1 p-6 overflow-hidden flex flex-col">
      <h1 className="text-lg font-semibold mb-4">代理日志</h1>

      <ScrollArea className="flex-1">
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/50 text-sm"
            >
              <span className="text-muted-foreground font-mono text-xs shrink-0">
                {formatTime(log.timestamp_ms)}
              </span>
              <Badge
                variant={log.level === "error" ? "destructive" : log.level === "warn" ? "outline" : "secondary"}
                className="text-[10px] px-1.5 py-0 shrink-0"
              >
                {log.level}
              </Badge>
              <span className="text-foreground truncate">{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              暂无日志记录
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
