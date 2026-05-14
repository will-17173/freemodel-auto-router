# 队列编辑功能实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 合并供应商页面和队列页面，实现队列编辑功能（改名、添加模型、删除模型、拖拽排序）

**Architecture:** 队列标签栏横向排列在供应商卡片上方，点击标签弹出右侧编辑面板，手动保存机制

**Tech Stack:** React + TypeScript + Tauri + dnd-kit

---

## Task 1: 移除 Sidebar 中的"路由队列"菜单项

**Objective:** 简化侧边栏，只保留三个菜单项

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: 修改 menuItems 数组**

将 `src/components/Sidebar.tsx` 第 19-24 行改为：

```typescript
const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: "providers", label: "供应商", icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "logs", label: "日志", icon: <FileText className="h-4 w-4" /> },
  { id: "settings", label: "设置", icon: <Settings className="h-4 w-4" /> },
]
```

**Step 2: 修改 PageId 类型定义**

将第 12 行改为：

```typescript
export type PageId = "providers" | "logs" | "settings"
```

**Step 3: 验证改动**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

**Step 4: 提交**

```bash
git add src/components/Sidebar.tsx
git commit -m "refactor: 移除侧边栏队列菜单项，准备合并页面"
```

---

## Task 2: 删除 QueuePage.tsx 文件

**Objective:** 移除不再使用的队列页面组件

**Files:**
- Delete: `src/components/QueuePage.tsx`

**Step 1: 删除文件**

```bash
rm src/components/QueuePage.tsx
```

**Step 2: 验证**

运行: `pnpm tsc --noEmit`
预期: 无类型错误（App.tsx 还未移除引用，会有错误，正常）

**Step 3: 提交**

```bash
git add -A
git commit -m "refactor: 删除 QueuePage.tsx，功能将合并到供应商页面"
```

---

## Task 3: 创建 QueueEditPanel 组件（基于 DraftQueuePanel）

**Objective:** 重命名并扩展面板组件，支持新建/编辑两种模式

**Files:**
- Create: `src/components/QueueEditPanel.tsx` (从 DraftQueuePanel.tsx 复制并修改)
- Keep: `src/components/DraftQueuePanel.tsx` (暂时保留，后续删除)

**Step 1: 复制 DraftQueuePanel.tsx 为 QueueEditPanel.tsx**

```bash
cp src/components/DraftQueuePanel.tsx src/components/QueueEditPanel.tsx
```

**Step 2: 修改 QueueEditPanel.tsx 接口**

修改接口定义（第 22-34 行）：

```typescript
interface QueueEditPanelProps {
  open: boolean
  mode: "new" | "edit"
  queueId?: string  // edit 模式下必填
  queueName: string
  items: DraftItem[]
  providers: Provider[]
  isDefaultQueue: boolean  // edit 模式下判断是否为默认队列
  onQueueNameChange: (name: string) => void
  onRemoveItem: (index: number) => void
  onClearAll: () => void
  onReorder: (items: DraftItem[]) => void
  onSave: () => void
  onCancel: () => void
  onClose: () => void
  onSetDefault?: () => void  // edit 模式下可选
  onDeleteQueue?: () => void  // edit 模式下可选
}
```

**Step 3: 修改组件内部标题显示**

修改第 125 行标题：

```typescript
<h2 className="font-semibold text-sm">
  {mode === "new" ? "新建队列" : "编辑队列"}
</h2>
```

**Step 4: 添加"设为当前"和"删除队列"按钮**

在第 177-194 行的 Footer 区域修改为：

