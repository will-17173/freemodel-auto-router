# UI/UX 优化 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 优化 freemodel-auto-router 的 UI/UX，包括队列创建流程、页面布局、菜单样式、日志表格化等 8 个改进点。

**Architecture:** 前端使用 React + Tailwind v4 + shadcn/ui，后端 Tauri Rust。日志表格需要扩展后端 ProxyLogEntry 结构体来记录更多字段。

**Tech Stack:** React 19, Tailwind v4, shadcn/ui, lucide-react (已有), Tauri 2.x, axum proxy

---

## Task 1: 修复 Sidebar active 状态颜色问题

**Objective:** 修复左边菜单 active 时底色黑色、文字也是黑色看不清的问题。

**Files:**
- Modify: `src/components/Sidebar.tsx:40-43`

**Step 1: 分析问题**

当前代码：
```tsx
currentPage === item.id
  ? "bg-foreground text-secondary font-medium"
  : "text-muted-foreground hover:bg-muted hover:text-foreground"
```

问题：`bg-foreground` 是黑色 (#1a1a1a)，`text-secondary` 也是黑色，导致文字看不清。

**Step 2: 修改样式**

修改为白底橙字，符合设计系统的活跃状态：

```tsx
currentPage === item.id
  ? "bg-primary/10 text-primary font-medium border border-primary/20"
  : "text-muted-foreground hover:bg-muted hover:text-foreground"
```

**Step 3: 验证**

运行 `pnpm dev`，点击左侧菜单切换页面，确认 active 状态是橙底浅橙背景、橙色文字。

---

## Task 2: 引入图标库，给菜单添加图标

**Objective:** 项目已安装 lucide-react，确认菜单图标正常显示。

**Files:**
- Modify: `src/components/Sidebar.tsx`

**Step 1: 确认图标导入**

当前代码已有：
```tsx
import {
  LayoutGrid,
  ListOrdered,
  FileText,
  Settings,
} from "lucide-react"
```

**Step 2: 确认图标渲染**

当前 menuItems 已配置图标：
```tsx
const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: "providers", label: "供应商", icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "queue", label: "路由队列", icon: <ListOrdered className="h-4 w-4" /> },
  { id: "logs", label: "日志", icon: <FileText className="h-4 w-4" /> },
  { id: "settings", label: "设置", icon: <Settings className="h-4 w-4" /> },
]
```

渲染也已正确 `{item.icon}`。

**Step 3: 验证**

运行 `pnpm dev`，确认每个菜单项前面有对应图标。

---

## Task 3: Sidebar 底部添加应用版本

**Objective:** 在左边侧栏最底部显示应用版本号。

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src-tauri/tauri.conf.json` (version 字段已存在)

**Step 1: 在 Sidebar 底部添加版本显示**

在 Sidebar 组件底部添加版本区域：

```tsx
// 在 </nav> 之后，</div> 之前添加
{/* Version footer */}
<div className="mt-auto px-4 py-3 text-xs text-muted-foreground">
  v0.1.0
</div>
```

**Step 2: 动态获取版本（可选增强）**

通过 Tauri API 获取版本：

```tsx
import { getName, getVersion } from "@tauri-apps/api/app"

// 在组件顶部添加
const [version, setVersion] = useState("")

useEffect(() => {
  getVersion().then(setVersion).catch(() => setVersion("0.1.0"))
}, [])
```

底部显示：
```tsx
<div className="mt-auto px-4 py-3 text-xs text-muted-foreground">
  freemodel-auto-router v{version}
</div>
```

**Step 3: 验证**

运行 `pnpm tauri dev`，确认左下角显示版本号。

---

## Task 4: TopBar 应用图标恢复为图片

**Objective:** 将 TopBar 中的 CC/CX/H/OC 双字母缩写改回使用图片。

**Files:**
- Modify: `src/components/TopBar.tsx`
- Create/Use: `src/assets/images/` 目录下的图片

**Step 1: 查看现有图片资源**

现有图片：
- `hermes.png` (48KB)
- `openclaw.png` (77KB)

需要新增：
- Claude Code 图标
- Codex 图标

**Step 2: 暂时保留文字，为 Hermes 和 OpenClaw 使用图片**

修改 TopBar.tsx 中的 AppToggle 组件：

```tsx
// 新增 props
interface AppToggleProps {
  id: string
  label: string
  enabled: boolean
  disabled?: boolean
  onToggle: (enabled: boolean) => void
  iconUrl?: string  // 可选图标 URL
}

function AppToggle({ id: _id, label, enabled, disabled, onToggle, iconUrl }: AppToggleProps) {
  return (
    <div className={cn(
      "flex items-center gap-1.5",
      disabled && "opacity-50"
    )}>
      <div className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center overflow-hidden",
        enabled ? "bg-primary" : "bg-muted"
      )}>
        {iconUrl ? (
          <img src={iconUrl} alt={label} className="h-6 w-6 object-contain" />
        ) : (
          <span className={cn(
            "text-[10px] font-semibold",
            enabled ? "text-primary-foreground" : "text-muted-foreground"
          )}>
            {label}
          </span>
        )}
      </div>
      <Switch
        checked={enabled}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </div>
  )
}
```

**Step 3: 修改 TopBar 使用图片**

```tsx
// 在 TopBar 组件内
const appIcons: Record<string, { label: string; icon?: string }> = {
  cc: { label: "CC" },  // 暂无图标，保留文字
  codex: { label: "CX" },  // 暂无图标，保留文字
  hermes: { label: "H", icon: "/src/assets/images/hermes.png" },
  openclaw: { label: "OC", icon: "/src/assets/images/openclaw.png" },
}

