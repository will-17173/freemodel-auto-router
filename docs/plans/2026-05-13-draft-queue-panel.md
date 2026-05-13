# 新建队列缓存区面板实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 改造新建队列流程，支持缓存区收集模型、拖拽排序后批量创建队列。

**Architecture:** 纯前端缓存区，右侧滑出面板，使用 @dnd-kit 拖拽，调用现有 createQueue + updateQueue API。

**Tech Stack:** React, TypeScript, @dnd-kit/sortable, shadcn/ui, Tailwind CSS

---

## Task 1: 创建 DraftQueuePanel 组件骨架

**Objective:** 创建组件文件，定义 Props 接口，搭建基础布局结构。

**Files:**
- Create: `src/components/DraftQueuePanel.tsx`

**Step 1: 创建组件文件**

```typescript
import { useState } from "react"
import { X, GripVertical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { DraftItem, Provider } from "@/types"

interface DraftQueuePanelProps {
  open: boolean
  queueName: string
  items: DraftItem[]
  providers: Provider[]
  onQueueNameChange: (name: string) => void
  onRemoveItem: (index: number) => void
  onClearAll: () => void
  onReorder: (items: DraftItem[]) => void
  onSave: () => void
  onCancel: () => void
  onClose: () => void
}

export function DraftQueuePanel({
  open,
  queueName,
  items,
  providers,
  onQueueNameChange,
  onRemoveItem,
  onClearAll,
  onReorder,
  onSave,
  onCancel,
  onClose,
}: DraftQueuePanelProps) {
  // Placeholder - will add content in next tasks
  return (
    <div className={cn(
      "fixed right-0 top-0 bottom-0 w-[280px] bg-background border-l border-border z-50",
      "transform transition-transform duration-300 ease-out",
      open ? "translate-x-0" : "translate-x-full"
    )}>
      {/* Content will be added in subsequent tasks */}
    </div>
  )
}
```

**Step 2: 验证文件创建**

Run: `ls src/components/DraftQueuePanel.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/DraftQueuePanel.tsx
git commit -m "feat: add DraftQueuePanel component skeleton"
```

---

## Task 2: 添加 DraftItem 类型定义

**Objective:** 在 types.ts 中添加 DraftItem 类型，用于缓存区项。

**Files:**
- Modify: `src/types.ts`

**Step 1: 添加类型定义**

在 `src/types.ts` 文件末尾添加：

```typescript
// Draft item for queue creation panel
export interface DraftItem {
  provider_id: string;
  model_id: string;
}
```

**Step 2: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add DraftItem type"
```

---

## Task 3: 添加面板头部（标题 + 队列名输入 + 关闭按钮）

**Objective:** 在 DraftQueuePanel 中添加头部区域：标题、队列名输入框、关闭按钮。

**Files:**
- Modify: `src/components/DraftQueuePanel.tsx`

**Step 1: 更新组件内容**

替换 DraftQueuePanel 的 return 内容：

```typescript
export function DraftQueuePanel({
  open,
  queueName,
  items,
  providers,
  onQueueNameChange,
  onRemoveItem,
  onClearAll,
  onReorder,
  onSave,
  onCancel,
  onClose,
}: DraftQueuePanelProps) {
  return (
    <div className={cn(
      "fixed right-0 top-0 bottom-0 w-[280px] bg-background border-l border-border z-50",
      "transform transition-transform duration-300 ease-out",
      open ? "translate-x-0" : "translate-x-full"
    )}>
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">新建队列</h2>
          <button
            onClick={onClose}
            className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">队列名:</span>
          <Input
            value={queueName}
            onChange={(e) => onQueueNameChange(e.target.value)}
            placeholder="输入队列名称"
            className="h-8 text-sm"
          />
        </div>
      </div>
    </div>
  )
}
```

**Step 2: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/components/DraftQueuePanel.tsx
git commit -m "feat: add DraftQueuePanel header with queue name input"
```

---

## Task 4: 添加缓存区列表（无拖拽）

**Objective:** 添加缓存区标题 + 列表区域，显示已添加的模型项（先不实现拖拽）。

**Files:**
- Modify: `src/components/DraftQueuePanel.tsx`