```typescript
{/* Footer */}
<div className="p-4 border-t border-border">
  {/* edit 模式下的特殊按钮 */}
  {mode === "edit" && !isDefaultQueue && (
    <div className="flex items-center gap-2 mb-3">
      {onSetDefault && (
        <button
          onClick={onSetDefault}
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          设为当前队列
        </button>
      )}
      {onDeleteQueue && (
        <button
          onClick={onDeleteQueue}
          className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
        >
          删除队列
        </button>
      )}
    </div>
  )}
  {items.length > 0 && (
    <button
      onClick={onClearAll}
      className="text-xs text-muted-foreground hover:text-destructive mb-3 transition-colors block"
    >
      清空全部
    </button>
  )}
  <div className="flex items-center gap-2">
    <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
      取消
    </Button>
    <Button size="sm" className="flex-1" onClick={onSave}>
      {mode === "new" ? "保存创建" : "保存修改"}
    </Button>
  </div>
</div>
```

**Step 5: 修改组件函数签名**

修改第 76-88 行的函数签名：

```typescript
export function QueueEditPanel({
  open,
  mode,
  queueId,
  queueName,
  items,
  providers,
  isDefaultQueue,
  onQueueNameChange,
  onRemoveItem,
  onClearAll,
  onReorder,
  onSave,
  onCancel,
  onClose,
  onSetDefault,
  onDeleteQueue,
}: QueueEditPanelProps) {
```

**Step 6: 验证**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

**Step 7: 提交**

```bash
git add src/components/QueueEditPanel.tsx
git commit -m "feat: 创建 QueueEditPanel 组件，支持新建/编辑两种模式"
```

---

## Task 4: 创建 QueueTabs 子组件

**Objective:** 创建队列标签栏组件，横向显示队列列表

**Files:**
- Create: `src/components/QueueTabs.tsx`

**Step 1: 创建 QueueTabs.tsx**

```typescript
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Queue, QueueStateInfo } from "@/types"

interface QueueTabsProps {
  queues: Record<string, Queue>
  queueStates: Record<string, QueueStateInfo>
  defaultQueueId: string
  selectedQueueId: string | null
  onSelectQueue: (queueId: string) => void
  onNewQueue: () => void
}

export function QueueTabs({
  queues,
  queueStates,
  defaultQueueId,
  selectedQueueId,
  onSelectQueue,
  onNewQueue,
}: QueueTabsProps) {
  const queueList = Object.values(queues).sort((a, b) => {
    if (a.id === defaultQueueId) return -1
    if (b.id === defaultQueueId) return 1
    return 0
  })

  return (
    <div className="h-10 px-6 flex items-center gap-1 border-b border-border bg-secondary/30">
      {queueList.map((queue) => {
        const isSelected = queue.id === selectedQueueId
        const isDefault = queue.id === defaultQueueId
        const state = queueStates[queue.id]
        const exhaustedCount = state?.exhausted_indices.length ?? 0
        const itemCount = queue.items.length
        const allExhausted = itemCount > 0 && exhaustedCount >= itemCount

        return (
          <button
            key={queue.id}
            onClick={() => onSelectQueue(queue.id)}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors",
              isSelected
                ? "bg-primary/10 text-primary font-medium border border-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className="truncate">{queue.name}</span>
            {isDefault && (
              <span className="text-xs text-primary/60">(当前)</span>
            )}
            {allExhausted && (
              <span className="text-xs text-destructive">尽</span>
            )}
          </button>
        )
      })}
      <button
        onClick={onNewQueue}
        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        新建
      </button>
    </div>
  )
}
```

**Step 2: 验证**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

**Step 3: 提交**

```bash
git add src/components/QueueTabs.tsx
git commit -m "feat: 创建 QueueTabs 队列标签栏组件"
```

---

## Task 5: 重构 App.tsx 状态管理

**Objective:** 移除队列页面路由，添加编辑面板相关状态

**Files:**
- Modify: `src/App.tsx`

**Step 1: 移除 QueuePage import**

删除第 14 行：
```typescript
// 删除这行
import { QueuePage } from "./components/QueuePage";
```

**Step 2: 添加新组件 import**

在第 14 行位置添加：
```typescript
import { QueueTabs } from "./components/QueueTabs";
import { QueueEditPanel } from "./components/QueueEditPanel";
```

