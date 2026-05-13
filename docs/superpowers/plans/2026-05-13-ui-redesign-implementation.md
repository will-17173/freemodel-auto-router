# freemodel-auto-router UI 重设计实现计划

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 将界面从上下堆叠布局改为左右分栏布局，引入 shadcn/ui 组件库，采用 Airbnb 配色方案。

**Architecture:** 左侧固定 Sidebar (200px) + 右侧内容区（顶部状态栏 + 页面内容），使用 shadcn/ui 组件替换所有自定义 CSS 类。

**Tech Stack:** React 19, shadcn/ui, Tailwind CSS v4, @dnd-kit (保留), Tauri

---

## Phase 1: 安装依赖与配置

### Task 1: 安装 shadcn/ui 所需依赖

**Objective:** 安装 shadcn/ui 核心依赖包

**Files:**
- Modify: `package.json`

**Step 1: 安装依赖**

```bash
cd /Volumes/T7/Code/freemodel-auto-router
pnpm add class-variance-authority clsx tailwind-merge lucide-react
pnpm add @radix-ui/react-dialog @radix-ui/react-switch @radix-ui/react-scroll-area @radix-ui/react-tooltip @radix-ui/react-slot
```

**Step 2: 验证安装成功**

Run: `cat package.json | grep -E "class-variance|clsx|tailwind-merge|lucide-react|radix-ui"`
Expected: 显示所有新增依赖

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add shadcn/ui dependencies"
```

---

### Task 2: 创建 utils.ts 工具文件

**Objective:** 创建 shadcn/ui 的 cn() helper 函数

**Files:**
- Create: `src/lib/utils.ts`

**Step 1: 创建文件**

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

**Step 2: 验证文件创建**

Run: `cat src/lib/utils.ts`
Expected: 显示上述内容

**Step 3: Commit**

```bash
git add src/lib/utils.ts
git commit -m "chore: add cn() helper for shadcn/ui"
```

---

### Task 3: 创建 shadcn/ui Button 组件

**Objective:** 创建 Button 组件（primary/secondary/ghost/outline 变体）

**Files:**
- Create: `src/components/ui/button.tsx`

**Step 1: 创建 Button 组件**

```tsx
// src/components/ui/button.tsx
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline:
          "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
```

**Step 2: 验证文件创建**

Run: `ls src/components/ui/button.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat: add shadcn/ui Button component"
```

---

### Task 4: 创建 shadcn/ui Card 组件

**Objective:** 创建 Card 组件用于供应商卡片

**Files:**
- Create: `src/components/ui/card.tsx`

**Step 1: 创建 Card 组件**

```tsx
// src/components/ui/card.tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

**Step 2: 验证文件创建**

Run: `ls src/components/ui/card.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat: add shadcn/ui Card component"
```

---

### Task 5: 创建 shadcn/ui Badge 组件

**Objective:** 创建 Badge 组件用于模型标签、状态指示

**Files:**
- Create: `src/components/ui/badge.tsx`

**Step 1: 创建 Badge 组件**

