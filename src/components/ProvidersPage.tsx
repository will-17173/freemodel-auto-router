import React from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { Plus, Trash2, Zap, Loader2, Check, X, ChevronDown, ChevronUp, Info, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { QueueTabs } from "./QueueTabs"
import { QueueEditPanel } from "./QueueEditPanel"
import { ProviderInfoModal } from "./ProviderInfoModal"
import { testProviderConnection, type TestConnectionResult } from "@/api"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useToast } from "@/components/ui/toast"
import type { Provider, DraftItem, Queue, QueueStateInfo } from "@/types"

// 测试状态类型
type TestStatus = "idle" | "testing" | "success" | "error"

// 判断服务商是否可删除
function canDeleteProvider(provider: Provider): boolean {
  return provider.is_custom === true
}

// 判断模型是否可删除（自定义服务商的模型都可删除，或者有 is_custom 标记的）
function canDeleteModel(provider: Provider, model: { id: string; is_custom?: boolean }): boolean {
  if (model.is_custom) return true
  if (canDeleteProvider(provider)) return true  // 自定义服务商的所有模型都可删除
  return false
}

function splitModelDisplayName(name: string): { vendor: string | null; modelName: string } {
  const separatorIndex = name.indexOf(":") > 0 ? name.indexOf(":") : name.indexOf("/")
  if (separatorIndex <= 0) return { vendor: null, modelName: name.trim() }

  const vendor = name.slice(0, separatorIndex).trim()
  const modelName = name.slice(separatorIndex + 1).trim()
  return { vendor, modelName: modelName || name.trim() }
}

interface ProvidersPageProps {
  providers: Provider[]
  authMap: Record<string, boolean>
  onAddToQueue: (providerId: string, modelId: string) => void
  onConfigKey: (providerId: string) => void
  onAddModel: (providerId: string) => void
  onAddProvider: () => void
  onDeleteProvider: (providerId: string) => void
  onDeleteModel: (providerId: string, modelId: string) => void
  // 队列标签栏
  queues: Record<string, Queue>
  queueStates: Record<string, QueueStateInfo>
  defaultQueueId: string
  selectedQueueId: string | null
  onSelectQueue: (queueId: string) => void
  onSetDefaultQueue: (queueId: string) => void
  onDeleteQueue: (queueId: string) => void
  onNewQueue: () => void
  // 编辑面板
  editPanelMode: "new" | "edit" | null
  editPanelName: string
  editPanelItems: DraftItem[]
  onEditPanelNameChange: (name: string) => void
  onRemoveEditPanelItem: (index: number) => void
  onReorderEditPanelItems: (items: DraftItem[]) => void
  onClearEditPanelItems: () => void
  onCloseEditPanel: () => void
  onCancelEditPanel: () => void
  onSaveEditPanel: () => void
  onTrackEvent?: (eventName: string, params?: Record<string, string | number | boolean | null | undefined>) => void
}