**Step 3: 移除 draft 相关状态，添加编辑面板状态**

将第 63-67 行的 draft 状态替换为：

```typescript
// 编辑面板状态
const [editPanelMode, setEditPanelMode] = useState<"new" | "edit" | null>(null);
const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
const [editPanelName, setEditPanelName] = useState("");
const [editPanelItems, setEditPanelItems] = useState<DraftItem[]>([]);
```

**Step 4: 移除 selectedQueueId 状态**

删除第 61 行的 `selectedQueueId` 状态（将用 editingQueueId 替代）

**Step 5: 移除 queue 页面路由逻辑**

删除第 506-520 行的 QueuePage 渲染部分：
```typescript
// 删除这部分
{currentPage === "queue" && (
  <QueuePage
    ...
  />
)}
```

**Step 6: 验证**

运行: `pnpm tsc --noEmit`
预期: 可能还有错误（ProvidersPage 还未修改），继续下一步

**Step 7: 提交**

```bash
git add src/App.tsx
git commit -m "refactor: App.tsx 移除队列页面路由，添加编辑面板状态"
```

---

## Task 6: 重构 App.tsx 队列操作函数

**Objective:** 实现打开/关闭/保存编辑面板的逻辑

**Files:**
- Modify: `src/App.tsx`

**Step 1: 删除旧 draft 相关函数**

删除以下函数（约第 225-309 行）：
- `clearAndCloseDraft`
- `openDraftPanel`
- `addToDraft`
- `removeFromDraft`
- `reorderDraftItems`
- `clearDraftItems`
- `closeDraftPanel`
- `cancelDraftPanel`
- `saveDraftQueue`

**Step 2: 添加新的编辑面板操作函数**

在删除的位置添加新函数：

```typescript
// === 编辑面板操作 ===

function openEditPanel(queueId: string) {
  const queue = config!.queues[queueId];
  if (!queue) return;
  setEditPanelMode("edit");
  setEditingQueueId(queueId);
  setEditPanelName(queue.name);
  setEditPanelItems(queue.items);
}

function openNewPanel() {
  const queueCount = Object.keys(config!.queues).length;
  const defaultName = `队列 ${queueCount + 1}`;
  setEditPanelMode("new");
  setEditingQueueId(null);
  setEditPanelName(defaultName);
  setEditPanelItems([]);
}

function closeEditPanel() {
  setEditPanelMode(null);
  setEditingQueueId(null);
  setEditPanelName("");
  setEditPanelItems([]);
}

function cancelEditPanel() {
  closeEditPanel();
}

function addToEditPanel(providerId: string, modelId: string) {
  if (!editPanelMode) return;  // 面板未打开时不添加
  const exists = editPanelItems.some(
    (item) => item.provider_id === providerId && item.model_id === modelId
  );
  if (exists) {
    alert("该模型已存在于队列中");
    return;
  }
  setEditPanelItems([...editPanelItems, { provider_id: providerId, model_id: modelId }]);
}

function removeFromEditPanel(index: number) {
  setEditPanelItems(editPanelItems.filter((_, i) => i !== index));
}

function reorderEditPanelItems(newItems: DraftItem[]) {
  setEditPanelItems(newItems);
}

function clearEditPanelItems() {
  setEditPanelItems([]);
}

async function saveEditPanel() {
  if (!editPanelName.trim()) {
    alert("队列名不能为空");
    return;
  }
  if (editPanelItems.length === 0) {
    alert("队列为空，请添加至少一个模型");
    return;
  }

  try {
    if (editPanelMode === "new") {
      // 新建队列
      const newQueue = await createQueue(editPanelName);
      await updateQueue(newQueue.id, editPanelName, editPanelItems);
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              queues: { ...prev.queues, [newQueue.id]: { ...newQueue, items: editPanelItems } },
            }
          : prev
      );
      alert(`队列 "${editPanelName}" 创建成功`);
    } else {
      // 编辑现有队列
      await updateQueue(editingQueueId!, editPanelName, editPanelItems);
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              queues: {
                ...prev.queues,
                [editingQueueId!]: { ...prev.queues[editingQueueId!], name: editPanelName, items: editPanelItems },
              },
            }
          : prev
      );
      alert(`队列 "${editPanelName}" 已保存`);
    }
    closeEditPanel();
  } catch (e) {
    alert("保存失败");
    console.error(e);
  }
}

async function handleSetDefaultFromPanel() {
  if (!editingQueueId) return;
  await setDefaultQueue(editingQueueId);
  setConfig((prev) => prev ? { ...prev, default_queue_id: editingQueueId } : prev);
  // 刷新面板状态（isDefaultQueue 会变为 true）
}

async function handleDeleteQueueFromPanel() {
  if (!editingQueueId) return;
  const queue = config!.queues[editingQueueId];
  if (!window.confirm(`确定删除队列 "${queue.name}"？`)) return;
  
  await deleteQueue(editingQueueId);
  setConfig((prev) => {
    if (!prev) return prev;
    const updatedQueues = { ...prev.queues };
    delete updatedQueues[editingQueueId];
    return { ...prev, queues: updatedQueues };
  });
  closeEditPanel();
}
```

