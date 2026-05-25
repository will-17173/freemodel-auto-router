# Design Brief: UI Redesign

> **范围**：freemodel-auto-router 桌面应用的视觉系统重做。结构（Sidebar + TopBar + 三页路由）保持不变，重做配色、字体、间距、圆角、明暗主题策略，并新增「路由可视化」招牌组件。
>
> **不重做**：Tauri 后端、API 协议、配置文件结构、应用注入逻辑（CC / Codex / Hermes / OpenClaw）、四种工具的注入命令。

---

## Problem

我（开发者）在多个 AI 编码工具（Claude Code / Codex / Hermes / OpenClaw）之间频繁切换免费供应商，每天打开 freemodel 看一眼"现在路由到哪？哪个供应商挂了？哪个队列在跑？"——但现在打开应用时第一感受是：

- **看不出这是个开发者工具**。圆胖的按钮、温柔的浅米绿、消费级 App 的视觉语言让我下意识不把它当做"控制台"用，更像一个"健康追踪 App"。
- **看不出 freemodel 的身份**。和我电脑上同时开着的 Linear、Cursor、Raycast 摆在一起，freemodel 的视觉语言混在一片浅色 + 圆角 + 卡片里，没有任何记忆点。
- **路由这个核心动作没被视觉表达**。产品名字叫 `auto-router`，但打开界面看到的是供应商网格 + 队列标签——完全看不到"路由路径"本身。这是产品身份和视觉脱节的根源。

---

## Solution

把 freemodel 重新塑造成一个**深色底盘的开发者代理控制台**：

- 第一眼：暗色界面 + Geist Mono 数字 + 紧凑卡片 → 立刻被识别为"工具"而非"应用"
- 第二眼：顶部一条**路由可视化条**（从端口入口流向当前 active provider，queued 队列虚线在旁待命）→ 路由这个核心概念被显性地、动态地、持续地表达
- 第三眼：单点亮绿色 #00a854 只出现在"信号灯"位置（active 状态、CTA、focus、路由路径）→ 绿色不再是底色而是信号，识别度反而提升

整个体验像 Linear、Vercel 的精度感，但保留了 freemodel 自己的绿色信号灯和路由动画——一眼能记住，且与产品语义贴合。

---

## Experience Principles

1. **信号优先于装饰** —— 颜色不是用来好看的，是用来传递状态的。绿色 = active / 成功；中灰 = queued / 待命；暗灰 = exhausted / 失效；红 = error / 429。任何一抹色彩出现在屏幕上都必须能用一个动词解释为什么它在那里。
2. **密度即专业** —— 紧凑而不拥挤是开发者工具的语法。同一屏装下两倍信息，前提是层级清晰。圆角小、间距紧、字号小（西文）但层级（颜色 / 字重 / 字号）大胆拉开。中文最小 14px 守住可读性底线。
3. **路由是产品的脸** —— 每一屏都应该让用户感受到"路由正在发生"。路由可视化条是产品身份的视觉锚，不是装饰，不能折叠隐藏。

---

## Aesthetic Direction

- **Philosophy**：Linear / Vercel 极简派 + 深色开发者控制台 + 单色信号灯
- **Tone**：冷静、精确、可信。不温柔、不友好、不慷慨——但也绝不冷漠或拒人千里。开发者工具应有的"安静在场"。
- **Reference points**:
  - **Linear**（暗色 + 微妙层级 + 极致克制）—— 主参考
  - **Vercel Dashboard**（Geist 字体 + 紧凑表格 + 高信息密度）—— 字体和密度参考
  - **Raycast**（路由/命令的可视化表达）—— 路由动画的灵感来源
  - **Tauri 主页**（暗色 + 单一品牌色高光）—— 单点亮色策略的参考
