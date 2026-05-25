# Build Tasks: UI Redesign

Generated from: `.design/ui-redesign/DESIGN_BRIEF.md`
Tokens: `.design/ui-redesign/DESIGN_TOKENS.css`
Date: 2026-05-25
Philosophy: **Linear / Vercel 极简派 + 暗色开发者控制台 + 单点绿信号灯**

---

## 切片策略

每个任务都是一个**纵向切片**（结构 + 样式 + 交互），可独立构建、独立验证。
任务按"先地基再外观再交互再细节"排序：
- **F**oundation（地基）：tokens、字体、主题切换基础设施 — 一旦完成视觉系统就能落地
- **C**ore（核心 UI）：Sidebar / TopBar / RouteVisualizer 招牌 — 第一眼能看到的东西
- **P**ages（页面）：Providers / Logs / Settings 三页 — 主要内容区
- **D**etails（细节态）：modal / toast / tooltip / 边角组件
- **I**nteraction（交互态）：路由动画、状态切换、键盘/无障碍
- **R**eview（评审）：design review

---

## F. Foundation（地基）

> 这一组完成后，应用整体已经"看起来变了"，但功能完全等价。

- [ ] **F1. 安装 Geist 字体**
  通过 npm 包 `geist` 或本地放置 woff2 文件到 `public/fonts/`，在 `App.css` 顶部 import。验证：DevTools 中能看到 Geist 加载，所有西文/数字渲染为 Geist。
  _New asset._

- [ ] **F2. 用新 token 替换 App.css 的 :root**
  把 `.design/ui-redesign/DESIGN_TOKENS.css` 的内容合并进 `src/App.css`，删除被废弃的 legacy token（`--fm-canvas` / `--fm-surface-*` / 9 种 `--fm-block-*` / `--fm-magenta` 等）。Tailwind `@theme` 块同步更新。验证：应用可启动，整体颜色变深（暗色为主场），但布局不崩。
  _Modifies: `src/App.css`._

- [ ] **F3. 写入 Geist 字体到 body**
  body 默认 `font-family: var(--fm-font-sans)`；中文段落显式加 `.fm-text-zh` 类（虽然 NotoSansSC 在 stack 里 fallback，但中文最小 14px 由该类保证）。验证：页面所有西文/数字均为 Geist；中文区段 ≥14px。
  _Modifies: `App.css` body 规则。_

- [ ] **F4. 主题切换基础设施**
  新增 `src/lib/theme.ts`：暴露 `getTheme()` / `setTheme(mode: "system" | "dark" | "light")`。读写 localStorage `fm-theme`。`App.tsx` 启动时把 `data-theme` 属性写到 `<html>` 根元素。系统主题变化的 listener。验证：手动 `setTheme("light")` 控制台调用，应用立即变浅色。
  _New module + `App.tsx` integration._

- [ ] **F5. 重写 fm-btn-* 全套按钮样式**
  矩形 + `--fm-r-sm`(4px) 圆角 + 紧凑 padding (6×12 sm / 8×14 md)。primary / secondary / text / destructive 四种。focus-visible 用 `--fm-shadow-focus`。验证：四种按钮在暗色 + 浅色下视觉层级清晰，键盘 Tab 可见 ring。
  _Modifies: `App.css` .fm-btn-* 规则。_

- [ ] **F6. 重写 fm-input / fm-modal 样式**
  input：`--fm-bg-input` 凹陷感、`--fm-r-sm` 圆角、focus 用 primary ring。modal：`--fm-r-xl`(12px)、暗色版无重阴影靠 `--fm-border-default`。验证：编辑供应商弹窗、API Key 弹窗在新风格下不破。
  _Modifies: `App.css`._

- [ ] **F7. 重写 fm-card / fm-card-active 样式**
  暗色：`--fm-bg-elevated` + `--fm-border-default`，hover 升 `--fm-bg-hover` + `--fm-border-strong`。active 状态：左侧 2px 绿色竖条 + `--fm-border-emphasis` 绿色边 +`--fm-bg-active` 背景，**不用阴影发光**。浅色：保留极轻阴影。验证：ProvidersPage 三种状态视觉清晰。
  _Modifies: `App.css`._