**Step 3: 提交**

```bash
git add src/App.tsx
git commit -m "feat: App.tsx 实现编辑面板操作函数"
```

---

## Task 7: 重构 ProvidersPage.tsx 添加队列标签栏

**Objective:** 在供应商页面顶部添加队列标签栏，整合编辑面板

**Files:**
- Modify: `src/components/ProvidersPage.tsx`

**Step 1: 添加 QueueTabs 和 QueueEditPanel import**

在第 4 行后添加：
```typescript
import { QueueTabs } from "./QueueTabs"
import { QueueEditPanel } from "./QueueEditPanel"
```

**Step 2: 删除 DraftQueuePanel import**

删除第 4 行的 `DraftQueuePanel` import

**Step 3: 修改 ProvidersPageProps 接口**

将接口（第 28-48 行）替换为：

```typescript
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
  onNewQueue: () => void
  // 编辑面板
  editPanelMode: "new" | "edit" | null
  editPanelName: string
  editPanelItems: DraftItem[]
  isDefaultQueue: boolean
  onEditPanelNameChange: (name: string) => void
  onRemoveEditPanelItem: (index: number) => void
  onReorderEditPanelItems: (items: DraftItem[]) => void
  onClearEditPanelItems: () => void
  onCloseEditPanel: () => void
  onCancelEditPanel: () => void
  onSaveEditPanel: () => void
  onSetDefaultFromPanel?: () => void
  onDeleteQueueFromPanel?: () => void
}
```

**Step 4: 修改组件函数签名**

更新第 50-70 行的函数参数：

```typescript
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
  onNewQueue,
  // 编辑面板
  editPanelMode,
  editPanelName,
  editPanelItems,
  isDefaultQueue,
  onEditPanelNameChange,
  onRemoveEditPanelItem,
  onReorderEditPanelItems,
  onClearEditPanelItems,
  onCloseEditPanel,
  onCancelEditPanel,
  onSaveEditPanel,
  onSetDefaultFromPanel,
  onDeleteQueueFromPanel,
}: ProvidersPageProps) {
```

**Step 5: 修改模型按钮逻辑**

将第 242-254 行的模型按钮改为：

```typescript
<button
  disabled={!authMap[provider.id] || !editPanelMode}
  onClick={() => authMap[provider.id] && editPanelMode && onAddToQueue(provider.id, model.id)}
  className={cn(
    "text-xs px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1",
    authMap[provider.id]
      ? editPanelMode
        ? "border-[#22c55e]/40 bg-[#f0fce8] text-[#16a34a] hover:border-[#22c55e] hover:bg-[#dcfce7] cursor-pointer"
        : "border-[#22c55e]/30 bg-[#f0fce8]/70 text-[#16a34a]/80 cursor-not-allowed"
      : "border-border text-muted-foreground bg-muted/30 cursor-not-allowed opacity-60"
  )}
>
```