export function ProvidersPage({
  providers,
  authMap,
  onAddToQueue,
  onConfigKey,
  onAddModel,
  onAddProvider,
  onDeleteProvider,
  onDeleteModel,
  // 队列标签栏
  queues,
  queueStates,
  defaultQueueId,
  selectedQueueId,
  onSelectQueue,
  onSetDefaultQueue,
  onDeleteQueue,
  onNewQueue,
  // 编辑面板
  editPanelMode,
  editPanelName,
  editPanelItems,
  onEditPanelNameChange,
  onRemoveEditPanelItem,
  onReorderEditPanelItems,
  onClearEditPanelItems,
  onCloseEditPanel,
  onCancelEditPanel,
  onSaveEditPanel,
  onTrackEvent,
}: ProvidersPageProps) {
  // 测试连接状态管理
  const [testStates, setTestStates] = React.useState<Record<string, { status: TestStatus; result: TestConnectionResult | null }>>({})
  // 模型列表展开状态管理
  const [expandedProviders, setExpandedProviders] = React.useState<Record<string, boolean>>({})
  // info 弹窗显示状态
  const [showInfoModal, setShowInfoModal] = React.useState(false)
  const { showToast } = useToast()

  async function openProviderLink(link: string) {
    try {
      await openUrl(link)
    } catch {
      showToast("error", "无法打开服务商网站")
    }
  }

  const toggleExpand = (providerId: string) => {
    setExpandedProviders(prev => ({
      ...prev,
      [providerId]: !prev[providerId]
    }))
  }

  // 计算模型列表是否需要折叠（超过3行时折叠）
  const MODELS_PER_ROW = 4  // 每行大约4个模型
  const MAX_VISIBLE_ROWS = 2  // 折叠时最多显示2行
  const MAX_VISIBLE_MODELS = MODELS_PER_ROW * MAX_VISIBLE_ROWS

  const handleTest = async (providerId: string) => {
    if (!authMap[providerId]) return
    setTestStates(prev => ({
      ...prev,
      [providerId]: { status: "testing", result: null }
    }))
    try {
      const result = await testProviderConnection(providerId)
      setTestStates(prev => ({
        ...prev,
        [providerId]: { status: result.success ? "success" : "error", result }
      }))
      if (!result.success) {
        showToast("error", result.message)
      }
      onTrackEvent?.("provider_connection_tested", {
        success: result.success,
        has_latency: result.latency_ms !== null,
      })
    } catch (e) {
      const errorMessage = String(e)
      setTestStates(prev => ({
        ...prev,
        [providerId]: { status: "error", result: { success: false, message: errorMessage, latency_ms: null } }
      }))
      showToast("error", errorMessage)
      onTrackEvent?.("provider_connection_tested", {
        success: false,
        has_latency: false,
      })
    }
  }

  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col overflow-hidden">
      {/* 队列标签栏 */}
      <QueueTabs
        queues={queues}
        queueStates={queueStates}
        defaultQueueId={defaultQueueId}
        selectedQueueId={selectedQueueId}
        onSelectQueue={onSelectQueue}
        onSetDefaultQueue={onSetDefaultQueue}
        onDeleteQueue={onDeleteQueue}
        onNewQueue={onNewQueue}
      />

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 服务商卡片网格 */}
        <div className={cn(
          "flex-1 p-4 overflow-auto transition-[margin-right] duration-200 ease-out",
          editPanelMode && "mr-[260px]"
        )}
        style={{ background: "var(--fm-bg-canvas)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h1 className="fm-text-zh" style={{ fontSize: "var(--fm-text-md)", fontWeight: "var(--fm-weight-semibold)", color: "var(--fm-text-1)" }}>服务商</h1>
              <button
                onClick={() => setShowInfoModal(true)}
                className="inline-flex h-6 w-6 items-center justify-center rounded transition-colors"
                style={{ color: "var(--fm-text-4)", background: "transparent", border: "none", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-primary-text)" }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)" }}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              onClick={onAddProvider}
              className="fm-btn-primary flex items-center gap-1.5"
            >
              <Plus className="h-3 w-3" />
              <span className="fm-text-zh">添加服务商</span>
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 gap-3">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className={cn(
                  "fm-provider-card",
                  authMap[provider.id] && "is-active"
                )}
              >
                {/* Card header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {authMap[provider.id] && (
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "var(--fm-primary)" }} />
                    )}
                    <span className="fm-text-zh font-medium truncate" style={{ fontSize: "var(--fm-text-sm)", color: "var(--fm-text-1)", fontWeight: "var(--fm-weight-medium)" }}>{provider.name}</span>
                    {provider.link && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="inline-flex h-5 w-5 items-center justify-center rounded flex-shrink-0 transition-colors"
                            onClick={() => openProviderLink(provider.link!)}
                            style={{ color: "var(--fm-text-4)", background: "transparent", border: "none", cursor: "pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-primary-text)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)" }}
                          >
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>打开服务商网站</TooltipContent>
                      </Tooltip>
                    )}
                    {/* 添加模型按钮 */}
                    <button
                      className="fm-text-tech flex-shrink-0 transition-colors"
                      onClick={() => onAddModel(provider.id)}
                      style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "var(--fm-r-pill)", border: "1px dashed var(--fm-border-default)", color: "var(--fm-text-4)", background: "transparent", cursor: "pointer" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--fm-primary-border)"; e.currentTarget.style.color = "var(--fm-primary-text)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--fm-border-default)"; e.currentTarget.style.color = "var(--fm-text-4)" }}
                    >
                      + 模型
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* 测试连接按钮 */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => handleTest(provider.id)}
                          disabled={!authMap[provider.id] || testStates[provider.id]?.status === "testing"}
                          className={cn(
                            "flex items-center justify-center w-6 h-6 rounded transition-colors",
                            testStates[provider.id]?.status === "success"
                              ? "is-success"
                              : testStates[provider.id]?.status === "error"
                                ? "is-error"
                                : ""
                          )}
                          style={{
                            border: `1px solid ${testStates[provider.id]?.status === "success" ? "var(--fm-success-border)" : testStates[provider.id]?.status === "error" ? "var(--fm-error-border)" : "var(--fm-border-default)"}`,
                            color: testStates[provider.id]?.status === "success" ? "var(--fm-success-text)" : testStates[provider.id]?.status === "error" ? "var(--fm-error-text)" : "var(--fm-text-4)",
                            background: testStates[provider.id]?.status === "success" ? "var(--fm-success-subtle)" : testStates[provider.id]?.status === "error" ? "var(--fm-error-subtle)" : "transparent",
                            opacity: !authMap[provider.id] ? 0.5 : 1,
                            cursor: !authMap[provider.id] ? "not-allowed" : "pointer",
                          }}
                        >
                          {testStates[provider.id]?.status === "testing" ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : testStates[provider.id]?.status === "success" ? (
                            <Check className="h-3 w-3" />
                          ) : testStates[provider.id]?.status === "error" ? (
                            <X className="h-3 w-3" />
                          ) : (
                            <Zap className="h-3 w-3" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {!authMap[provider.id] ? "请先配置 API Key" : "测试连接"}
                      </TooltipContent>
                    </Tooltip>
                    {/* 延迟显示 */}
                    {testStates[provider.id]?.result?.latency_ms && (
                      <span className="fm-text-tech" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>
                        {testStates[provider.id]?.result?.latency_ms}ms
                      </span>
                    )}
                    {canDeleteProvider(provider) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            className="flex items-center justify-center w-6 h-6 rounded transition-colors"
                            style={{ border: "1px solid var(--fm-border-default)", color: "var(--fm-text-4)", background: "transparent", cursor: "pointer" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProvider(provider.id);
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--fm-error-border)"; e.currentTarget.style.color = "var(--fm-error-text)"; e.currentTarget.style.background = "var(--fm-error-subtle)" }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--fm-border-default)"; e.currentTarget.style.color = "var(--fm-text-4)"; e.currentTarget.style.background = "transparent" }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>删除服务商</TooltipContent>
                      </Tooltip>
                    )}
                    <button
                      className={cn(
                        "fm-text-tech transition-colors",
                        authMap[provider.id] ? "is-keyed" : ""
                      )}
                      onClick={() => onConfigKey(provider.id)}
                      style={{
                        fontSize: "10px",
                        padding: "3px 8px",
                        borderRadius: "var(--fm-r-pill)",
                        border: `1px solid ${authMap[provider.id] ? "var(--fm-primary-border)" : "var(--fm-border-default)"}`,
                        color: authMap[provider.id] ? "var(--fm-primary-text)" : "var(--fm-text-4)",
                        background: authMap[provider.id] ? "var(--fm-primary-subtle)" : "transparent",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {authMap[provider.id] ? "✓ Key" : "配置 Key"}
                    </button>
                  </div>
                </div>
                {provider.description && (
                  <p className="fm-text-zh mb-2 -mt-1 leading-snug" style={{ fontSize: "10px", color: "var(--fm-text-4)" }}>{provider.description}</p>
                )}
                {/* Models */}
                {(() => {
                  const isExpanded = expandedProviders[provider.id]
                  const models = provider.models.filter((model) => (model.name.trim() || model.id.trim()).length > 0)
                  const needsCollapse = models.length > MAX_VISIBLE_MODELS
                  const visibleModels = isExpanded ? models : models.slice(0, MAX_VISIBLE_MODELS)

                  return (
                    <div className="relative">
                      <div className="flex flex-wrap gap-1">
                        {visibleModels.map((model) => {
                          const deletable = canDeleteModel(provider, model)
                          const displayName = splitModelDisplayName(model.name)

                          return (
                          <div key={model.id} className="flex items-center gap-0.5">
                            <button
                              disabled={!authMap[provider.id] || !editPanelMode}
                              onClick={() => authMap[provider.id] && editPanelMode && onAddToQueue(provider.id, model.id)}
                              className={cn(
                                "fm-model-pill",
                                authMap[provider.id]
                                  ? editPanelMode
                                    ? "is-ready"
                                    : "is-locked"
                                  : "is-disabled"
                              )}
                            >
                              {displayName.vendor && (
                                <span className="fm-model-pill-vendor">{displayName.vendor}</span>
                              )}
                              <span className="fm-model-pill-name">{displayName.modelName}</span>
                              {deletable && (
                                <span
                                  className="fm-model-pill-action"
                                  title="删除模型"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteModel(provider.id, model.id);
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </span>
                              )}
                            </button>
                          </div>
                          )
                        })}
                      </div>
                      {/* 展开/收起按钮 */}
                      {needsCollapse && (
                        <button
                          onClick={() => toggleExpand(provider.id)}
                          className="mt-1.5 fm-text-tech inline-flex items-center gap-1 transition-colors"
                          style={{ fontSize: "10px", color: "var(--fm-text-4)", background: "transparent", border: "none", cursor: "pointer" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-primary-text)" }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)" }}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3 w-3" />
                              收起
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3" />
                              展开 ({models.length - MAX_VISIBLE_MODELS} 更多)
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>

        {/* 编辑面板 */}
        <QueueEditPanel
          open={!!editPanelMode}
          mode={editPanelMode ?? "new"}
          queueId={selectedQueueId ?? undefined}
          queueName={editPanelName}
          items={editPanelItems}
          providers={providers}
          onQueueNameChange={onEditPanelNameChange}
          onRemoveItem={onRemoveEditPanelItem}
          onClearAll={onClearEditPanelItems}
          onReorder={onReorderEditPanelItems}
          onSave={onSaveEditPanel}
          onCancel={onCancelEditPanel}
          onClose={onCloseEditPanel}
        />
      </div>

      {/* 信息弹窗 */}
      <ProviderInfoModal
        open={showInfoModal}
        onClose={() => setShowInfoModal(false)}
      />
      </div>
    </TooltipProvider>
  )
}
