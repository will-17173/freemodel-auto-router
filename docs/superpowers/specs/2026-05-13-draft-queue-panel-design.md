# 新建队列缓存区面板设计

## 概述

改造新建队列流程：从"弹窗输入名称 → 空队列"变为"输入名称 → 缓存区收集模型 → 拖拽排序 → 保存创建"。

## 需求

- 点击"新建队列"后，右侧滑出缓存区面板
- 队列名有默认值，可编辑修改
- 点击供应商模型 "+" 将模型添加到缓存区（禁止重复，提示已存在）
- 缓存区支持：拖拽排序、单项删除（×）、清空全部
- 关闭方式：保存即关闭、手动关闭（提示丢弃）、取消按钮（清空关闭）

## 技术方案

纯前端缓存区（方案 A），不涉及后端临时队列。保存时一次性调用 `createQueue` + `updateQueue`。

## 架构

### 新增组件

- `DraftQueuePanel.tsx` — 右侧滑出的缓存区侧边面板

### 新增状态（App.tsx 或 ProvidersPage）

```typescript
interface DraftItem {
  provider_id: string;
  model_id: string;
}

const [showDraftPanel, setShowDraftPanel] = useState(false);
const [draftQueueName, setDraftQueueName] = useState("");
const [draftItems, setDraftItems] = useState<DraftItem[]>([]);
```

### 数据流

```
点击"新建队列"
  → setShowDraftPanel(true)
  → 设置默认队列名 "队列 N"
  → 清空 draftItems

点击供应商模型 "+"
  → if (showDraftPanel)
      → 检查 draftItems 是否已存在 (provider_id, model_id)
      → 若存在：toast 提示"已存在于缓存区"
      → 若不存在：append 到 draftItems
    else
      → 添加到 selectedQueue（保持原有逻辑）

缓存区拖拽排序
  → @dnd-kit SortableContext 复用现有逻辑

点击"保存创建"
  → 校验队列名非空、缓存区非空
  → createQueue(name) + updateQueue(id, name, items)
  → 更新前端 config.queues
  → setSelectedQueueId(newQueue.id)
  → clearAndClose()

点击"取消"或关闭按钮
  → if (draftItems.length > 0) 弹出确认对话框
  → 确认后清空关闭
```

## DraftQueuePanel 组件设计

### 布局

```
┌─────────────────────────────────┐
│  新建队列                        │
│  ─────────────────────────────  │
│  队列名: [队列 N          ] [×] │
│  ─────────────────────────────  │
│                                 │
│  缓存区 (3项)                    │
│  ┌───────────────────────────┐ │
│  │ ≡ 1. OpenRouter / claude  │ │
│  │ ≡ 2. DeepSeek / deepseek  │ │
│  │ ≡ 3. Groq / llama         │ │
│  └───────────────────────────┘ │
│                                 │
│  [清空全部]                      │
│  ─────────────────────────────  │
│  [取消]        [保存创建]        │
└─────────────────────────────────┘
```

### 交互细节

- **队列名输入框**：初始值 `队列 ${existingCount + 1}`，可修改，保存时校验非空
- **关闭按钮（×）**：若缓存区有内容，弹出确认对话框
- **拖拽排序**：复用 `SortableQueueItem` 逻辑，`GripVertical` 手柄
- **单项删除**：每项右侧 × 按钮，点击直接移除
- **清空全部**：底部按钮，点击清空 draftItems，无二次确认
- **取消按钮**：若缓存区有内容，弹出确认"未保存的内容将丢弃"，确认后清空关闭
- **保存创建**：调用后端创建，成功后关闭面板

## 与供应商页面集成

### "+" 按钮行为

```typescript
if (showDraftPanel === true)
  → 添加到 draftItems（缓存区）
else
  → 添加到 selectedQueue（现有队列，原有逻辑）
```

### 页面布局

```
┌──────────────────────┬──────────────────────┐
│   供应商列表          │   DraftQueuePanel    │
│   (宽度自适应)        │   (固定宽度 280px)   │
│                      │   (showDraftPanel时   │
│                      │    从右侧滑入)        │
└──────────────────────┴──────────────────────┘
```

- CSS `transform: translateX()` 实现滑入动画
- 面板关闭时 `translateX(100%)`，打开时 `translateX(0)`
- 供应商列表在面板打开时收缩（margin-right: 280px）

## 状态管理

### 打开面板

```typescript
function openDraftPanel() {
  const queueCount = Object.keys(config.queues).length;
  const defaultName = `队列 ${queueCount + 1}`;
  setDraftQueueName(defaultName);
  setDraftItems([]);
  setShowDraftPanel(true);
}
```

### 重复校验

```typescript
function addToDraft(providerId: string, modelId: string) {
  const exists = draftItems.some(
    item => item.provider_id === providerId && item.model_id === modelId
  );
  if (exists) {
    toast.error("该模型已存在于缓存区");
    return;
  }
  setDraftItems([...draftItems, { provider_id: providerId, model_id: modelId }]);
}
```

### 关闭确认

```typescript
function closeDraftPanel() {
  if (draftItems.length > 0) {
    if (window.confirm("缓存区有未保存的内容，关闭将丢弃。确定关闭？")) {
      clearAndClose();
    }
    return;
  }
  clearAndClose();
}

function clearAndClose() {
  setDraftItems([]);
  setDraftQueueName("");
  setShowDraftPanel(false);
}
```

## 保存流程

```typescript
async function saveDraftQueue() {
  if (!draftQueueName.trim()) {
    toast.error("队列名不能为空");
    return;
  }
  if (draftItems.length === 0) {
    toast.error("缓存区为空，请添加至少一个模型");
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
    
    clearAndClose();
    toast.success(`队列 "${draftQueueName}" 创建成功`);
  } catch (e) {
    toast.error("创建队列失败");
  }
}
```

后端保持现有逻辑，前端两步调用：`createQueue(name)` → `updateQueue(id, name, items)`。

## 动画与样式

### 面板滑入

```css
.fm-draft-panel {
  position: fixed;
  right: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: var(--background);
  border-left: 1px solid var(--border);
  transform: translateX(100%);
  transition: transform 0.3s ease-out;
  z-index: 50;
}

.fm-draft-panel.fm-open {
  transform: translateX(0);
}

.fm-providers-main {
  transition: margin-right 0.3s ease-out;
}

.fm-providers-main.fm-panel-open {
  margin-right: 280px;
}
```

### 缓存区项样式

- 复用 `SortableQueueItem` 视觉风格
- 背景 `bg-card`，边框 `border-border`
- 删除按钮：右侧 × 图标，hover 变红
- 拖拽手柄：`GripVertical`，cursor: grab

## 错误处理

| 场景 | 处理 |
|------|------|
| 队列名为空 | toast "队列名不能为空" |
| 缓存区为空 | toast "请添加至少一个模型" |
| 添加重复模型 | toast "该模型已存在于缓存区" |
| 队列名已存在 | toast "队列名已存在，请修改" |
| 后端创建失败 | toast "创建失败"，保持面板打开 |
| 切换页面 | 直接清空关闭面板，无确认 |

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/App.tsx` | 新增 draft 状态，修改 addToQueue 逻辑 |
| `src/components/ProvidersPage.tsx` | 集成 DraftQueuePanel，处理布局变化 |
| `src/components/DraftQueuePanel.tsx` | 新建组件 |
| `src/App.css` | 新增 .fm-draft-panel 样式 |

## 后端改动

无需改动。使用现有 `createQueue` + `updateQueue` 接口。