关键是把 `showDraftPanel` 改为 `editPanelMode`，只有面板打开时才能添加。

**Step 6: 修改页面布局结构**

将第 114-310 行的整体布局改为：

```typescript
return (
  <div className="flex-1 flex flex-col overflow-hidden">
    {/* 队列标签栏 */}
    <QueueTabs
      queues={queues}
      queueStates={queueStates}
      defaultQueueId={defaultQueueId}
      selectedQueueId={selectedQueueId}
      onSelectQueue={onSelectQueue}
      onNewQueue={onNewQueue}
    />

    {/* 主内容区 */}
    <div className="flex-1 flex overflow-hidden">
      {/* 供应商卡片网格 */}
      <div className={cn(
        "flex-1 p-6 overflow-auto transition-[margin-right] duration-300 ease-out",
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

        {/* Grid - 保持原有供应商卡片代码 */}
        <div className="grid grid-cols-2 gap-4">
          {/* ... 保持原有的供应商卡片渲染代码 ... */}
        </div>
      </div>

      {/* 编辑面板 */}
      <QueueEditPanel
        open={!!editPanelMode}
        mode={editPanelMode ?? "new"}
        queueId={selectedQueueId}
        queueName={editPanelName}
        items={editPanelItems}
        providers={providers}
        isDefaultQueue={isDefaultQueue}
        onQueueNameChange={onEditPanelNameChange}
        onRemoveItem={onRemoveEditPanelItem}
        onClearAll={onClearEditPanelItems}
        onReorder={onReorderEditPanelItems}
        onSave={onSaveEditPanel}
        onCancel={onCancelEditPanel}
        onClose={onCloseEditPanel}
        onSetDefault={onSetDefaultFromPanel}
        onDeleteQueue={onDeleteQueueFromPanel}
      />
    </div>
  </div>
)
```

**Step 7: 验证**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

**Step 8: 提交**

```bash
git add src/components/ProvidersPage.tsx
git commit -m "feat: ProvidersPage 添加队列标签栏和编辑面板"
```

---

## Task 8: 重构 App.tsx 渲染逻辑

**Objective:** 更新 ProvidersPage 的 props，移除旧的 draft props

**Files:**
- Modify: `src/App.tsx`

**Step 1: 更新 ProvidersPage 渲染部分**

将第 483-505 行的 ProvidersPage 渲染改为：

```typescript
{currentPage === "providers" && (
  <ProvidersPage
    providers={config.providers}
    authMap={authMap}
    onAddToQueue={addToEditPanel}
    onConfigKey={(id) => setEditingKeyProviderId(id)}
    onAddModel={(id) => setAddingModelProviderId(id)}
    onAddProvider={() => setShowAddProvider(true)}
    onDeleteProvider={handleDeleteProvider}
    onDeleteModel={handleDeleteModel}
    // 队列标签栏
    queues={config.queues}
    queueStates={queueStates}
    defaultQueueId={config.default_queue_id}
    selectedQueueId={editingQueueId}
    onSelectQueue={openEditPanel}
    onNewQueue={openNewPanel}
    // 编辑面板
    editPanelMode={editPanelMode}
    editPanelName={editPanelName}
    editPanelItems={editPanelItems}
    isDefaultQueue={editingQueueId === config.default_queue_id}
    onEditPanelNameChange={setEditPanelName}
    onRemoveEditPanelItem={removeFromEditPanel}
    onReorderEditPanelItems={reorderEditPanelItems}
    onClearEditPanelItems={clearEditPanelItems}
    onCloseEditPanel={closeEditPanel}
    onCancelEditPanel={cancelEditPanel}
    onSaveEditPanel={saveEditPanel}
    onSetDefaultFromPanel={handleSetDefaultFromPanel}
    onDeleteQueueFromPanel={handleDeleteQueueFromPanel}
  />
)}
```