- **Anti-references**:
  - 现状（浅米绿 + 圆胖按钮 + Apple Health 式视觉）—— 这就是要逃离的
  - shadcn/ui 默认主题原样未动 —— 用了 shadcn 但要看不出 shadcn 默认味
  - 玻璃拟态 / 厚阴影 / 渐变彩 —— 暗色环境里这些都是廉价感的来源
  - "黑底霓虹蒸汽波" —— 不要 hacker 美学过头，这不是终端模拟器

---

## Existing Patterns

> 当前已经存在的、本次重做要**取代**或**改造**的视觉资产。

- **Typography**: NotoSansSC 全场使用（中文字体当西文字体用，西文部分缺乏几何精度）
- **Colors**:
  - 主色 `#00a854` 翠绿（保留，但角色重定义为"信号"）
  - 9 种淡色块（mint/teal/lime/sage/lilac/cream/coral/navy/green）—— **本次精简**，绝大多数移除
  - 浅米绿底 `#eef3f0` —— **本次替换为深色底盘**
  - 语义色 success/warning/error/info —— 保留语义结构，重新调暗色版本
- **Spacing**:
  - 圆角 sm/md/lg/xl = 6 / 10 / 16 / 20 + pill 999 —— **本次收紧为 4 / 6 / 8 / 12 + pill（仅用于 chip/badge）**
  - 卡片 padding 20px、按钮 padding 10×20 —— **本次收紧为 14px、6×12（sm）/ 8×14（md）**
- **Components**:
  - `fm-btn-primary` / `fm-btn-secondary` / `fm-btn-text` / `fm-btn-destructive`：保留 class 名，CSS 全部重写（pill → 矩形小圆角）
  - `fm-card` / `fm-card-active`：保留，重写阴影策略（暗色不用阴影，用边框层级）
  - `fm-model-pill`：保留 pill 形态（这是 chip/徽章范畴）
  - `fm-queue-chip`：保留
  - `fm-input` / `fm-modal`：保留 class，重写
  - shadcn `ui/*` 组件：跟随新 token 自动适配
  - 9 种 `fm-block-*` 色块：**裁剪到 3 种**（保留 mint/lilac/coral 用于状态色块差异化场景，其余删除）

> **迁移策略**：保留 fm-* 类名 → 改 CSS 实现 → JSX 不动；新组件（路由可视化条、暗色切换器）作为新增 JSX 接入。

---

## Component Inventory

| Component | Status | Notes |
| --------- | ------ | ----- |
| **App 整体容器 / 路由** | Exists | 不动。`App.tsx` 状态容器结构保持。 |
| **Sidebar** | Modify | 重写视觉：暗色背景、矩形菜单项、Logo 区收紧、底部链接图标颜色调整。结构不变。 |
| **TopBar** | Modify | 重写视觉 + **嵌入路由可视化条**作为中央主元素。应用注入开关右移压缩。 |
| **RouteVisualizer**（新） | New | 招牌组件。横向流线图：端口入口 →（细绿线）→ active provider →（虚灰线）→ queued items。带"接力跳"动画。在 TopBar 中央。 |
| **ProvidersPage** | Modify | 卡片网格收紧（更小 padding、矩形圆角）。Provider 卡内部层级重做。 |
| **Provider 卡片** | Modify | 矩形小圆角（8px）、无重阴影、靠边框区分。active 状态用左侧 2px 绿色边竖线 + 卡片边框点亮，而非阴影发光。 |
| **QueueTabs** | Modify | 标签栏重写为 Linear 风格的 tab：底部下划线（active 时 2px 绿）+ 横向滚动溢出。 |
| **QueueEditPanel** | Modify | 编辑面板用更紧凑的 padding 和字号；拖拽手柄风格调整。 |
| **fm-model-pill** | Modify | pill 保留但更紧凑：高度 24px（现 28px）、字号 12px、垂直分隔线变细。 |
| **LogsPage** | Modify | 日志列表用 Geist Mono；时间戳列固定宽度对齐；状态码徽章用 mono 字体。 |
| **SettingsPage** | Modify | 增加「主题」分区：跟随系统 / 暗色 / 浅色 三选。 |
| **ThemeToggle**（新） | New | 主题切换器组件，挂在 SettingsPage。 |
| **AddProviderModal / AddModelModal / ApiKeyModal** | Modify | Modal 风格跟随新 token：更紧凑 padding、矩形按钮。 |
| **OnboardingModal** | Modify | 同上。 |
| **Toast** | Modify | 暗色版 toast，左侧绿/红色信号竖线区分类型。 |
| **Tooltip** | Modify | 跟随新 token，深色 tooltip 在浅色模式下也用深色（保持识别度）。 |
| **路由动画核心 hook**（新） | New | `useRouteVisualization()` —— 订阅 `provider-switched` 事件，驱动 RouteVisualizer 的"接力跳"动画。 |