```tsx
// src/components/ui/badge.tsx
import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.75 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
        outline: "text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

**Step 2: 验证文件创建**

Run: `ls src/components/ui/badge.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "feat: add shadcn/ui Badge component"
```

---

### Task 6: 创建 shadcn/ui Switch 组件

**Objective:** 创建 Switch 组件用于 App Toggle

**Files:**
- Create: `src/components/ui/switch.tsx`

**Step 1: 创建 Switch 组件**

```tsx
// src/components/ui/switch.tsx
import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
```

**Step 2: 验证文件创建**

Run: `ls src/components/ui/switch.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/ui/switch.tsx
git commit -m "feat: add shadcn/ui Switch component"
```

---

### Task 7: 创建 shadcn/ui Input 组件

**Objective:** 创建 Input 组件用于表单

**Files:**
- Create: `src/components/ui/input.tsx`

**Step 1: 创建 Input 组件**

```tsx
// src/components/ui/input.tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
```

**Step 2: 验证文件创建**

Run: `ls src/components/ui/input.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/ui/input.tsx
git commit -m "feat: add shadcn/ui Input component"
```

---

### Task 8: 创建 shadcn/ui Dialog 组件

**Objective:** 创建 Dialog 组件用于 Modal

**Files:**
- Create: `src/components/ui/dialog.tsx`

**Step 1: 创建 Dialog 组件**

```tsx
// src/components/ui/dialog.tsx
import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-xl",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
```

**Step 2: 验证文件创建**

Run: `ls src/components/ui/dialog.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat: add shadcn/ui Dialog component"
```

---

### Task 9: 创建 shadcn/ui ScrollArea 组件

**Objective:** 创建 ScrollArea 组件用于日志面板

**Files:**
- Create: `src/components/ui/scroll-area.tsx`

**Step 1: 创建 ScrollArea 组件**

```tsx
// src/components/ui/scroll-area.tsx
import * as React from "react"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"
import { cn } from "@/lib/utils"

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    className={cn("relative overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
))
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      "flex touch-none select-none transition-colors",
      orientation === "vertical" &&
        "h-full w-2.5 border-l border-l-transparent p-[1px]",
      orientation === "horizontal" &&
        "h-2.5 flex-col border-t border-t-transparent p-[1px]",
      className
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
```

**Step 2: 验证文件创建**

Run: `ls src/components/ui/scroll-area.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/ui/scroll-area.tsx
git commit -m "feat: add shadcn/ui ScrollArea component"
```

---

### Task 10: 配置 Vite 路径别名

**Objective:** 配置 `@/` 路径别名以支持 shadcn/ui 的 import 路径

**Files:**
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`

**Step 1: 查看现有 vite.config.ts**

Run: `cat vite.config.ts`
Expected: 显示现有配置

**Step 2: 修改 vite.config.ts 添加路径别名**

找到 `vite.config.ts` 中的 `resolve.alias` 配置，添加：

```typescript
// 在 vite.config.ts 中
import path from "path"

// 在 defineConfig 内添加
resolve: {
  alias: {
    "@": path.resolve(__dirname, "./src"),
  },
},
```

**Step 3: 修改 tsconfig.json 添加路径映射**

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Step 4: 验证配置**

Run: `pnpm tsc --noEmit`
Expected: 无报错

**Step 5: Commit**

```bash
git add vite.config.ts tsconfig.json
git commit -m "chore: configure @ path alias for shadcn/ui"
```

---

### Task 11: 更新 CSS 主题变量

**Objective:** 将 App.css 替换为 shadcn/ui CSS 变量 + Airbnb 配色

**Files:**
- Modify: `src/App.css`

**Step 1: 清空现有 CSS 并替换**

```css
/* src/App.css */
@import "tailwindcss";

/* Airbnb 配色映射到 shadcn/ui CSS 变量 */
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
  --radius: 0.875rem;                /* 14px */
}

* {
  border-color: hsl(var(--border));
}

body {
  background-color: hsl(var(--background));
  color: hsl(var(--foreground));
  font-family: system-ui, -apple-system, sans-serif;
}

/* 保留字体定义 */
@font-face {
  font-family: "ShareTechMono";
  src: url("./assets/fonts/ShareTechMono-Regular.ttf") format("truetype");
  font-weight: 400;
  font-style: normal;
}

@font-face {
  font-family: "MonuTitl";
  src: url("./assets/fonts/MonuTitl-0.95CnMd.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
}
```

**Step 2: 验证样式**

Run: `pnpm dev` (手动启动，检查页面是否正常显示)

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "style: replace custom CSS with shadcn/ui Airbnb theme"
```

---

## Phase 2: 创建布局组件

### Task 12: 创建 Sidebar 组件

**Objective:** 创建左侧导航菜单组件

**Files:**
- Create: `src/components/Sidebar.tsx`

**Step 1: 创建 Sidebar 组件**

```tsx
// src/components/Sidebar.tsx
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  LayoutGrid,
  ListOrdered,
  FileText,
  Settings,
} from "lucide-react"

export type PageId = "providers" | "queue" | "logs" | "settings"

interface SidebarProps {
  currentPage: PageId
  onPageChange: (page: PageId) => void
}

