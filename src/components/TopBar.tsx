import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import hermesImg from "@/assets/images/hermes.png"
import openclawImg from "@/assets/images/openclaw.png"
import codexImg from "@/assets/images/codex-color.png"
import claudecodeImg from "@/assets/images/claudecode-color.png"

interface AppToggleProps {
  id: string
  label: string
  enabled: boolean
  disabled?: boolean
  onToggle: (enabled: boolean) => void
  iconUrl?: string
}

function AppToggle({ id: _id, label, enabled, disabled, onToggle, iconUrl }: AppToggleProps) {
  return (
    <div className={cn(
      "flex items-center gap-1.5",
      disabled && "opacity-50"
    )}>
      <div className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center overflow-hidden",
        enabled ? "bg-primary" : "bg-muted",
        !iconUrl && (enabled ? "text-primary-foreground text-[10px] font-semibold" : "text-muted-foreground text-[10px] font-semibold")
      )}>
        {iconUrl ? (
          <img src={iconUrl} alt={label} className="h-6 w-6 object-contain" />
        ) : (
          <span className={cn("text-[10px] font-semibold", enabled ? "text-primary-foreground" : "text-muted-foreground")}>
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
    <div className="h-12 px-5 bg-card border-b border-border flex items-center justify-between shrink-0">
      {/* Server status */}
      <div className="flex items-center gap-2">
        <span className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
          isActive
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}>
          <span className={cn(
            "w-1.5 h-1.5 rounded-full",
            isActive ? "bg-primary-foreground" : "bg-muted-foreground"
          )} />
          {isActive ? "运行中" : "已停止"}
        </span>
        <span className="text-xs text-muted-foreground font-mono">:{port}</span>
      </div>

      {/* App toggles */}
      <div className="flex items-center gap-3">
        <AppToggle id="cc" label="Claude Code" iconUrl={claudecodeImg} enabled={appStates.cc} disabled={!isActive} onToggle={(e) => onAppToggle("cc", e)} />
        <AppToggle id="codex" label="Codex" iconUrl={codexImg} enabled={appStates.codex} disabled={!isActive} onToggle={(e) => onAppToggle("codex", e)} />
        <AppToggle id="hermes" label="H" iconUrl={hermesImg} enabled={appStates.hermes} disabled={!isActive} onToggle={(e) => onAppToggle("hermes", e)} />
        <AppToggle id="openclaw" label="OC" iconUrl={openclawImg} enabled={appStates.openclaw} disabled={!isActive} onToggle={(e) => onAppToggle("openclaw", e)} />
      </div>
    </div>
  )
}
