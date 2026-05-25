import { Fragment, useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
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
  if (!isFinal) {
    return (
      <span
        className="fm-text-tech inline-block animate-pulse"
        style={{
          fontSize: "10px",
          padding: "2px 5px",
          borderRadius: "var(--fm-r-sm)",
          background: "rgba(59,130,246,0.15)",
          color: "rgb(96,165,250)",
          border: "1px solid rgba(59,130,246,0.3)",
        }}
      >
        进行中
      </span>
    )
  }
  if (status === undefined || status === null) return <span style={{ color: "var(--fm-text-4)" }}>-</span>

  const isOk = status >= 200 && status < 300
  const isError = status >= 400
  const isWarn = status >= 300 && status < 400

  return (
    <span
      className="fm-text-tech inline-block"
      style={{
        fontSize: "10px",
        padding: "2px 5px",
        borderRadius: "var(--fm-r-sm)",
        background: isOk ? "var(--fm-success-subtle)" : isError ? "var(--fm-error-subtle)" : isWarn ? "var(--fm-warning-subtle)" : "var(--fm-bg-hover)",
        color: isOk ? "var(--fm-success-text)" : isError ? "var(--fm-error-text)" : isWarn ? "var(--fm-warning-text)" : "var(--fm-text-3)",
        border: `1px solid ${isOk ? "var(--fm-success-border)" : isError ? "var(--fm-error-border)" : "var(--fm-border-default)"}`,
      }}
    >
      {status}
    </span>
  )
}

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
      {reqEntries.length > 0 && (
        <div>
          <div className="fm-text-tech mb-1" style={{ fontSize: "10px", color: "var(--fm-text-4)", textTransform: "uppercase" }}>请求头</div>
          <div className="fm-text-tech rounded p-2 max-h-[120px] overflow-auto" style={{ fontSize: "11px", background: "var(--fm-bg-active)", color: "var(--fm-text-2)" }}>
            {reqEntries.map(([key, value]) => (
              <div key={key} className="flex gap-2 py-0.5">
                <span style={{ color: "var(--fm-text-4)", flexShrink: 0 }}>{key}:</span>
                <span className="break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {respEntries.length > 0 && (
        <div>
          <div className="fm-text-tech mb-1" style={{ fontSize: "10px", color: "var(--fm-text-4)", textTransform: "uppercase" }}>响应头</div>
          <div className="fm-text-tech rounded p-2 max-h-[120px] overflow-auto" style={{ fontSize: "11px", background: "var(--fm-primary-subtle)", color: "var(--fm-text-2)" }}>
            {respEntries.map(([key, value]) => (
              <div key={key} className="flex gap-2 py-0.5">
                <span style={{ color: "var(--fm-primary-text)", flexShrink: 0 }}>{key}:</span>
                <span className="break-all">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {reqEntries.length === 0 && respEntries.length === 0 && (
        <span style={{ color: "var(--fm-text-4)" }}>无请求/响应头</span>
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
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortedLogs = [...logs].reverse()

  return (
    <div className="flex-1 overflow-hidden flex flex-col" style={{ background: "var(--fm-bg-canvas)" }}>
      <div
        className="px-4 py-3 shrink-0 flex items-center"
        style={{ borderBottom: "1px solid var(--fm-border-subtle)", background: "var(--fm-bg-surface)" }}
      >
        <h1 className="fm-text-zh" style={{ fontWeight: "var(--fm-weight-semibold)", color: "var(--fm-text-1)" }}>代理日志</h1>
      </div>

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow style={{ background: "var(--fm-bg-surface)", borderBottom: "1px solid var(--fm-border-subtle)" }}>
              <TableHead className="w-[82px] fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)", fontWeight: "var(--fm-weight-medium)" }}>时间</TableHead>
              <TableHead className="w-[58px] fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>状态</TableHead>
              <TableHead className="w-[120px] fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>厂商</TableHead>
              <TableHead className="w-[240px] fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>模型</TableHead>
              <TableHead className="w-[65px] text-right fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>输入</TableHead>
              <TableHead className="w-[65px] text-right fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>输出</TableHead>
              <TableHead className="w-[75px] text-right fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>耗时</TableHead>
              <TableHead className="fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>消息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedLogs.map((log) => {
              const isExpanded = expandedIds.has(log.id)
              const hasRequestHeaders = log.request_headers && Object.keys(log.request_headers).length > 0
              const hasResponseHeaders = log.response_headers && Object.keys(log.response_headers).length > 0
              const hasAnyHeaders = hasRequestHeaders || hasResponseHeaders
              const isError = log.level === "error"
              const isWarn = log.level === "warn"
              return (
                <Fragment key={log.id}>
                  <TableRow
                    className={hasAnyHeaders ? "cursor-pointer" : ""}
                    onClick={hasAnyHeaders ? () => toggleExpand(log.id) : undefined}
                    style={{
                      height: "28px",
                      background: isExpanded ? "var(--fm-bg-elevated)" : isError ? "var(--fm-error-subtle)" : isWarn ? "var(--fm-warning-subtle)" : "transparent",
                      borderBottom: "1px solid var(--fm-border-subtle)",
                    }}
                    onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.background = "var(--fm-bg-hover)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isExpanded ? "var(--fm-bg-elevated)" : isError ? "var(--fm-error-subtle)" : isWarn ? "var(--fm-warning-subtle)" : "transparent" }}
                  >
                    <TableCell className="fm-text-tech py-0" style={{ fontSize: "11px", color: "var(--fm-text-4)" }}>
                      {formatTime(log.timestamp_ms)}
                    </TableCell>
                    <TableCell className="py-0">
                      <StatusBadge status={log.status} isFinal={log.is_final} />
                    </TableCell>
                    <TableCell className="fm-text-zh py-0 truncate max-w-[120px]" style={{ fontSize: "var(--fm-text-sm)", color: "var(--fm-text-2)" }}>
                      {log.provider ?? <span style={{ color: "var(--fm-text-4)" }}>-</span>}
                    </TableCell>
                    <TableCell className="fm-text-tech py-0 truncate max-w-[240px]" style={{ fontSize: "11px", color: "var(--fm-text-3)" }}>
                      {log.model ?? <span style={{ color: "var(--fm-text-4)" }}>-</span>}
                    </TableCell>
                    <TableCell className="fm-text-tech py-0 text-right" style={{ fontSize: "11px", color: "var(--fm-text-3)" }}>
                      {!log.is_final ? <span style={{ color: "rgb(96,165,246)" }} className="animate-pulse">...</span> : formatTokens(log.input_tokens)}
                    </TableCell>
                    <TableCell className="fm-text-tech py-0 text-right" style={{ fontSize: "11px", color: "var(--fm-text-3)" }}>
                      {!log.is_final ? <span style={{ color: "rgb(96,165,246)" }} className="animate-pulse">...</span> : formatTokens(log.output_tokens)}
                    </TableCell>
                    <TableCell className="fm-text-tech py-0 text-right" style={{ fontSize: "11px", color: "var(--fm-text-3)" }}>
                      {!log.is_final ? <span style={{ color: "rgb(96,165,246)" }} className="animate-pulse">...</span> : formatDuration(log.duration_ms)}
                    </TableCell>
                    <TableCell className="fm-text-zh py-0 max-w-[300px] truncate" style={{ fontSize: "var(--fm-text-sm)", color: "var(--fm-text-4)" }}>
                      {log.message}
                      {hasAnyHeaders && (
                        <span style={{ color: "var(--fm-primary-text)", marginLeft: "4px" }}>{isExpanded ? "▼" : "▶"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                  {isExpanded && (hasRequestHeaders || hasResponseHeaders) && (
                    <TableRow key={`${log.id}-detail`} style={{ background: "var(--fm-bg-elevated)" }}>
                      <TableCell colSpan={8} className="p-2">
                        <HeadersDetail requestHeaders={log.request_headers} responseHeaders={log.response_headers} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
            {sortedLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 fm-text-zh" style={{ color: "var(--fm-text-4)" }}>
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