const menuItems: { id: PageId; label: string; icon: React.ReactNode }[] = [
  { id: "providers", label: "供应商", icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "queue", label: "路由队列", icon: <ListOrdered className="h-4 w-4" /> },
  { id: "logs", label: "日志", icon: <FileText className="h-4 w-4" /> },
  { id: "settings", label: "设置", icon: <Settings className="h-4 w-4" /> },
]

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  return (
    <div className="w-[200px] h-full bg-secondary border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-5">
        <div className="font-semibold text-base text-foreground">freemodel</div>
        <div className="text-xs text-muted-foreground">auto-router</div>
      </div>

      {/* Menu items */}
      <nav className="flex flex-col gap-1 px-3">
        {menuItems.map((item) => (
          <Button
            key={item.id}
            variant="ghost"
            className={cn(
              "justify-start gap-2",
              currentPage === item.id && "bg-background border border-border font-medium"
            )}
            onClick={() => onPageChange(item.id)}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </nav>
    </div>
  )
}
```

**Step 2: 验证文件创建**

Run: `ls src/components/Sidebar.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat: add Sidebar navigation component"
```

---

### Task 13: 创建 TopBar 组件

**Objective:** 创建顶部状态栏 + App Toggle 开关组件

**Files:**
- Create: `src/components/TopBar.tsx`

**Step 1: 创建 TopBar 组件**

```tsx
// src/components/TopBar.tsx
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

interface AppToggleProps {
  id: string
  label: string
  enabled: boolean
  disabled?: boolean
  onToggle: (enabled: boolean) => void
}

function AppToggle({ id, label, enabled, disabled, onToggle }: AppToggleProps) {
  return (
    <div className={cn(
      "flex items-center gap-1.5",
      disabled && "opacity-50"
    )}>
      <div className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-semibold",
        enabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}>
        {label}
      </div>
      <Switch
        checked={enabled}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </div>
  )
}

interface TopBarProps {
  port: number
  isActive: boolean
  appStates: {
    cc: boolean
    codex: boolean
    hermes: boolean
    openclaw: boolean
  }
  onAppToggle: (appId: string, enabled: boolean) => void
}

export function TopBar({ port, isActive, appStates, onAppToggle }: TopBarProps) {
  return (
    <div className="h-14 px-6 bg-background border-b border-border flex items-center justify-between">
      {/* Server status */}
      <div className="flex items-center gap-2">
        <Badge variant={isActive ? "default" : "secondary"} className="gap-1">
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            isActive ? "bg-primary-foreground" : "bg-muted-foreground"
          )} />
          {isActive ? "运行中" : "已停止"}
        </Badge>
        <span className="text-xs text-muted-foreground font-mono">:{port}</span>
      </div>

      {/* App toggles */}
      <div className="flex items-center gap-3">
        <AppToggle
          id="cc"
          label="CC"
          enabled={appStates.cc}
          disabled={!isActive}
          onToggle={(e) => onAppToggle("cc", e)}
        />
        <AppToggle
          id="codex"
          label="CX"
          enabled={appStates.codex}
          disabled={!isActive}
          onToggle={(e) => onAppToggle("codex", e)}
        />
        <AppToggle
          id="hermes"
          label="H"
          enabled={appStates.hermes}
          disabled={!isActive}
          onToggle={(e) => onAppToggle("hermes", e)}
        />
        <AppToggle
          id="openclaw"
          label="OC"
          enabled={appStates.openclaw}
          disabled={!isActive}
          onToggle={(e) => onAppToggle("openclaw", e)}
        />
      </div>
    </div>
  )
}
```

**Step 2: 验证文件创建**

Run: `ls src/components/TopBar.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/TopBar.tsx
git commit -m "feat: add TopBar with server status and app toggles"
```

---

## Phase 3: 创建页面组件

### Task 14: 创建 ProvidersPage 组件

**Objective:** 创建供应商页面组件

**Files:**
- Create: `src/components/ProvidersPage.tsx`

**Step 1: 创建 ProvidersPage 组件**

```tsx
// src/components/ProvidersPage.tsx
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Key, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Provider } from "@/types"

interface ProvidersPageProps {
  providers: Provider[]
  authMap: Record<string, boolean>
  activeProviderId: string | null
  onAddToQueue: (providerId: string, modelId: string) => void
  onConfigKey: (providerId: string) => void
  onAddModel: (providerId: string) => void
  onAddProvider: () => void
}