// 渲染
<AppToggle
  id="hermes"
  label={appIcons.hermes.label}
  iconUrl={appIcons.hermes.icon}
  enabled={appStates.hermes}
  disabled={!isActive}
  onToggle={(e) => onAppToggle("hermes", e)}
/>
```

**Step 4: 验证**

运行 `pnpm dev`，确认 Hermes 和 OpenClaw 显示图片图标。

---

## Task 5: 路由队列页面布局改成左右两列

**Objective:** 将 QueuePage 改成左右两列布局：左边列显示队列名字列表，右边列显示队列详情。

**Files:**
- Modify: `src/components/QueuePage.tsx`

**Step 1: 重构 QueuePage 为左右两列布局**

```tsx
export function QueuePage({ ... }: QueuePageProps) {
  // ...existing code...

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* 左侧：队列列表 */}
      <div className="w-[200px] border-r border-border bg-secondary/30 p-4 flex flex-col gap-2">
        {queueList.map((queue) => (
          <button
            key={queue.id}
            onClick={() => onSelectQueue(queue.id)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors w-full text-left",
              queue.id === selectedQueueId
                ? "bg-primary/10 text-primary font-medium border border-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span className="truncate">{queue.name}</span>
            {queue.id === defaultQueueId && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0 shrink-0">
                默认
              </Badge>
            )}
          </button>
        ))}
        {/* 新建队列按钮 */}
        <button
          onClick={() => setShowCreateQueueModal(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          新建队列
        </button>
      </div>

      {/* 右侧：队列详情 */}
      <div className="flex-1 p-6 overflow-auto">
        {/* 队列详情内容... */}
      </div>
    </div>
  )
}
```

**Step 2: 移除顶部的队列选择器区域**

删除原来的 `<div className="flex flex-wrap gap-2 mb-6">` 区域。

**Step 3: 验证**

运行 `pnpm dev`，确认队列页面左右两列布局正确。

---

## Task 6: 修复队列页面添加队列按钮无反应

**Objective:** 当前"新建队列"按钮使用 `prompt()`，需要改为使用 Modal。

**Files:**
- Modify: `src/components/QueuePage.tsx`
- Create: `src/components/CreateQueueModal.tsx`

**Step 1: 创建 CreateQueueModal 组件**

```tsx
// src/components/CreateQueueModal.tsx
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface CreateQueueModalProps {
  open: boolean
  onClose: () => void
  onCreate: (name: string) => void
}

export function CreateQueueModal({ open, onClose, onCreate }: CreateQueueModalProps) {
  const [name, setName] = useState("")
  const [error, setError] = useState("")

  function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError("请输入队列名称")
      return
    }
    onCreate(trimmed)
    setName("")
    setError("")
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>新建队列</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="输入队列名称"
            autoFocus
          />
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleSubmit}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: 在 QueuePage 中使用 Modal**

```tsx
// 添加 state
const [showCreateModal, setShowCreateModal] = useState(false)

// 渲染 Modal
{showCreateModal && (
  <CreateQueueModal
    open={showCreateModal}
    onClose={() => setShowCreateModal(false)}
    onCreate={(name) => {
      onCreateQueue(name)
      setShowCreateModal(false)
    }}
  />
)}
```

**Step 3: 移除 prompt() 调用**

