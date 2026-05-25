import { cn } from "@/lib/utils"
import type { RouteState } from "@/lib/useRouteVisualization"

interface RouteVisualizerProps {
  routeState: RouteState
  className?: string
}

export function RouteVisualizer({ routeState, className }: RouteVisualizerProps) {
  const { port, activeNode, queuedNodes, flashingRed, jumpedNodeId } = routeState

  // Limit queued nodes shown
  const visibleQueued = queuedNodes.slice(0, 3)
  const extraCount = Math.max(0, queuedNodes.length - 3)

  return (
    <nav
      className={cn("flex-1 min-w-0 overflow-hidden", className)}
      aria-label="当前路由路径"
    >
      {/* Active route row: port → active provider */}
      <div className="flex items-center gap-0 h-5">
        {/* Port node */}
        <div
          className="fm-route-node fm-route-node-port"
          aria-label={`代理端口 ${port}`}
        >
          <span className="fm-text-tech">:{port}</span>
        </div>

        {/* Active connection line with flow animation */}
        <div className="fm-route-line-active" aria-hidden="true" />

        {/* Active provider node */}
        {activeNode ? (
          <div
            className={cn(
              "fm-route-node fm-route-node-active",
              flashingRed && "flash-red",
              jumpedNodeId === activeNode.providerId && "fm-route-node-jumped"
            )}
            aria-label={`路由到 ${activeNode.providerName}，状态：活跃`}
            aria-live="polite"
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: "var(--fm-primary)" }}
              aria-hidden="true"
            />
            <span className="fm-text-tech truncate max-w-[120px]">{activeNode.providerName}</span>
          </div>
        ) : (
          <div className="fm-route-node" style={{ color: "var(--fm-text-4)" }}>
            <span className="fm-text-tech">空队列</span>
          </div>
        )}
      </div>

      {/* Queued nodes row */}
      {(visibleQueued.length > 0 || extraCount > 0) && (
        <div className="flex items-center gap-1 mt-1 pl-1" aria-label="待命队列">
          {visibleQueued.map((node, i) => (
            <div key={`${node.providerId}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <div className="fm-route-line-dashed" aria-hidden="true" />
              )}
              <div
                className={cn(
                  "fm-route-node",
                  node.isExhausted && "opacity-40 line-through"
                )}
                aria-label={`队列位置 ${i + 2}：${node.providerName}`}
              >
                <span className="fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>
                  {node.providerName}
                </span>
              </div>
            </div>
          ))}
          {extraCount > 0 && (
            <span
              className="fm-text-tech"
              style={{ fontSize: "10px", color: "var(--fm-text-4)" }}
            >
              +{extraCount}
            </span>
          )}
        </div>
      )}
    </nav>
  )
}