export function ProvidersPage({
  providers,
  authMap,
  activeProviderId,
  onAddToQueue,
  onConfigKey,
  onAddModel,
  onAddProvider,
}: ProvidersPageProps) {
  return (
    <div className="flex-1 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-semibold">供应商</h1>
        <Button onClick={onAddProvider} size="sm" className="gap-1">
          <Plus className="h-3.5 w-3.5" />
          添加
        </Button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4">
        {providers.map((provider) => (
          <Card
            key={provider.id}
            className={cn(
              "relative",
              activeProviderId === provider.id && "border-primary"
            )}
          >
            {activeProviderId === provider.id && (
              <div className="absolute top-0 left-6 right-6 h-[3px] bg-primary rounded-b" />
            )}
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {activeProviderId === provider.id && (
                    <span className="w-2 h-2 rounded-full bg-primary" />
                  )}
                  <CardTitle className="text-base">{provider.name}</CardTitle>
                </div>
                <Button
                  variant={authMap[provider.id] ? "secondary" : "outline"}
                  size="sm"
                  className="gap-1"
                  onClick={() => onConfigKey(provider.id)}
                >
                  {authMap[provider.id] ? (
                    <>
                      <Check className="h-3 w-3" />
                      Key ✓
                    </>
                  ) : (
                    <>
                      <Key className="h-3 w-3" />
                      配置 Key
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {provider.models.map((model) => (
                  <Badge
                    key={model.id}
                    variant="secondary"
                    className={cn(
                      "gap-1 cursor-pointer",
                      authMap[provider.id] && "hover:bg-primary hover:text-primary-foreground"
                    )}
                    onClick={() => authMap[provider.id] && onAddToQueue(provider.id, model.id)}
                  >
                    {model.name}
                    <Plus className="h-3 w-3" />
                  </Badge>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onAddModel(provider.id)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Add provider placeholder */}
        <button
          onClick={onAddProvider}
          className="h-[120px] border border-dashed border-border rounded-xl flex items-center justify-center text-sm text-muted-foreground hover:border-primary hover:bg-secondary transition-colors"
        >
          + 添加供应商
        </button>
      </div>
    </div>
  )
}
```

**Step 2: 验证文件创建**

Run: `ls src/components/ProvidersPage.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/ProvidersPage.tsx
git commit -m "feat: add ProvidersPage component"
```

---

### Task 15: 创建 QueuePage 组件

**Objective:** 创建路由队列页面组件

**Files:**
- Create: `src/components/QueuePage.tsx`

**Step 1: 创建 QueuePage 组件**

```tsx
// src/components/QueuePage.tsx
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { X, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { QueueItem, Provider, QueueStateInfo } from "@/types"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

interface QueuePageProps {
  items: QueueItem[]
  providers: Provider[]
  stateInfo: QueueStateInfo | undefined
  onReorder: (items: QueueItem[]) => void
  onRemove: (index: number) => void
  onResetExhausted: () => void
}

function SortableQueueItem({
  item,
  index,
  label,
  isActive,
  isExhausted,
  onRemove,
}: {
  item: QueueItem
  index: number
  label: string
  isActive: boolean
  isExhausted: boolean
  onRemove: (i: number) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: `${item.provider_id}::${item.model_id}::${index}` })

  return (
    <Badge
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : isExhausted ? 0.4 : 1,
      }}
      variant={isActive ? "default" : "secondary"}
      className={cn(
        "gap-2 py-2.5 px-4",
        isExhausted && "bg-muted"
      )}
    >
      <span {...attributes} {...listeners} className="cursor-grab">
        <GripVertical className="h-3 w-3" />
      </span>
      <span className="font-medium">{index + 1}. {label}</span>
      {isActive && !isExhausted && (
        <Badge variant="outline" className="bg-primary-foreground text-primary text-[10px] px-1.5">
          当前
        </Badge>
      )}
      {isExhausted && (
        <Badge variant="outline" className="bg-muted-foreground text-background text-[10px] px-1.5">
          已用尽
        </Badge>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-4 w-4 p-0 hover:text-destructive"
        onClick={() => onRemove(index)}
      >
        <X className="h-3 w-3" />
      </Button>
    </Badge>
  )
}

export function QueuePage({
  items,
  providers,
  stateInfo,
  onReorder,
  onRemove,
  onResetExhausted,
}: QueuePageProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const ids = items.map((item, i) => `${item.provider_id}::${item.model_id}::${i}`)
  const activeIdx = stateInfo?.active_idx ?? 0
  const exhaustedIndices = stateInfo?.exhausted_indices ?? []

  function getLabel(item: QueueItem) {
    const provider = providers.find((p) => p.id === item.provider_id)
    const model = provider?.models.find((m) => m.id === item.model_id)
    return `${provider?.name ?? item.provider_id} / ${model?.name ?? item.model_id}`
  }

  function handleDragEnd(event: any) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = ids.indexOf(active.id)
    const newIdx = ids.indexOf(over.id)
    if (oldIdx !== -1 && newIdx !== -1) {
      onReorder(arrayMove(items, oldIdx, newIdx))
    }
  }

  const hasExhausted = exhaustedIndices.length > 0

  return (
    <div className="flex-1 p-6 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">路由队列</h1>
        {hasExhausted && (
          <Button variant="ghost" size="sm" onClick={onResetExhausted}>
            重置用尽项
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          点击供应商页面的模型 + 添加到队列
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            <div className="flex flex-wrap gap-3">
              {items.map((item, i) => (
                <SortableQueueItem
                  key={ids[i]}
                  item={item}
                  index={i}
                  label={getLabel(item)}
                  isActive={i === activeIdx}
                  isExhausted={exhaustedIndices.includes(i)}
                  onRemove={onRemove}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
```

**Step 2: 验证文件创建**

Run: `ls src/components/QueuePage.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/QueuePage.tsx
git commit -m "feat: add QueuePage component with drag-and-drop"
```

---

### Task 16: 创建 LogsPage 组件

**Objective:** 创建日志页面组件

**Files:**
- Create: `src/components/LogsPage.tsx`

**Step 1: 创建 LogsPage 组件**

```tsx
// src/components/LogsPage.tsx
import { useEffect, useState } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { ProxyLogEntry } from "@/types"
import { getProxyLogs } from "@/api"

interface LogsPageProps {
  port: number
}

function formatTime(ms: number) {
  const date = new Date(ms)
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

function getStatusColor(level: string) {
  switch (level) {
    case "error": return "bg-destructive text-destructive-foreground"
    case "warn": return "bg-yellow-500 text-white"
    default: return "bg-secondary text-secondary-foreground"
  }
}

export function LogsPage({ port }: LogsPageProps) {
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
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/50 text-sm"
            >
              <span className="text-muted-foreground font-mono text-xs">
                {formatTime(log.timestamp_ms)}
              </span>
              <Badge variant="outline" className={cn("text-xs", getStatusColor(log.level))}>
                {log.level}
              </Badge>
              <span className="text-foreground truncate">{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              暂无日志记录
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
```

**Step 2: 验证文件创建**

Run: `ls src/components/LogsPage.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/LogsPage.tsx
git commit -m "feat: add LogsPage component"
```

---

### Task 17: 创建 SettingsPage 组件

**Objective:** 创建设置页面组件

**Files:**
- Create: `src/components/SettingsPage.tsx`

**Step 1: 创建 SettingsPage 组件**

```tsx
// src/components/SettingsPage.tsx
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card"
import type { RetryConfig } from "@/types"

interface SettingsPageProps {
  retry: RetryConfig
  port: number
  onSave: (retry: RetryConfig, newPort: number, portChanged: boolean) => void
}

export function SettingsPage({ retry, port, onSave }: SettingsPageProps) {
  const [maxRetries, setMaxRetries] = useState(String(retry.max_retries))
  const [retryDelay, setRetryDelay] = useState(String(retry.retry_delay_secs))
  const [portValue, setPortValue] = useState(String(port))
  const [saving, setSaving] = useState(false)

  function handleSave() {
    const max = parseInt(maxRetries, 10)
    const delay = parseInt(retryDelay, 10)
    const newPort = parseInt(portValue, 10)
    if (isNaN(max) || isNaN(delay) || isNaN(newPort) || max < 0 || delay < 0 || newPort < 1 || newPort > 65535) return

    const portChanged = newPort !== port
    setSaving(true)
    onSave({ max_retries: max, retry_delay_secs: delay }, newPort, portChanged)
    setSaving(false)
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      <h1 className="text-lg font-semibold mb-4">设置</h1>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-base">全局设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">监听端口</label>
            <Input
              type="number"
              min={1}
              max={65535}
              value={portValue}
              onChange={(e) => setPortValue(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">最大重试次数</label>
            <Input
              type="number"
              min={0}
              max={10}
              value={maxRetries}
              onChange={(e) => setMaxRetries(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">重试间隔（秒）</label>
            <Input
              type="number"
              min={0}
              max={60}
              value={retryDelay}
              onChange={(e) => setRetryDelay(e.target.value)}
              className="font-mono"
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "保存中..." : "保存"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
```

**Step 2: 验证文件创建**

Run: `ls src/components/SettingsPage.tsx`
Expected: 文件存在

**Step 3: Commit**

```bash
git add src/components/SettingsPage.tsx
git commit -m "feat: add SettingsPage component"
```

---

## Phase 4: 重构 Modal 组件

### Task 18: 重构 AddProviderModal 使用 shadcn/ui Dialog

**Objective:** 使用 shadcn/ui Dialog 重构添加供应商 Modal

**Files:**
- Modify: `src/components/AddProviderModal.tsx`

**Step 1: 重构 AddProviderModal**

查看现有 AddProviderModal.tsx 的逻辑，替换 UI 为 shadcn/ui Dialog + Input + Button。

关键变更：
- 将 `fm-modal-overlay` 替换为 `Dialog` 组件
- 将 `fm-input` 替换为 `Input` 组件
- 将 `fm-btn-primary` 替换为 `Button` 组件

**Step 2: 验证组件工作**

Run: `pnpm dev` 手动测试添加供应商功能

**Step 3: Commit**

```bash
git add src/components/AddProviderModal.tsx
git commit -m "refactor: update AddProviderModal to use shadcn/ui Dialog"
```

---

### Task 19: 重构 ApiKeyModal 使用 shadcn/ui Dialog

**Objective:** 使用 shadcn/ui Dialog 重构 API Key 输入 Modal

**Files:**
- Modify: `src/components/ApiKeyModal.tsx`

**Step 1: 重构 ApiKeyModal**

将现有 Modal 替换为 shadcn/ui Dialog + Input + Button。

**Step 2: 验证组件工作**

手动测试 API Key 配置功能。

**Step 3: Commit**

```bash
git add src/components/ApiKeyModal.tsx
git commit -m "refactor: update ApiKeyModal to use shadcn/ui Dialog"
```

---

### Task 20: 重构 AddModelModal 使用 shadcn/ui Dialog

**Objective:** 使用 shadcn/ui Dialog 重构添加模型 Modal

**Files:**
- Modify: `src/components/AddModelModal.tsx`

**Step 1: 重构 AddModelModal**

将现有 Modal 替换为 shadcn/ui Dialog。

**Step 2: Commit**

```bash
git add src/components/AddModelModal.tsx
git commit -m "refactor: update AddModelModal to use shadcn/ui Dialog"
```

---

## Phase 5: 重构 App.tsx 主布局

### Task 21: 重构 App.tsx 使用新布局

**Objective:** 将 App.tsx 从上下堆叠布局改为左右分栏布局

**Files:**
- Modify: `src/App.tsx`

**Step 1: 引入新组件**

```tsx
// 在 App.tsx 中引入新组件
import { Sidebar, type PageId } from "./components/Sidebar"
import { TopBar } from "./components/TopBar"
import { ProvidersPage } from "./components/ProvidersPage"
import { QueuePage } from "./components/QueuePage"
import { LogsPage } from "./components/LogsPage"
import { SettingsPage } from "./components/SettingsPage"
```

**Step 2: 添加 currentPage state**

```tsx
const [currentPage, setCurrentPage] = useState<PageId>("providers")
```

**Step 3: 重构 return 部分**

将现有的布局替换为：

```tsx
return (
  <div className="h-screen flex bg-background text-foreground">
    {/* Sidebar */}
    <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

    {/* Main content */}
    <div className="flex-1 flex flex-col">
      {/* TopBar */}
      <TopBar
        port={config.port}
        isActive={isActive}
        appStates={appStates}
        onAppToggle={handleAppToggle}
      />

      {/* Page content */}
      {currentPage === "providers" && (
        <ProvidersPage
          providers={config.providers}
          authMap={authMap}
          activeProviderId={activeQueueItem?.provider_id}
          onAddToQueue={addToQueue}
          onConfigKey={setEditingKeyProviderId}
          onAddModel={setAddingModelProviderId}
          onAddProvider={() => setShowAddProvider(true)}
        />
      )}
      {currentPage === "queue" && selectedQueueId && (
        <QueuePage
          items={config.queues[selectedQueueId]?.items ?? []}
          providers={config.providers}
          stateInfo={queueStates[selectedQueueId]}
          onReorder={(items) => reorderQueue(selectedQueueId, items)}
          onRemove={(i) => removeFromQueue(selectedQueueId, i)}
          onResetExhausted={() => handleResetQueueExhausted(selectedQueueId)}
        />
      )}
      {currentPage === "logs" && (
        <LogsPage port={config.port} />
      )}
      {currentPage === "settings" && (
        <SettingsPage
          retry={config.retry}
          port={config.port}
          onSave={(retry, newPort, portChanged) => {
            // ... 保存逻辑
          }}
        />
      )}
    </div>

    {/* Modals */}
    {showAddProvider && <AddProviderModal ... />}
    {editingKeyProviderId && <ApiKeyModal ... />}
    {addingModelProviderId && <AddModelModal ... />}
  </div>
)
```

**Step 4: 验证布局**

Run: `pnpm tauri dev` 手动测试所有页面导航功能

**Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: restructure App.tsx to sidebar + content layout"
```

---

### Task 22: 移除旧组件文件

**Objective:** 移除不再使用的旧组件

**Files:**
- Delete: `src/components/QueuePanel.tsx`
- Delete: `src/components/QueueDetailPanel.tsx`
- Delete: `src/components/QueueManagerPanel.tsx`
- Delete: `src/components/SettingsModal.tsx`
- Delete: `src/components/ProxyLogPanel.tsx`
- Delete: `src/components/AppToggle.tsx`

**Step 1: 确认新布局正常工作后再删除旧文件**

```bash
rm src/components/QueuePanel.tsx
rm src/components/QueueDetailPanel.tsx
rm src/components/QueueManagerPanel.tsx
rm src/components/SettingsModal.tsx
rm src/components/ProxyLogPanel.tsx
rm src/components/AppToggle.tsx
```

**Step 2: Commit**

```bash
git add -A
git commit -m "chore: remove deprecated components after layout refactor"
```

---

### Task 23: 最终验证与测试

**Objective:** 验证所有功能正常工作

**Step 1: 启动应用并测试所有功能**

Run: `pnpm tauri dev`

测试清单：
- [ ] Sidebar 导航切换正常
- [ ] TopBar 状态显示正确
- [ ] App Toggle 开关工作正常
- [ ] 供应商页面：卡片显示、添加供应商、配置 Key、添加模型
- [ ] 路由队列页面：拖拽排序、移除项、重置用尽
- [ ] 日志页面：滚动显示、实时更新
- [ ] 设置页面：保存参数、端口修改重启

**Step 2: 修复发现的问题**

如有问题，按 TDD 方式修复。

**Step 3: 最终 Commit**

```bash
git add -A
git commit -m "fix: resolve issues from final testing"
```

---

## 实现顺序总结

1. **Phase 1** (Tasks 1-11): 安装依赖、配置主题
2. **Phase 2** (Tasks 12-13): 创建布局组件 (Sidebar, TopBar)
3. **Phase 3** (Tasks 14-17): 创建页面组件
4. **Phase 4** (Tasks 18-20): 重构 Modal 组件
5. **Phase 5** (Tasks 21-23): 重构 App.tsx、清理旧文件、最终测试

---

## 验收标准

- 所有页面可通过 Sidebar 导航切换
- TopBar 显示服务器状态和 App Toggle
- 供应商卡片使用 shadcn/ui Card + Badge
- 路由队列支持拖拽排序
- Modal 使用 shadcn/ui Dialog
- 配色符合 Airbnb 设计系统（Rausch #ff385c）
- 仅 Light 模式，无 dark mode