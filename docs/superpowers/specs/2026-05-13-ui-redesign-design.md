# freemodel-auto-router UI 重设计

## 概述

将 freemodel-auto-router 的界面从当前的上下堆叠布局改为左右分栏布局，引入 shadcn/ui 组件库，并采用 Airbnb 设计系统的配色方案（温暖友好的浅色风格）。

## 设计目标

1. **布局重构** — 传统导航菜单布局：左侧菜单栏 + 右侧内容区
2. **配色更新** — 基于 Airbnb DESIGN.md 的配色，使用 Rausch (#ff385c) 作为主色调
3. **组件标准化** — 所有 UI 元素使用 shadcn/ui 组件库，便于维护和扩展

---

## 布局结构

### 整体框架

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (200px)  │  Main Content Area              │
│                   │                                 │
│  Logo             │  ┌───────────────────────────┐  │
│                   │  │ Top Status Bar (固定)     │  │
│  Menu Items:      │  │ - Server status Badge     │  │
│  - 供应商         │  │ - 4 App Toggle Switches   │  │
│  - 路由队列       │  └───────────────────────────┘  │
│  - 日志           │                                 │
│  - 设置           │  ┌───────────────────────────┐  │
│  - (可扩展)       │  │ Page Content              │  │
│                   │  │ (根据当前菜单项变化)       │  │
│                   │  └───────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 左侧菜单栏 (Sidebar)

- **宽度**: 200px
- **背景**: `#f7f7f7` (surface-soft)
- **内容**:
  - Logo 区域: "freemodel" + "auto-router" 副标题
  - 菜单项列表: 供应商、路由队列、日志、设置（可扩展更多）
  - 菜单项样式: shadcn/ui Button ghost 变体，选中状态加 border + 白色背景

### 右侧顶部状态栏 (Top Bar)

- **背景**: `#ffffff` (canvas)
- **左侧**:
  - Badge 组件: 显示服务器运行状态 + 端口号
  - 开启状态 Badge 背景: `#ff385c` (primary)
- **右侧**:
  - 4 个 App Toggle: 图标 + shadcn/ui Switch 组件
  - 开启状态: 图标背景 primary，Switch 开启
  - 关闭状态: 图标背景 muted，Switch 关闭

---

## 页面内容

### 供应商页面 (Providers)

**主内容区**:
- 页面标题 + shadcn/ui Button primary "添加"
- 供应商卡片网格: 2 列布局

**供应商卡片 (shadcn/ui Card)**:
- 活跃供应商: primary 边框 + 顶部 3px primary 指示条 + 绿色状态点
- 卡片头部: 供应商名称 + API Key 按钮
- 卡片内容: 模型 Badge 列表 + "添加模型" ghost 按钮

**API Key 按钮**:
- 已配置: shadcn/ui Button secondary，显示 "Key ✓"
- 未配置: shadcn/ui Button，橙色背景 rgba(255,56,92,0.1)，显示 "配置 Key"

**模型 Badge**:
- shadcn/ui Badge 变体，pill 形状 (rounded-full)
- 有 Key: 可点击，hover 变 primary
- 无 Key: disabled，灰色透明

### 路由队列页面 (Queue)

**主内容区**:
- 页面标题
- 队列项列表: 横向排列，支持拖拽排序 (dnd-kit)

**队列项样式**:
- 当前活跃项: primary 背景 Badge，白色文字，右侧小 Badge "当前"
- 等待项: secondary 背景 Badge，带 border
- 已用尽项: muted 背景，降低 opacity
- 每项右侧有 × 按钮移除

**提示文字**: "在供应商页面点击模型的 + 添加到队列"

### 日志页面 (Logs)

**主内容区**:
- shadcn/ui ScrollArea 包裹日志列表
- 每条日志: 时间戳 + 请求路径 + 状态码

### 设置页面 (Settings)

**主内容区**:
- shadcn/ui Card 包裹设置表单
- 重试次数 Input (number)
- 重试间隔 Input (number)
- 端口 Input (number)
- shadcn/ui Button primary "保存"

---

## 配色方案

### shadcn/ui CSS 变量映射

基于 Airbnb DESIGN.md 的配色 token，映射到 shadcn/ui 的 CSS 变量结构：

```css
:root {
  --background: 0 0% 100%;           /* #ffffff - canvas */
  --foreground: 0 0% 13%;            /* #222222 - ink */
  --card: 0 0% 100%;                 /* #ffffff */
  --card-foreground: 0 0% 13%;       /* #222222 */
  --popover: 0 0% 100%;              /* #ffffff */
  --popover-foreground: 0 0% 13%;    /* #222222 */
  --primary: 0 84% 60%;              /* #ff385c - Rausch */
  --primary-foreground: 0 0% 100%;   /* #ffffff */
  --secondary: 0 0% 97%;             /* #f7f7f7 - surface-soft */
  --secondary-foreground: 0 0% 13%;  /* #222222 */
  --muted: 0 0% 97%;                 /* #f7f7f7 */
  --muted-foreground: 0 0% 42%;      /* #6a6a6a */
  --accent: 0 84% 60%;               /* #ff385c */
  --accent-foreground: 0 0% 100%;    /* #ffffff */
  --destructive: 0 84% 60%;          /* #ff385c */
  --destructive-foreground: 0 0% 100%;
  --border: 0 0% 87%;                /* #dddddd - hairline */
  --input: 0 0% 87%;                 /* #dddddd */
  --ring: 0 84% 60%;                 /* #ff385c */
  --radius: 0.875rem;                /* 14px - Airbnb rounded.md */
}
```

### 颜色语义

| Token | 值 | 用途 |
|---|---|---|
| primary | #ff385c | 状态指示、活跃卡片边框、当前队列项、主要按钮 |
| ink | #222222 | 主要文字、标题 |
| muted | #6a6a6a | 次要文字、非活跃菜单项、提示文字 |
| canvas | #ffffff | 主内容区背景 |
| surface-soft | #f7f7f7 | Sidebar 背景、Badge secondary 背景 |
| hairline | #dddddd | 边框、分隔线 |

---

## shadcn/ui 组件清单

| 组件 | 用途 |
|---|---|
| Button | primary/secondary/ghost 变体，用于"添加"、"Key"、菜单项 |
| Card | 供应商卡片容器、设置表单容器 |
| Badge | 模型标签（pill）、状态指示、"当前"标签、队列项 |
| Switch | 四个 App Toggle 开关 |
| Input | Modal 中的表单输入、设置页参数 |
| Dialog | 设置、添加供应商、API Key 输入 Modal |
| ScrollArea | 日志面板滚动区域 |
| Tooltip | 图标按钮的提示信息 |

---

## 圆角规范 (遵循 Airbnb)

| 元素 | 圆角 |
|---|---|
| Card | 14px (rounded-md) |
| Badge (pill) | 999px (rounded-full) |
| Button | 8px (rounded-sm) |
| Input | 8px (rounded-sm) |
| Sidebar 菜单项 | 8px |
| Modal | 14px |

---

## 实现约束

1. **仅 Light 模式** — 不实现 dark mode 切换
2. **shadcn/ui 作为唯一 UI 库** — 移除现有的自定义 CSS 组件类（fm-*）
3. **保留现有功能** — 拖拽排序、API 调用逻辑不变，只改 UI 层
4. **Tauri 兼容** — 组件样式需在 Tauri WebView 中正常渲染

---

## 文件变更范围

### 需修改的文件

1. `src/App.tsx` — 重构布局结构，引入 Sidebar 组件
2. `src/App.css` — 移除旧 CSS，替换为 shadcn/ui theme CSS
3. `src/components/ProviderCard.tsx` — 改用 shadcn/ui Card + Badge
4. `src/components/QueuePanel.tsx` — 改为独立页面组件，用 Badge 展示队列项
5. `src/components/SettingsModal.tsx` — 改用 shadcn/ui Dialog + Input
6. `src/components/ApiKeyModal.tsx` — 改用 shadcn/ui Dialog + Input
7. `src/components/AddProviderModal.tsx` — 改用 shadcn/ui Dialog + Input
8. `src/components/AddModelModal.tsx` — 改用 shadcn/ui Dialog + Input
9. `src/components/ProxyLogPanel.tsx` — 改为独立页面组件，用 ScrollArea

### 需新增的文件

1. `src/components/ui/` — shadcn/ui 组件目录
2. `src/components/Sidebar.tsx` — 左侧导航菜单
3. `src/components/TopBar.tsx` — 顶部状态栏 + App Toggle
4. `src/components/ProvidersPage.tsx` — 供应商页面
5. `src/components/QueuePage.tsx` — 路由队列页面
6. `src/components/LogsPage.tsx` — 日志页面
7. `src/components/SettingsPage.tsx` — 设置页面
8. `src/lib/utils.ts` — shadcn/ui cn() helper

---

## 设计参考

- Airbnb DESIGN.md: `/Volumes/T7/Code/freemodel-auto-router/airbnb/DESIGN.md`
- shadcn/ui 文档: https://ui.shadcn.com