---

## C. Core UI（核心招牌 + 主框架）

> 这一组完成后，应用第一眼的视觉就完全变了。

- [ ] **C1. RouteVisualizer 组件骨架**
  新建 `src/components/RouteVisualizer.tsx`。横向布局：左 `[:7860]` 端口标签 → 中段 SVG 流线 → 右 active provider 节点 + 下方 queued 节点列表。先用静态数据渲染骨架（不接动画、不订阅事件）。Geist Mono 字体。验证：在 TopBar 中央占位渲染。
  _New component._

- [ ] **C2. RouteVisualizer 接入实时数据**
  通过 `useRouteVisualization()` hook 读取 RouterState（active provider、queued items、exhausted indices）。订阅 Tauri `provider-switched` 事件。验证：手动从 ProvidersPage 切换路由，可视化条立即更新。
  _New hook + integration._

- [ ] **C3. RouteVisualizer 流动光点动画**
  active 段一颗 1px 绿光以 ~3s 周期从端口流向 active provider。CSS keyframe + `--fm-ease-flow`。`prefers-reduced-motion` 启用时禁用。验证：动画顺滑、不闪、CPU 占用 < 1%。
  _CSS only._

- [ ] **C4. RouteVisualizer 接力跳动画**
  监听 `provider-switched` 事件，旧 active 短暂闪红（200ms），绿色光迹在 300ms `--fm-ease-emphasis` 内跳到新 active 节点。验证：手动触发 429，路由条可见跳跃；新 active 节点高亮。
  _Hook + CSS。_

- [ ] **C5. 重写 Sidebar**
  暗色 `--fm-bg-surface` 底；菜单项矩形 `--fm-r-sm`、active 用左侧 2px 绿竖条 + `--fm-bg-active` + 绿文字（不用 shadow-sm）；底部链接图标极简化（移除背景，只留图标 + label）；Logo 区域字号收紧（`--fm-text-md` semibold + `--fm-text-xs` 副标题）。验证：暗色 / 浅色都不破。
  _Modifies: `Sidebar.tsx` className + `App.css`._

- [ ] **C6. 重写 TopBar**
  TopBar 内部三段：左（端口状态指示，Geist Mono）/ 中（**RouteVisualizer 占 C 位**）/ 右（四个应用注入开关）。开关压缩为 28×28 图标 + 14×24 mini Switch；关闭态灰度 + 60% 透明度。整条 TopBar 高度 48px（原约 56px）。验证：1280px 宽度下三段不挤；1024px 下中段优雅折叠。
  _Modifies: `TopBar.tsx`._

---

## P. Pages（页面级重做）

- [ ] **P1. ProvidersPage 网格 + 卡片重做**
  `fm-card` 已重写（F7），但卡片**内部内容**需要调整：标题用 `--fm-text-lg`、描述用 `--fm-text-zh`、模型 pill 区域更紧凑；网格 `gap` 从 16 收紧到 12；卡片 padding 16。模型 pill 高度 24px（原 28）、字号 `--fm-text-xs`、垂直分隔线变细。验证：同屏多容纳一行卡片、可读性不降。
  _Modifies: `ProvidersPage.tsx`._

- [ ] **P2. QueueTabs 重做为 Linear tab 风格**
  底部 2px 绿色下划线（active）；hover 1px 灰下划线；tab 间距 `--fm-space-7`(20)、字号 `--fm-text-md`。tab 内容：name + 当前 active item 的 model 名（`fm-text-caption` mono）。横向 overflow 滚动。"+ 新建队列"按钮变成 ghost-style（无背景，hover 才有）。验证：tab 切换有 200ms 缓动，路由可视化条同步更新。
  _Modifies: `QueueTabs.tsx`._

