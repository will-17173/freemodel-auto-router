import React from "react"
import { Plus, Trash2, Zap, Loader2, Check, X, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { QueueTabs } from "./QueueTabs"
import { QueueEditPanel } from "./QueueEditPanel"
import { testProviderConnection, type TestConnectionResult } from "@/api"
import { useToast } from "@/components/ui/toast"
import type { Provider, DraftItem, Queue, QueueStateInfo } from "@/types"

// 测试状态类型
type TestStatus = "idle" | "testing" | "success" | "error"

// 内置供应商 ID，这些不可删除
const BUILTIN_PROVIDER_IDS = ["openrouter", "longcat"]

// 判断供应商是否可删除
function canDeleteProvider(provider: Provider): boolean {
  if (provider.is_custom) return true
  return !BUILTIN_PROVIDER_IDS.includes(provider.id)
}

// 判断模型是否可删除（自定义供应商的模型都可删除，或者有 is_custom 标记的）
function canDeleteModel(provider: Provider, model: { id: string; is_custom?: boolean }): boolean {
  if (model.is_custom) return true
  if (canDeleteProvider(provider)) return true  // 自定义供应商的所有模型都可删除
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
  const { showToast } = useToast()

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
        {/* 供应商卡片网格 */}
        <div className={cn(
          "flex-1 p-6 overflow-auto bg-background transition-[margin-right] duration-300 ease-out",
          editPanelMode && "mr-[280px]"
        )}>
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-lg font-semibold">供应商</h1>
            <button
              onClick={onAddProvider}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              添加供应商
            </button>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-2 gap-4">
            {providers.map((provider) => (
              <div
                key={provider.id}
                className={cn(
                  "bg-card rounded-xl border p-5 transition-all shadow-[0_1px_2px_rgba(16,24,20,0.04),0_12px_28px_rgba(16,24,20,0.06)]",
                  authMap[provider.id]
                    ? "border-primary/25 hover:border-primary/45 hover:shadow-[0_1px_2px_rgba(16,24,20,0.04),0_18px_36px_rgba(16,24,20,0.09)]"
                    : "border-border hover:border-primary/35 hover:shadow-[0_1px_2px_rgba(16,24,20,0.04),0_18px_36px_rgba(16,24,20,0.09)]"
                )}
              >
                {/* Card header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {authMap[provider.id] && (
                      <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    )}
                    <span className="font-semibold text-sm text-foreground">{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 添加模型按钮 */}
                    <button
                      className="text-xs px-2 py-1 rounded-full border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                      onClick={() => onAddModel(provider.id)}
                      title="添加模型"
                    >
                      + 模型
                    </button>
                    {/* 测试连接按钮 */}
                    <button
                      onClick={() => handleTest(provider.id)}
                      disabled={!authMap[provider.id] || testStates[provider.id]?.status === "testing"}
                      title={!authMap[provider.id] ? "请先配置 API Key" : "测试连接"}
                      className={cn(
                        "flex items-center justify-center w-7 h-7 rounded-full border transition-colors",
                        testStates[provider.id]?.status === "success"
                          ? "border-[color:var(--fm-success)] bg-[var(--fm-success-subtle)] text-[color:var(--fm-success-text)]"
                          : testStates[provider.id]?.status === "error"
                            ? "border-destructive/50 bg-destructive/10 text-destructive"
                            : "border-border bg-muted/50 text-muted-foreground hover:border-primary hover:text-primary",
                        !authMap[provider.id] && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      {testStates[provider.id]?.status === "testing" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : testStates[provider.id]?.status === "success" ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : testStates[provider.id]?.status === "error" ? (
                        <X className="h-3.5 w-3.5" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {/* 延迟显示 */}
                    {testStates[provider.id]?.result?.latency_ms && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {testStates[provider.id]?.result?.latency_ms}ms
                      </span>
                    )}
                    {canDeleteProvider(provider) && (
                      <button
                        className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          console.log("onDeleteProvider clicked:", provider.id);
                          onDeleteProvider(provider.id);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        authMap[provider.id]
                          ? "border-primary/40 text-primary bg-primary/10 hover:border-primary hover:bg-primary/20"
                          : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                      )}
                      onClick={() => onConfigKey(provider.id)}
                    >
                      {authMap[provider.id] ? "✓ Key" : "配置 Key"}
                    </button>
                  </div>
                </div>
                {/* Models */}
                {(() => {
                  const isExpanded = expandedProviders[provider.id]
                  const models = provider.models.filter((model) => (model.name.trim() || model.id.trim()).length > 0)
                  const needsCollapse = models.length > MAX_VISIBLE_MODELS
                  const visibleModels = isExpanded ? models : models.slice(0, MAX_VISIBLE_MODELS)

                  return (
                    <div className="relative">
                      <div className={cn(
                        "flex flex-wrap gap-1.5 transition-all duration-200",
                        !isExpanded && needsCollapse && "max-h-[60px] overflow-hidden"
                      )}>
                        {visibleModels.map((model) => {
                          const deletable = canDeleteModel(provider, model)
                          const displayName = splitModelDisplayName(model.name)

                          return (
                          <div key={model.id} className="flex items-center gap-1">
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
                          className="mt-2 text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              收起
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
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
    </div>
  )
}
