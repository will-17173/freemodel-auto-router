import { useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ProxyLogEntry } from "@/types"
import { getProxyLogs } from "@/api"

interface LogsPageProps {
  port: number
}

function formatTime(ms: number) {
  const date = new Date(ms)
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatDuration(ms: number | undefined) {
  if (ms === undefined || ms === null) return "-"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatTokens(n: number | undefined) {
  if (n === undefined || n === null) return "-"
  return n.toLocaleString()
}

function StatusBadge({ status }: { status: number | undefined }) {
  if (status === undefined || status === null) return <span className="text-muted-foreground text-xs">-</span>
  if (status >= 200 && status < 300) {
    return <Badge className="text-[10px] px-1.5 py-0 bg-[var(--fm-success)] hover:bg-[var(--fm-success)] text-white">{status}</Badge>
  }
  if (status >= 400) {
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{status}</Badge>
  }
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>
}

// 请求头详情展开组件
function HeadersDetail({ headers }: { headers: Record<string, string> }) {
  const entries = Object.entries(headers)
  if (entries.length === 0) return <span className="text-muted-foreground">无请求头</span>

  return (
    <div className="bg-muted/50 rounded p-2 text-xs font-mono max-h-[200px] overflow-auto">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 py-0.5">
          <span className="text-muted-foreground shrink-0">{key}:</span>
          <span className="break-all">{value}</span>
        </div>
      ))}
    </div>
  )
}

export function LogsPage({ port: _port }: LogsPageProps) {
  const [logs, setLogs] = useState<ProxyLogEntry[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())

  useEffect(() => {
    getProxyLogs().then(setLogs).catch(console.error)
    const interval = setInterval(() => {
      getProxyLogs().then(setLogs).catch(console.error)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Show newest logs first
  const sortedLogs = [...logs].reverse()

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-lg font-semibold">代理日志</h1>
      </div>

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">时间</TableHead>
              <TableHead className="w-[60px]">状态</TableHead>
              <TableHead className="w-[130px]">厂商</TableHead>
              <TableHead className="w-[260px]">模型</TableHead>
              <TableHead className="w-[70px] text-right">输入</TableHead>
              <TableHead className="w-[70px] text-right">输出</TableHead>
              <TableHead className="w-[80px] text-right">耗时</TableHead>
              <TableHead>消息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedLogs.map((log) => {
              const isExpanded = expandedIds.has(log.id)
              const hasHeaders = log.request_headers && Object.keys(log.request_headers).length > 0
              return (
                <>
                  <TableRow
                    key={log.id}
                    className={`${log.level === "error" ? "bg-destructive/5" : log.level === "warn" ? "bg-[var(--fm-warning-subtle)]" : ""} ${hasHeaders ? "cursor-pointer hover:bg-muted/50" : ""}`}
                    onClick={hasHeaders ? () => toggleExpand(log.id) : undefined}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatTime(log.timestamp_ms)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[130px]">
                      {log.provider ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-xs truncate max-w-[260px]">
                      {log.model ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">
                      {formatTokens(log.input_tokens)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">
                      {formatTokens(log.output_tokens)}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">
                      {formatDuration(log.duration_ms)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate flex items-center gap-1">
                      {log.message}
                      {hasHeaders && (
                        <span className="text-xs text-primary shrink-0">
                          {isExpanded ? " ▼" : " ▶"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && log.request_headers && (
                    <TableRow key={`${log.id}-detail`} className="bg-muted/30">
                      <TableCell colSpan={8} className="p-2">
                        <div className="text-xs text-muted-foreground mb-1">请求头详情:</div>
                        <HeadersDetail headers={log.request_headers} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )
            })}
            {sortedLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                  暂无日志记录
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </ScrollArea>
    </div>
  )
}