- [ ] **P3. QueueEditPanel 重做**
  紧凑化：内边距 16、行间距 12；拖拽手柄（grip）用 `--fm-text-4` 6 个点 mono 字符 `⋮⋮`；删除按钮变成图标按钮无背景；保存/取消按钮跟 F5 新风格一致。验证：拖拽体验顺滑、视觉层级清晰。
  _Modifies: `QueueEditPanel.tsx`._

- [ ] **P4. LogsPage 重做为 Linear 表格风格**
  整列固定宽度对齐：时间戳列（`fm-text-caption` mono）→ 状态码徽章（mono 12px、矩形 4px 圆角，绿/红/灰背景）→ 路由路径（mono）→ 内容预览（中文 `--fm-text-md`）。行高紧凑（28px），hover 整行轻微高亮 `--fm-bg-hover`。验证：100 条日志同屏不卡、对齐工整。
  _Modifies: `LogsPage.tsx`._

- [ ] **P5. SettingsPage + 主题切换 UI**
  新增"主题"分区：三段切换器（系统 / 暗色 / 浅色），调用 F4 的 `setTheme()`。其余设置项（端口、重试）按新 input 风格重排。验证：切换主题后路由可视化条颜色平滑过渡。
  _Modifies: `SettingsPage.tsx` + 接 F4。_

---

## D. Details（弹窗 / 提示 / 边角）

- [ ] **D1. AddProviderModal / AddModelModal / ApiKeyModal**
  跟 F6 新 modal 风格一致；表单输入紧凑；按钮组靠右；标题 `--fm-text-xl` semibold；中文描述 `--fm-text-zh`。验证：三个弹窗都不破。
  _Modifies: 三个 Modal 组件。_

- [ ] **D2. OnboardingModal**
  暗色友好；Logo 居中；按钮用新 primary 风格。验证：首次启动时视觉一致。
  _Modifies: `OnboardingModal.tsx`._

- [ ] **D3. ProviderInfoModal**
  跟 F6 新 modal 风格一致；信息列表用 `--fm-bg-input` 凹陷分组卡片。验证：无破图。
  _Modifies: `ProviderInfoModal.tsx`._

- [ ] **D4. Toast 重做**
  暗色 `--fm-bg-elevated` 底 + 左侧 2px 状态色竖条（绿/红/黄/蓝）+ `--fm-r-md` 圆角 + 极弱阴影。验证：四种 toast 类型视觉区分清晰、自动消失计时器仍工作。
  _Modifies: `components/ui/toast.*`._

- [ ] **D5. Tooltip 重做**
  暗色 tooltip：`--fm-bg-active` 背景 + `--fm-text-1` 文字 + `--fm-r-sm`。**浅色模式下也用深色 tooltip** 以保持识别度（设计决定）。`--fm-text-xs` 字号。验证：所有现有 tooltip 不破。
  _Modifies: `components/ui/tooltip.tsx`._

- [ ] **D6. Switch 组件**
  shadcn switch 通过 token 自动适配（已映射）；但 TopBar 的 mini switch 需要手动收紧尺寸到 24×14。验证：四个应用注入开关视觉精确。
  _Modifies: `components/ui/switch.tsx` + TopBar 调用。_

- [ ] **D7. 滚动条重做**
  保留"hover 才显示"策略，但绿色调整为新 `--fm-primary`；暗色模式下颜色对比度合理。验证：长列表滚动手感不变。
  _Modifies: `App.css` ::-webkit-scrollbar。_

---

## I. Interactions & Polish（交互态 + 无障碍）

- [ ] **I1. Provider 卡片状态机完整化**
  实现 idle / hover / active / exhausted / no-key 五种视觉态，并在 ProvidersPage 中正确使用。exhausted 模型 pill 加删除线 + 50% 透明度。no-key 卡片右上角"配置→"灰色按钮。验证：每种状态截图一遍存档。
  _Modifies: `ProvidersPage.tsx` 状态分支。_

