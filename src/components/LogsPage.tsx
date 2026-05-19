import { Fragment, useEffect, useState } from "react"
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

function StatusBadge({ status, isFinal }: { status: number | undefined; isFinal: boolean }) {
  // 请求进行中
  if (!isFinal) {
    return (
      <Badge className="text-[10px] px-1.5 py-0 bg-blue-500 hover:bg-blue-500 text-white animate-pulse">
        进行中
      </Badge>
    )
  }
  // 请求完成
  if (status === undefined || status === null) return <span className="text-muted-foreground text-xs">-</span>
  if (status >= 200 && status < 300) {
    return <Badge className="text-[10px] px-1.5 py-0 bg-[var(--fm-success)] hover:bg-[var(--fm-success)] text-white">{status}</Badge>
  }
  if (status >= 400) {
    return <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{status}</Badge>
  }
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>
}

// 请求头/响应头详情展开组件
function HeadersDetail({
  requestHeaders,
  responseHeaders,
}: {
  requestHeaders?: Record<string, string>
  responseHeaders?: Record<string, string>
}) {
  const reqEntries = requestHeaders ? Object.entries(requestHeaders) : []
  const respEntries = responseHeaders ? Object.entries(responseHeaders) : []

  return (
    <div className="space-y-2">
      {/* 请求头 */}
      {reqEntries.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1 font-medium">请求头:</div>
          <div className="bg-muted/50 rounded p-2 text-xs font-mono max-h-[150px] overflow-auto">
            {reqEntries.map(([key, value]) => (
              <div key={key} className="flex gap-2 py-0.5">
                <span className="text-muted-foreground shrink-0">{key}:</span>
                <span className="break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 响应头 */}
      {respEntries.length > 0 && (
        <div>
          <div className="text-xs text-muted-foreground mb-1 font-medium">响应头:</div>
          <div className="bg-blue-500/10 rounded p-2 text-xs font-mono max-h-[150px] overflow-auto">
            {respEntries.map(([key, value]) => (
              <div key={key} className="flex gap-2 py-0.5">
                <span className="text-blue-600 shrink-0">{key}:</span>
                <span className="break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {reqEntries.length === 0 && respEntries.length === 0 && (
        <span className="text-muted-foreground">无请求/响应头</span>
      )}
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
              const hasRequestHeaders = log.request_headers && Object.keys(log.request_headers).length > 0
              const hasResponseHeaders = log.response_headers && Object.keys(log.response_headers).length > 0
              const hasAnyHeaders = hasRequestHeaders || hasResponseHeaders
              return (
                <Fragment key={log.id}>
                  <TableRow
                    className={`${log.level === "error" ? "bg-destructive/5" : log.level === "warn" ? "bg-[var(--fm-warning-subtle)]" : ""} ${hasAnyHeaders ? "cursor-pointer hover:bg-muted/50" : ""}`}
                    onClick={hasAnyHeaders ? () => toggleExpand(log.id) : undefined}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatTime(log.timestamp_ms)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} isFinal={log.is_final} />
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[130px]">
                      {log.provider ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-xs truncate max-w-[260px]">
                      {log.model ?? <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">
                      {!log.is_final ? (
                        <span className="text-blue-500 animate-pulse">...</span>
                      ) : (
                        formatTokens(log.input_tokens)
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">
                      {!log.is_final ? (
                        <span className="text-blue-500 animate-pulse">...</span>
                      ) : (
                        formatTokens(log.output_tokens)
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-right">
                      {!log.is_final ? (
                        <span className="text-blue-500 animate-pulse">...</span>
                      ) : (
                        formatDuration(log.duration_ms)
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate flex items-center gap-1">
                      {log.message}
                      {hasAnyHeaders && (
                        <span className="text-xs text-primary shrink-0">
                          {isExpanded ? " ▼" : " ▶"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (hasRequestHeaders || hasResponseHeaders) && (
                    <TableRow key={`${log.id}-detail`} className="bg-muted/30">
                      <TableCell colSpan={8} className="p-2">
                        <HeadersDetail
                          requestHeaders={log.request_headers}
                          responseHeaders={log.response_headers}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
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