---

## Key Interactions

### 1. 路由可视化条（核心招牌）

- **静止状态**：左端显示端口号 `:7860`（Geist Mono），中段一条虚线流向右端的 active provider 名。下方一行较小的 queued provider 列表（虚线、暗灰、Geist Mono）。
- **active 流动效果**：从端口入口到 active provider 之间，一颗 1px 的绿色光点以 ~3 秒周期缓慢从左流向右（不要更快，避免视觉骚扰）。
- **接力跳（429 触发切换）**：
  - active 标的右侧短暂闪红（200ms）
  - 一束绿色光迹从原 active 跳跃到新 active 位置（300ms 缓动）
  - 新 active 卡片在 ProvidersPage 同步高亮（`fm-card-active` 视觉态变化）
  - Toast 不必弹出（路由条已经表达），但 Logs 仍记录
- **悬停**：鼠标悬停某个 queued provider 时，显示 tooltip：「OpenRouter — 队列位置 #2，今日剩余预估 ~80 calls」
- **点击 active provider 名**：跳转到 ProvidersPage 并高亮该卡片

### 2. 主题切换

- SettingsPage 中三段切换：系统 / 暗色 / 浅色
- 切换瞬间无过渡（避免颜色 flash），仅 token 替换
- 主题选择持久化到 localStorage（不写入后端 config，因为是个人设备偏好）

### 3. Provider 卡片状态切换

- **idle**：边框 1px 暗灰
- **hover**：边框 1px 暗中灰 + 极微弱卡片亮度提升（暗色模式下 `bg-card → bg-card-hover`）
- **active**：左侧 2px 绿色竖条 + 边框点亮为绿 + 卡片亮度+10%
- **exhausted**（队列中已经 429 切走）：模型 pill 添加删除线 + 透明度 50%
- **配置中（无 API key）**：卡片右上角显示「配置 →」浅灰按钮

### 4. 应用注入开关

- 现状：四个图标 + 开关 在 TopBar
- 重做：保持四开关，但压缩为图标+小开关组合，移到 TopBar 右端，给路由可视化条腾出中央 C 位
- 关闭时图标灰度 + 透明度 60%，开启时完整色 + 绿色小圆点指示

### 5. 队列切换

- QueueTabs 横向 tab，active tab 底部 2px 绿色下划线（不是背景填充）
- 切换 tab 即切换 default queue（无需"应用"按钮，沿用现状）
- 路由可视化条在 tab 切换时**重新连线**（200ms 缓动）

---

## Responsive Behavior

> 这是 Tauri 桌面应用，最小窗口 1024×768，最大全屏。不需要移动端适配。

- **>1280px**（默认）：Sidebar 240px + 主区自适应。路由可视化条全宽展开。
- **1024–1280px**：Sidebar 不变，主区 Provider 卡片网格从 3 列降为 2 列；路由可视化条仍全宽，但 queued provider 列表只显示前 3 个，超出折叠。
- **<1024px**（窗口被强行收缩）：Sidebar 折叠为图标条（48px 宽），路由可视化条只显示 active 段，queued 列表完全隐藏（点击展开）。

