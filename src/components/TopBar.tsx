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

function AppToggle({ id: _id, label, enabled, disabled, onToggle }: AppToggleProps) {
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
        <AppToggle id="cc" label="CC" enabled={appStates.cc} disabled={!isActive} onToggle={(e) => onAppToggle("cc", e)} />
        <AppToggle id="codex" label="CX" enabled={appStates.codex} disabled={!isActive} onToggle={(e) => onAppToggle("codex", e)} />
        <AppToggle id="hermes" label="H" enabled={appStates.hermes} disabled={!isActive} onToggle={(e) => onAppToggle("hermes", e)} />
        <AppToggle id="openclaw" label="OC" enabled={appStates.openclaw} disabled={!isActive} onToggle={(e) => onAppToggle("openclaw", e)} />
      </div>
    </div>
  )
}