删除按钮中的 `onClick={() => { const name = prompt(...)... }}`，改为：
```tsx
onClick={() => setShowCreateModal(true)}
```

**Step 4: 验证**

运行 `pnpm dev`，点击"新建队列"按钮，确认弹出 Modal。

---

## Task 7: 将创建队列入口移到供应商页面

**Objective:** 在供应商页面添加"新建队列"功能，因为添加队列项需要选择模型。

**Files:**
- Modify: `src/components/ProvidersPage.tsx`
- Modify: `src/App.tsx`

**Step 1: 在 ProvidersPage 添加队列选择和创建功能**

修改 ProvidersPage props：

```tsx
interface ProvidersPageProps {
  providers: Provider[]
  authMap: Record<string, boolean>
  activeProviderId: string | undefined
  queues: Record<string, Queue>  // 新增
  selectedQueueId: string | null  // 新增
  onAddToQueue: (providerId: string, modelId: string) => void
  onConfigKey: (providerId: string) => void
  onAddModel: (providerId: string) => void
  onAddProvider: () => void
  onSelectQueue: (queueId: string) => void  // 新增
  onCreateQueue: (name: string) => void  // 新增
}
```

**Step 2: 在 ProvidersPage 头部添加队列选择器**

```tsx
{/* Header */}
<div className="flex items-center justify-between mb-5">
  <h1 className="text-lg font-semibold">供应商</h1>
  <div className="flex items-center gap-3">
    {/* 队列选择器 */}
    <select
      value={selectedQueueId ?? ""}
      onChange={(e) => onSelectQueue(e.target.value)}
      className="text-sm px-3 py-1.5 rounded-lg border border-border bg-muted"
    >
      {Object.values(queues).map((q) => (
        <option key={q.id} value={q.id}>{q.name}</option>
      ))}
    </select>
    <button
      onClick={() => setShowCreateQueueModal(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-border text-muted-foreground text-sm rounded-lg hover:border-primary hover:text-primary transition-colors"
    >
      <Plus className="h-3.5 w-3.5" />
      新建队列
    </button>
    {/* 添加供应商按钮 */}
    <button onClick={onAddProvider} ...>
      <Plus className="h-3.5 w-3.5" />
      添加
    </button>
  </div>
</div>
```

**Step 3: 在 App.tsx 中传递新的 props**

```tsx
{currentPage === "providers" && (
  <ProvidersPage
    providers={config.providers}
    authMap={authMap}
    activeProviderId={activeQueueItem?.provider_id}
    queues={config.queues}  // 新增
    selectedQueueId={selectedQueueId}  // 新增
    onAddToQueue={addToQueue}
    onConfigKey={(id) => setEditingKeyProviderId(id)}
    onAddModel={(id) => setAddingModelProviderId(id)}
    onAddProvider={() => setShowAddProvider(true)}
    onSelectQueue={setSelectedQueueId}  // 新增
    onCreateQueue={handleCreateQueue}  // 新增
  />
)}
```

**Step 4: 验证**

运行 `pnpm dev`，在供应商页面确认可以选择队列、新建队列、添加模型到队列。

---

## Task 8: 后端扩展 ProxyLogEntry 添加详细字段

**Objective:** 扩展后端日志结构体，添加 input_tokens、output_tokens、duration_ms 等字段。

**Files:**
- Modify: `src-tauri/src/proxy_log.rs`
- Modify: `src-tauri/src/proxy.rs`
- Modify: `src/types.ts`

**Step 1: 扩展 ProxyLogEntry 结构体**

```rust
// proxy_log.rs
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct ProxyLogEntry {
    pub id: u64,
    pub timestamp_ms: u128,
    pub level: LogLevel,
    pub message: String,
    pub fields: BTreeMap<String, String>,
    // 新增字段
    pub provider: Option<String>,
    pub model: Option<String>,
    pub status: Option<u16>,
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub duration_ms: Option<u64>,
}
```

**Step 2: 修改 push 方法签名**

```rust
pub fn push<K, V, I>(&self, level: LogLevel, message: impl Into<String>, fields: I,
    provider: Option<String>, model: Option<String>, status: Option<u16>,
    input_tokens: Option<u64>, output_tokens: Option<u64>, duration_ms: Option<u64>)
where
    K: Into<String>,
    V: Into<String>,
    I: IntoIterator<Item = (K, V)>,
{
    // ... 创建 entry 时添加新字段
}
```

**Step 3: 修改 proxy.rs 中的日志调用**