**Step 1: 添加列表区域**

在 Header div 之后添加缓存区列表：

```typescript
      {/* Header */}
      <div className="p-4 border-b border-border">
        ...existing header content...
      </div>

      {/* Draft items list */}
      <div className="flex-1 overflow-auto p-4">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          缓存区 ({items.length}项)
        </div>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            点击供应商模型的 + 添加
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {items.map((item, index) => {
              const provider = providers.find(p => p.id === item.provider_id)
              const model = provider?.models.find(m => m.id === item.model_id)
              const label = `${provider?.name ?? item.provider_id} / ${model?.name ?? item.model_id}`
              return (
                <div
                  key={`${item.provider_id}::${item.model_id}::${index}`}
                  className="flex items-center gap-2 py-2 px-3 rounded-lg border border-border bg-card"
                >
                  <span className="text-muted-foreground cursor-grab">
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-medium text-sm">
                    {index + 1}. {label}
                  </span>
                  <button
                    onClick={() => onRemoveItem(index)}
                    className="h-5 w-5 ml-auto rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
```

**Step 2: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/components/DraftQueuePanel.tsx
git commit -m "feat: add draft items list display"
```

---

## Task 5: 添加拖拽排序功能

**Objective:** 使用 @dnd-kit 实现缓存区项的拖拽排序，复用 QueuePage 的 SortableContext 模式。

**Files:**
- Modify: `src/components/DraftQueuePanel.tsx`

**Step 1: 导入 @dnd-kit 相关模块**

在文件顶部添加导入：

```typescript
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
```

**Step 2: 创建 SortableDraftItem 子组件**

在 DraftQueuePanel 之前添加：

```typescript
function SortableDraftItem({
  uid,
  index,
  label,
  onRemove,
}: {
  uid: string
  index: number
  label: string
  onRemove: (i: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: uid })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 py-2 px-3 rounded-lg border border-border bg-card"
    >
      <span {...attributes} {...listeners} className="cursor-grab text-muted-foreground">
        <GripVertical className="h-3.5 w-3.5" />
      </span>
      <span className="font-medium text-sm">
        {index + 1}. {label}
      </span>
      <button
        onClick={() => onRemove(index)}
        className="h-5 w-5 ml-auto rounded hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}
```

**Step 3: 更新 DraftQueuePanel 使用拖拽**

替换列表渲染部分：

```typescript
      {/* Draft items list */}
      <div className="flex-1 overflow-auto p-4">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          缓存区 ({items.length}项)
        </div>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            点击供应商模型的 + 添加
          </div>
        ) : (
          <DraftDndList
            items={items}
            providers={providers}
            onReorder={onReorder}
            onRemoveItem={onRemoveItem}
          />
        )}
      </div>