- [ ] **I2. Focus ring 全局检查**
  确保所有可交互元素 `:focus-visible` 显示 2px 绿色 ring。键盘 Tab 走一遍：Sidebar → TopBar 开关 → 主区。验证：录屏 Tab 全程 ring 可见。
  _Polish across components._

- [ ] **I3. prefers-reduced-motion 验证**
  开启系统的"减少动画"，确认：路由流动光点禁用、接力跳变成纯色变化无过渡。验证：macOS 设置 + 重启 app 观察。
  _Test only._

- [ ] **I4. 路由可视化无障碍标签**
  RouteVisualizer 包 `<nav aria-label="当前路由路径">`，每个节点 `aria-label="端口 7860 路由到 LongCat，状态：活跃"`。`aria-live="polite"` 在 active 切换时读出。验证：VoiceOver 朗读符合预期。
  _Modifies: `RouteVisualizer.tsx`._

- [ ] **I5. 对比度审计**
  所有正文 ≥ 4.5:1，状态徽章 ≥ 3:1。重点检查暗色版的 `--fm-text-3` 在 `--fm-bg-canvas` 上、绿色在暗背景上。验证：用 axe DevTools 跑一遍，0 critical 问题。
  _Audit._

- [ ] **I6. 1024px 边界 fallback**
  窗口缩到 1024px 时：Provider 网格降为 2 列；RouteVisualizer 的 queued 列表只显示前 3 + "...还有 N 个"折叠。窗口缩到 <1024px 时：Sidebar 折叠为 48px 图标条。验证：从 1920px 拖到 800px，视觉持续优雅。
  _Modifies: 多组件 className with breakpoints._

---

## R. Review

- [ ] **R1. Run /design-review**
  跑 `design-review` skill 截图对照 brief，记录发现到 `.design/ui-redesign/DESIGN_REVIEW.md`。
  _Tooling._

- [ ] **R2. 修复 must-fix 项**
  根据 review 反馈修复优先级最高的问题。
  _Polish._

- [ ] **R3. 文档同步**
  更新 `CLAUDE.md` 中的 "UI 设计系统" 一节，反映新 token 命名和组件清单变化。考虑生成一份 `DESIGN.md`（CLAUDE.md 提到但当前不存在）作为运行手册。
  _Documentation._

---

## 依赖关系（关键路径）

```
F1 (字体) ──┐
F2 (token) ─┼─→ F3 ──→ F5/F6/F7 ──→ C1..C6 ──→ P1..P5 ──→ D1..D7 ──→ I1..I6 ──→ R1..R3
F4 (主题) ──┘                               (招牌+框架先行，页面在后)
```

**第一步必做**：F1 → F2 → F3 → F4 完成后才有视觉系统支撑。

**最有风险**：C1..C4（RouteVisualizer + 动画）—— 这是新组件 + 新动画 + 接 Tauri 事件。**早做**，让风险尽早暴露。

**最容易跳过被忽视**：I3 (减少动画) / I5 (对比度) / D7 (滚动条) —— 这些容易被忘，必须在 review 前明确勾掉。

---

## 实施顺序建议（按 session 切分）

| Session | 内容 | 验收 |
|---|---|---|
| **Session 1** | F1 + F2 + F3 + F4 | 应用换色完毕，主题可切换；按钮卡片暂时还旧风格 |
| **Session 2** | F5 + F6 + F7 | 按钮、表单、卡片视觉到位 |
| **Session 3** | C1 + C2 + C3 + C4 | RouteVisualizer 招牌完成（**风险最高**） |
| **Session 4** | C5 + C6 | Sidebar / TopBar 重做 |
| **Session 5** | P1 + P2 + P3 | Providers + Queue 区域 |
| **Session 6** | P4 + P5 | Logs + Settings |
| **Session 7** | D1..D7 | 弹窗、Toast、Tooltip 等细节 |
| **Session 8** | I1..I6 | 交互态 + 无障碍打磨 |
| **Session 9** | R1..R3 | Review + 修复 + 文档 |
