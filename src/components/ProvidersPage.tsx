import React from "react"
import { Plus, Trash2, Zap, Loader2, Check, X, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { DraftQueuePanel } from "./DraftQueuePanel"
import { testProviderConnection, type TestConnectionResult } from "@/api"
import { useToast } from "@/components/ui/toast"
import type { Provider, DraftItem } from "@/types"

// 测试状态类型
type TestStatus = "idle" | "testing" | "success" | "error"

// 判断供应商是否可删除（只有 is_custom 的供应商可删除）
function canDeleteProvider(provider: Provider): boolean {
  return !!provider.is_custom
}

// 判断模型是否可删除（自定义供应商的模型都可删除，或者有 is_custom 标记的）
function canDeleteModel(provider: Provider, model: { id: string; is_custom?: boolean }): boolean {
  if (model.is_custom) return true
  if (canDeleteProvider(provider)) return true  // 自定义供应商的所有模型都可删除
  return false
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
  showDraftPanel: boolean
  draftQueueName: string
  draftItems: DraftItem[]
  onDraftQueueNameChange: (name: string) => void
  onOpenDraftPanel: () => void
  onRemoveDraftItem: (index: number) => void
  onReorderDraftItems: (items: DraftItem[]) => void
  onClearDraftItems: () => void
  onCloseDraftPanel: () => void
  onCancelDraftPanel: () => void
  onSaveDraftQueue: () => void
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
  showDraftPanel,
  draftQueueName,
  draftItems,
  onDraftQueueNameChange,
  onOpenDraftPanel,
  onRemoveDraftItem,
  onReorderDraftItems,
  onClearDraftItems,
  onCloseDraftPanel,
  onCancelDraftPanel,
  onSaveDraftQueue,
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
    } catch (e) {
      const errorMessage = String(e)
      setTestStates(prev => ({
        ...prev,
        [providerId]: { status: "error", result: { success: false, message: errorMessage, latency_ms: null } }
      }))
      showToast("error", errorMessage)
    }
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main content */}
      <div className={cn(
        "flex-1 p-6 overflow-auto transition-[margin-right] duration-300 ease-out",
        showDraftPanel && "mr-[280px]"
      )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">供应商</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenDraftPanel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-border text-muted-foreground text-sm rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            新建队列
          </button>
          <button
            onClick={onAddProvider}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            添加供应商
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4">
        {providers.map((provider) => (
          <div
            key={provider.id}
            className={cn(
              "bg-card rounded-xl border p-5 transition-all",
              authMap[provider.id]
                ? "border-primary/30 shadow-sm hover:border-primary/50 hover:shadow-md"
                : "border-border shadow-sm hover:border-primary/40 hover:shadow-md"
            )}
          >
            {/* Card header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {authMap[provider.id] && (
                  <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
                <span className="font-semibold text-sm text-foreground">{provider.name}</span>
                {!provider.is_custom && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    预设
                  </span>
                )}
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
                      ? "border-green-500/50 bg-green-500/10 text-green-600"
                      : testStates[provider.id]?.status === "error"
                        ? "border-red-500/50 bg-red-500/10 text-red-500"
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
              const needsCollapse = provider.models.length > MAX_VISIBLE_MODELS
              const visibleModels = isExpanded ? provider.models : provider.models.slice(0, MAX_VISIBLE_MODELS)

              return (
                <div className="relative">
                  <div className={cn(
                    "flex flex-wrap gap-1.5 transition-all duration-200",
                    !isExpanded && needsCollapse && "max-h-[60px] overflow-hidden"
                  )}>
                    {visibleModels.map((model) => (
                      <div key={model.id} className="flex items-center gap-1">
                        <button
                          disabled={!authMap[provider.id] || !showDraftPanel}
                          onClick={() => authMap[provider.id] && showDraftPanel && onAddToQueue(provider.id, model.id)}
                          className={cn(
                            "text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1",
                            authMap[provider.id]
                              ? showDraftPanel
                                ? "border-[#22c55e]/40 bg-[#f0fce8] text-[#16a34a] hover:border-[#22c55e] hover:bg-[#dcfce7] cursor-pointer"
                                : "border-[#22c55e]/30 bg-[#f0fce8]/70 text-[#16a34a]/80 cursor-not-allowed"
                              : "border-border text-muted-foreground bg-muted/30 cursor-not-allowed opacity-60"
                          )}
                        >
                          <span>{model.name}</span>
                          {canDeleteModel(provider, model) && (
                            <Trash2
                              className="h-3 w-3 opacity-50 hover:opacity-100 hover:text-destructive transition-opacity cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteModel(provider.id, model.id);
                              }}
                            />
                          )}
                        </button>
                      </div>
                    ))}
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
                          展开 ({provider.models.length - MAX_VISIBLE_MODELS} 更多)
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

      {/* Draft panel */}
      <DraftQueuePanel
        open={showDraftPanel}
        queueName={draftQueueName}
        items={draftItems}
        providers={providers}
        onQueueNameChange={onDraftQueueNameChange}
        onRemoveItem={onRemoveDraftItem}
        onClearAll={onClearDraftItems}
        onReorder={onReorderDraftItems}
        onSave={onSaveDraftQueue}
        onCancel={onCancelDraftPanel}
        onClose={onCloseDraftPanel}
      />
    </div>
  )
}