```rust
// 请求开始时记录时间
let start_time = SystemTime::now();

// 响应后计算耗时
let duration_ms = start_time.elapsed().map(|d| d.as_millis() as u64).ok();

// 从响应中提取 token 数量（需要解析响应体）
let (input_tokens, output_tokens) = extract_tokens_from_response(&resp);

// 调用 push 时传入新字段
state.logs.push(
    LogLevel::Info,
    "upstream response",
    [("provider", provider_name.clone()), ("model", model_id.clone())],
    Some(provider_name.clone()),
    Some(model_id.clone()),
    Some(status),
    input_tokens,
    output_tokens,
    duration_ms,
);
```

**Step 4: 更新前端 types.ts**

```typescript
export interface ProxyLogEntry {
  id: number;
  timestamp_ms: number;
  level: ProxyLogLevel;
  message: string;
  fields: Record<string, string>;
  // 新增字段
  provider?: string;
  model?: string;
  status?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_ms?: number;
}
```

---

## Task 9: 日志页面改成表格形式

**Objective:** 将 LogsPage 从列表形式改为表格形式，显示时间、状态、模型、厂商、token数、耗时等字段。

**Files:**
- Modify: `src/components/LogsPage.tsx`

**Step 1: 重构 LogsPage 为表格布局**

```tsx
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

function formatTime(ms: number) {
  const date = new Date(ms)
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function formatDuration(ms: number | undefined) {
  if (!ms) return "-"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatTokens(n: number | undefined) {
  if (!n) return "-"
  return n.toLocaleString()
}

function getStatusBadge(status: number | undefined) {
  if (!status) return <Badge variant="secondary">-</Badge>
  if (status >= 200 && status < 300) return <Badge variant="default" className="bg-green-500">{status}</Badge>
  if (status >= 400 && status < 500) return <Badge variant="destructive">{status}</Badge>
  return <Badge variant="outline">{status}</Badge>
}

export function LogsPage({ port: _port }: LogsPageProps) {
  const [logs, setLogs] = useState<ProxyLogEntry[]>([])

  useEffect(() => {
    getProxyLogs().then(setLogs).catch(console.error)
    const interval = setInterval(() => {
      getProxyLogs().then(setLogs).catch(console.error)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex-1 p-6 overflow-hidden flex flex-col">
      <h1 className="text-lg font-semibold mb-4">代理日志</h1>

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">时间</TableHead>
              <TableHead className="w-[80px]">状态</TableHead>
              <TableHead className="w-[150px]">厂商</TableHead>
              <TableHead className="w-[200px]">模型</TableHead>
              <TableHead className="w-[80px]">输入</TableHead>
              <TableHead className="w-[80px]">输出</TableHead>
              <TableHead className="w-[80px]">耗时</TableHead>
              <TableHead>消息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {formatTime(log.timestamp_ms)}
                </TableCell>
                <TableCell>{getStatusBadge(log.status)}</TableCell>
                <TableCell>{log.provider ?? "-"}</TableCell>
                <TableCell className="truncate max-w-[200px]">{log.model ?? "-"}</TableCell>
                <TableCell className="font-mono text-xs">{formatTokens(log.input_tokens)}</TableCell>
                <TableCell className="font-mono text-xs">{formatTokens(log.output_tokens)}</TableCell>
                <TableCell className="font-mono text-xs">{formatDuration(log.duration_ms)}</TableCell>
                <TableCell className="text-sm truncate max-w-[300px]">{log.message}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
```

**Step 2: 安装 Table 组件（如果未安装）**

```bash
pnpm dlx shadcn@latest add table
```

**Step 3: 验证**

运行 `pnpm tauri dev`，发送请求后查看日志页面，确认表格显示正确。

---

## Task 10: 综合测试与清理

**Objective:** 运行完整测试，确保所有改动正常工作。

**Files:**
- All modified files

**Step 1: TypeScript 类型检查**

```bash
pnpm tsc --noEmit
```

**Step 2: 运行完整开发环境**

```bash
pnpm tauri dev
```

**Step 3: 功能验证清单**

- [ ] 左侧菜单 active 状态颜色正确（橙色）
- [ ] 左侧菜单图标显示正确
- [ ] 左下角显示版本号
- [ ] TopBar Hermes/OpenClaw 显示图片
- [ ] 队列页面左右两列布局
- [ ] 点击"新建队列"弹出 Modal
- [ ] 供应商页面可以选择/创建队列
- [ ] 日志页面表格显示（需要后端改动完成后）

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: UI/UX 优化 - 菜单样式、队列布局、日志表格化"
```