**Step 2: 删除 useEffect 中关闭 draft panel 的逻辑**

删除第 144-151 行的 useEffect：
```typescript
// 删除这个 useEffect
useEffect(() => {
  if (currentPage !== "providers") {
    setShowDraftPanel(false);
    setDraftItems([]);
    setDraftQueueName("");
  }
}, [currentPage]);
```

改为：
```typescript
useEffect(() => {
  if (currentPage !== "providers" && editPanelMode) {
    closeEditPanel();
  }
}, [currentPage]);
```

**Step 3: 验证**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

**Step 4: 提交**

```bash
git add src/App.tsx
git commit -m "feat: App.tsx 更新 ProvidersPage props，移除 draft 相关逻辑"
```

---

## Task 9: 删除 DraftQueuePanel.tsx

**Objective:** 清理不再使用的组件

**Files:**
- Delete: `src/components/DraftQueuePanel.tsx`

**Step 1: 删除文件**

```bash
rm src/components/DraftQueuePanel.tsx
```

**Step 2: 验证**

运行: `pnpm tsc --noEmit`
预期: 无类型错误

**Step 3: 提交**

```bash
git add -A
git commit -m "refactor: 删除 DraftQueuePanel.tsx，功能已迁移到 QueueEditPanel"
```

---

## Task 10: 整体验证和测试

**Objective:** 运行应用验证功能正常

**Files:**
- 无文件改动，仅验证

**Step 1: 类型检查**

运行: `pnpm tsc --noEmit`
预期: 无错误

**Step 2: 启动开发环境**

运行: `pnpm tauri dev`
预期: 应用正常启动

**Step 3: 功能测试**

手动测试以下场景：
1. 侧边栏只显示三个菜单项（供应商、日志、设置）
2. 供应商页面顶部显示队列标签栏
3. 点击队列标签弹出编辑面板
4. 点击供应商模型的"+"添加到编辑面板
5. 拖拽排序、删除单项正常工作
6. 点击"保存"保存改动，点击"取消"放弃改动
7. 点击"+ 新建"弹出新建队列面板
8. 非默认队列显示"设为当前"和"删除队列"按钮

**Step 4: 提交（如有修复）**

如有问题修复后提交：
```bash
git add -A
git commit -m "fix: 修复队列编辑功能集成问题"
```

---

## Task 11: 更新 CLAUDE.md 文档

**Objective:** 更新项目文档反映新架构

**Files:**
- Modify: `CLAUDE.md`

**Step 1: 更新前端组件列表**

修改前端组件部分，反映新的页面结构：

```markdown
### 前端（`src/`）

- **`App.tsx`** — 唯一状态容器；管理多页面路由、队列编辑状态、应用注入状态
- **`api.ts`** — 封装所有 Tauri invoke 命令
- **`types.ts`** — TypeScript 类型（与 Rust 结构体对应）
- **`components/`** — 多页面结构：
  - `Sidebar.tsx` — 左侧导航（providers / logs / settings）
  - `TopBar.tsx` — 顶部状态栏 + 应用注入开关
  - `ProvidersPage.tsx` — 供应商卡片网格 + 队列标签栏 + QueueEditPanel
  - `QueueTabs.tsx` — 队列标签栏组件
  - `QueueEditPanel.tsx` — 队列编辑面板（新建/编辑模式）
  - `LogsPage.tsx` — 代理日志
  - `SettingsPage.tsx` — 重试/端口配置
  - `AddProviderModal.tsx` / `AddModelModal.tsx` / `ApiKeyModal.tsx` — 输入弹窗
```

**Step 2: 提交**

```bash
git add CLAUDE.md
git commit -m "docs: 更新 CLAUDE.md 反应队列编辑功能架构"
```

---

## 完成标记

所有任务完成后：

```bash
git status
# 确认无未提交改动
git log --oneline -5
# 查看最近的提交历史
```