```

并在 DraftQueuePanel 内部添加辅助组件和逻辑：

```typescript
export function DraftQueuePanel({...}: DraftQueuePanelProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const ids = items.map((item, i) => `${item.provider_id}::${item.model_id}::${i}`)

  function getLabel(item: DraftItem) {
    const provider = providers.find(p => p.id === item.provider_id)
    const model = provider?.models.find(m => m.id === item.model_id)
    return `${provider?.name ?? item.provider_id} / ${model?.name ?? item.model_id}`
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = ids.indexOf(active.id as string)
    const newIdx = ids.indexOf(over.id as string)
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(arrayMove(items, oldIdx, newIdx))
    }
  }

  return (
    <div className={cn(...)}>
      {/* Header */}
      ...

      {/* Draft items list with DndContext */}
      <div className="flex-1 overflow-auto p-4">
        <div className="text-xs font-medium text-muted-foreground mb-2">
          缓存区 ({items.length}项)
        </div>
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            点击供应商模型的 + 添加
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {items.map((item, i) => (
                  <SortableDraftItem
                    key={ids[i]}
                    uid={ids[i]}
                    index={i}
                    label={getLabel(item)}
                    onRemove={onRemoveItem}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
      ...
    </div>
  )
}
```

**Step 4: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 5: Commit**

```bash
git add src/components/DraftQueuePanel.tsx
git commit -m "feat: add drag-and-drop sorting to DraftQueuePanel"
```

---

## Task 6: 添加底部操作区（清空全部 + 取消/保存按钮）

**Objective:** 在面板底部添加清空全部按钮和取消/保存按钮。

**Files:**
- Modify: `src/components/DraftQueuePanel.tsx`

**Step 1: 添加底部操作区**

在 DraftQueuePanel 的列表区域后添加：

```typescript
      {/* Footer */}
      <div className="p-4 border-t border-border">
        {items.length > 0 && (
          <button
            onClick={onClearAll}
            className="text-xs text-muted-foreground hover:text-destructive mb-3 transition-colors"
          >
            清空全部
          </button>
        )}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
            取消
          </Button>
          <Button size="sm" className="flex-1" onClick={onSave}>
            保存创建
          </Button>
        </div>
      </div>
    </div>
  )
```

**Step 2: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/components/DraftQueuePanel.tsx
git commit -m "feat: add footer buttons to DraftQueuePanel"
```

---

## Task 7: 在 App.tsx 添加 draft 状态和函数

**Objective:** 在 App.tsx 中添加缓存区相关状态和处理函数。

**Files:**
- Modify: `src/App.tsx`

**Step 1: 导入 DraftItem 类型**

在 import 区域添加：

```typescript
import type { AppConfig, Provider, QueueItem, QueueStateInfo, ProviderSwitchedPayload, DraftItem } from "./types";
```

**Step 2: 添加 draft 状态**

在 App 函数内的 useState 区域添加：

```typescript
  // Draft queue panel state
  const [showDraftPanel, setShowDraftPanel] = useState(false);
  const [draftQueueName, setDraftQueueName] = useState("");
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
```

**Step 3: 添加 draft 相关函数**

在 `handleResetQueueExhausted` 函数后添加：

```typescript
  function openDraftPanel() {
    const queueCount = Object.keys(config!.queues).length;
    const defaultName = `队列 ${queueCount + 1}`;
    setDraftQueueName(defaultName);
    setDraftItems([]);
    setShowDraftPanel(true);
  }

  function addToDraft(providerId: string, modelId: string) {
    const exists = draftItems.some(
      item => item.provider_id === providerId && item.model_id === modelId
    );
    if (exists) {
      alert("该模型已存在于缓存区");
      return;
    }
    setDraftItems([...draftItems, { provider_id: providerId, model_id: modelId }]);
  }

  function removeFromDraft(index: number) {
    setDraftItems(draftItems.filter((_, i) => i !== index));
  }

  function reorderDraftItems(newItems: DraftItem[]) {
    setDraftItems(newItems);
  }

  function clearDraftItems() {
    setDraftItems([]);
  }

  function closeDraftPanel() {
    if (draftItems.length > 0) {
      if (window.confirm("缓存区有未保存的内容，关闭将丢弃。确定关闭？")) {
        clearAndCloseDraft();
      }
      return;
    }
    clearAndCloseDraft();
  }

  function cancelDraftPanel() {
    if (draftItems.length > 0) {
      if (window.confirm("未保存的内容将丢弃。确定取消？")) {
        clearAndCloseDraft();
      }
      return;
    }
    clearAndCloseDraft();
  }

  function clearAndCloseDraft() {
    setDraftItems([]);
    setDraftQueueName("");
    setShowDraftPanel(false);
  }

  async function saveDraftQueue() {
    if (!draftQueueName.trim()) {
      alert("队列名不能为空");
      return;
    }
    if (draftItems.length === 0) {
      alert("缓存区为空，请添加至少一个模型");
      return;
    }

    try {
      const newQueue = await createQueue(draftQueueName);
      if (draftItems.length > 0) {
        await updateQueue(newQueue.id, draftQueueName, draftItems);
      }

      setConfig(prev => prev ? {
        ...prev,
        queues: { ...prev.queues, [newQueue.id]: { ...newQueue, items: draftItems } }
      } : prev);
      setSelectedQueueId(newQueue.id);

      clearAndCloseDraft();
      alert(`队列 "${draftQueueName}" 创建成功`);
    } catch (e) {
      alert("创建队列失败");
      console.error(e);
    }
  }
```

**Step 4: 修改 addToQueue 函数**

修改现有的 `addToQueue` 函数，根据 `showDraftPanel` 状态决定添加到缓存区还是现有队列：

```typescript
  function addToQueue(providerId: string, modelId: string) {
    if (!authMap[providerId]) return;  // 需要 API key 才能添加
    
    if (showDraftPanel) {
      addToDraft(providerId, modelId);
      return;
    }
    
    if (!selectedQueueId) return;
    const newItem: QueueItem = { provider_id: providerId, model_id: modelId };
    const queue = config!.queues[selectedQueueId];
    if (!queue) return;
    const updatedQueue = { ...queue, items: [...queue.items, newItem] };
    updateAndSave({ ...config!, queues: { ...config!.queues, [selectedQueueId]: updatedQueue } });
  }
```

**Step 5: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add draft queue state and functions to App.tsx"
```

---

## Task 8: 修改 ProvidersPage 集成 DraftQueuePanel

**Objective:** 在 ProvidersPage 中集成 DraftQueuePanel，修改布局，传递 props。

**Files:**
- Modify: `src/components/ProvidersPage.tsx`

**Step 1: 导入 DraftQueuePanel 和 DraftItem**

```typescript
import { DraftQueuePanel } from "./DraftQueuePanel"
import type { Provider, Queue, DraftItem } from "@/types"
```

**Step 2: 更新 Props 接口**

添加 draft 相关 props：

```typescript
interface ProvidersPageProps {
  providers: Provider[]
  authMap: Record<string, boolean>
  activeProviderId: string | undefined
  queues: Record<string, Queue>
  selectedQueueId: string | null
  showDraftPanel: boolean
  draftQueueName: string
  draftItems: DraftItem[]
  onAddToQueue: (providerId: string, modelId: string) => void
  onConfigKey: (providerId: string) => void
  onAddModel: (providerId: string) => void
  onAddProvider: () => void
  onSelectQueue: (queueId: string) => void
  onCreateQueue: (name: string) => void
  onOpenDraftPanel: () => void
  onDraftQueueNameChange: (name: string) => void
  onRemoveDraftItem: (index: number) => void
  onClearDraftItems: () => void
  onReorderDraftItems: (items: DraftItem[]) => void
  onSaveDraftQueue: () => void
  onCancelDraftPanel: () => void
  onCloseDraftPanel: () => void
}
```

**Step 3: 更新组件参数和布局**

```typescript
export function ProvidersPage({
  providers,
  authMap,
  activeProviderId,
  queues,
  selectedQueueId,
  showDraftPanel,
  draftQueueName,
  draftItems,
  onAddToQueue,
  onConfigKey,
  onAddModel,
  onAddProvider,
  onSelectQueue,
  onCreateQueue,
  onOpenDraftPanel,
  onDraftQueueNameChange,
  onRemoveDraftItem,
  onClearDraftItems,
  onReorderDraftItems,
  onSaveDraftQueue,
  onCancelDraftPanel,
  onCloseDraftPanel,
}: ProvidersPageProps) {
  const [showCreateQueueModal, setShowCreateQueueModal] = useState(false)

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Main content */}
      <div className={cn(
        "flex-1 p-6 overflow-auto transition-[margin-right] duration-300 ease-out",
        showDraftPanel && "mr-[280px]"
      )}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          ...existing header...
          {/* Replace CreateQueueModal button with openDraftPanel */}
          <button
            onClick={onOpenDraftPanel}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-border text-muted-foreground text-sm rounded-lg hover:border-primary hover:text-primary transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            新建队列
          </button>
          ...
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-4">
          ...existing grid content...
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
```

**Step 4: 删除 CreateQueueModal 使用**

删除 `showCreateQueueModal` 状态和相关逻辑（新建队列现在通过 DraftQueuePanel）：

```typescript
// 删除以下代码
const [showCreateQueueModal, setShowCreateQueueModal] = useState(false)

// 删除按钮 onClick={() => setShowCreateQueueModal(true)}

// 删除 CreateQueueModal 渲染
<CreateQueueModal ... />
```

**Step 5: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 6: Commit**

```bash
git add src/components/ProvidersPage.tsx
git commit -m "feat: integrate DraftQueuePanel into ProvidersPage"
```

---

## Task 9: 更新 App.tsx 传递 props 给 ProvidersPage

**Objective:** 在 App.tsx 中将 draft 相关函数和状态传递给 ProvidersPage。

**Files:**
- Modify: `src/App.tsx`

**Step 1: 更新 ProvidersPage props**

找到 ProvidersPage 渲染位置，添加新 props：

```typescript
        {currentPage === "providers" && (
          <ProvidersPage
            providers={config.providers}
            authMap={authMap}
            activeProviderId={activeQueueItem?.provider_id}
            queues={config.queues}
            selectedQueueId={selectedQueueId}
            showDraftPanel={showDraftPanel}
            draftQueueName={draftQueueName}
            draftItems={draftItems}
            onAddToQueue={addToQueue}
            onConfigKey={(id) => setEditingKeyProviderId(id)}
            onAddModel={(id) => setAddingModelProviderId(id)}
            onAddProvider={() => setShowAddProvider(true)}
            onSelectQueue={setSelectedQueueId}
            onCreateQueue={handleCreateQueue}
            onOpenDraftPanel={openDraftPanel}
            onDraftQueueNameChange={setDraftQueueName}
            onRemoveDraftItem={removeFromDraft}
            onClearDraftItems={clearDraftItems}
            onReorderDraftItems={reorderDraftItems}
            onSaveDraftQueue={saveDraftQueue}
            onCancelDraftPanel={cancelDraftPanel}
            onCloseDraftPanel={closeDraftPanel}
          />
        )}
```

**Step 2: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: pass draft props to ProvidersPage"
```

---

## Task 10: 添加页面切换时关闭缓存区面板逻辑

**Objective:** 用户切换页面时自动关闭缓存区面板（无确认）。

**Files:**
- Modify: `src/App.tsx`

**Step 1: 添加 useEffect 监听页面切换**

在 useEffect 区域添加：

```typescript
  // Close draft panel when switching pages
  useEffect(() => {
    if (currentPage !== "providers" && showDraftPanel) {
      clearAndCloseDraft();
    }
  }, [currentPage]);
```

**Step 2: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: close draft panel on page switch"
```

---

## Task 11: 运行开发服务器测试功能

**Objective:** 启动开发服务器，验证缓存区面板的完整流程。

**Step 1: 启动开发服务器**

Run: `pnpm dev`
Expected: 服务器启动，浏览器可访问 http://localhost:5173

**Step 2: 手动测试流程**

1. 点击"新建队列"按钮 → 右侧面板滑出
2. 验证队列名默认值为 "队列 N"
3. 点击供应商模型 "+" → 添加到缓存区
4. 重复添加同一模型 → 提示"已存在于缓存区"
5. 拖拽排序 → 顺序改变
6. 点击单项删除 → 移除该项
7. 点击"清空全部" → 清空所有项
8. 点击"取消" → 确认后关闭
9. 点击"保存创建" → 队列创建成功

**Step 3: 验证无错误**

检查浏览器 console 无错误。

---

## Task 12: 删除不再使用的 CreateQueueModal

**Objective:** 移除 CreateQueueModal.tsx 文件，因为新建队列功能已由 DraftQueuePanel 替代。

**Files:**
- Delete: `src/components/CreateQueueModal.tsx`

**Step 1: 删除文件**

```bash
rm src/components/CreateQueueModal.tsx
```

**Step 2: 验证类型检查**

Run: `pnpm tsc --noEmit`
Expected: 无错误

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated CreateQueueModal"
```

---

## 完成验收

- [ ] 点击"新建队列"后右侧面板滑出
- [ ] 队列名有默认值，可编辑
- [ ] 点击供应商模型 "+" 添加到缓存区
- [ ] 重复添加提示已存在
- [ ] 拖拽排序功能正常
- [ ] 单项删除功能正常
- [ ] 清空全部功能正常
- [ ] 取消按钮有确认提示
- [ ] 保存创建功能正常，队列出现在列表中
- [ ] 切换页面自动关闭面板
- [ ] 无类型错误
- [ ] 无运行时错误