---

## Accessibility Requirements

- **对比度**：所有正文字体在背景上 ≥ 4.5:1（WCAG AA）；状态徽章字 ≥ 3:1。暗色模式的绿 #00a854 在暗近黑底（#0A0B0D）上对比度 ~7:1，过线。
- **焦点**：所有可交互元素 focus-visible 时显示 2px 绿色 ring（`box-shadow: 0 0 0 2px var(--fm-primary-ring)`）。键盘 Tab 顺序：Sidebar → TopBar 开关 → 主区。
- **路由动画 prefers-reduced-motion**：用户系统设置启用减少动画时，路由可视化条只显示静态当前路径，不做"流动光点"和"接力跳"动画——直接闪一下颜色变化。
- **屏幕阅读器**：路由可视化条用 `<nav aria-label="当前路由路径">` 包裹，每个节点有 `aria-label="端口 7860 路由到 LongCat，状态：活跃"`。
- **不依赖颜色传递信息**：active / queued / exhausted 除了颜色，还要有图标或文字差异（`active`徽章 + 实线 vs `queued`+虚线 vs `exhausted` + 删除线）。
- **键盘快捷**（招牌动作）：`Cmd+R` 强制刷新当前路由（不进 Cmd+K，那是浏览器命令；可以考虑 `Cmd+Shift+R`）。

---

## Out of Scope

明确**不做**的事：

1. **不动产品功能与信息架构**：Sidebar 三页（providers / logs / settings）保持，不增删页面，不改导航分类。
2. **不改后端配置结构**：`config.json` schema 不动，`provider-switched` 事件协议不动。
3. **不动应用注入命令**：`~/.claude/settings.json`、`~/.codex/auth.json` 等四种工具的注入逻辑不动，只调整 TopBar 的视觉。
4. **不做 Cmd+K 命令面板**：Q7 时讨论过，目前页面不多，过度设计。可作为未来扩展。
5. **不做 GitHub-style 点阵微状态表**：B 选项被否，不做点阵历史图。
6. **不做完整 logo 重设计**：Logo 图保留 `logo.png`。Sidebar 中 logo 区视觉调整（背景、间距、字号）不算 logo 重设。
7. **不做移动端适配**：Tauri 桌面应用，不部署 web，不做 mobile breakpoint。
8. **不做国际化 i18n**：保持中文文案，不引入 i18n 框架。
9. **不做主题自定义**：用户只能在「系统 / 暗色 / 浅色」三选，不暴露 token 自定义。
10. **不做高级动画库引入**：路由可视化的动画用 CSS keyframes + 少量 React state，不引入 framer-motion / GSAP。

---

## 决策树记录（Phase 1 Grill 留档）

为后续阶段（IA / Tokens / Tasks）保留上下文，本次重做的所有决策：

| 维度 | 决定 |
|------|------|
| 范围 | 视觉风格全面重做 + 允许新增组件（路由动画）+ 允许重写 fm-* CSS |
| 动机 | 不够开发者工具感 + 品牌识别度不足 |
| 风格哲学 | Linear / Vercel 极简派 |
| 品牌色 | #00a854 绿 — 保留但克制（CTA / active / focus / 路由动画） |
| 字体 | Geist Sans（西文）+ Geist Mono（数字/技术字符）+ NotoSansSC（中文，最小 14px） |
| 明暗 | 暗色为主场，浅色作为可选 |
| 密度 | Linear 密度——西文小字号、矩形按钮、紧凑间距、4-12px 圆角 |
| 辨识度抓手 | Geist Mono 数字 + 路由动画（招牌动作） |

---

_本 brief 由 `/design-flow` Phase 2 产出于 2026-05-25。后续阶段（Tokens / Tasks / Build）应以此为唯一真相源。_
