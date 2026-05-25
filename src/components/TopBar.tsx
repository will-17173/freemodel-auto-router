import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { RouteVisualizer } from "@/components/RouteVisualizer"
import { useRouteVisualization } from "@/lib/useRouteVisualization"
import hermesImg from "@/assets/images/hermes.png"
import openclawImg from "@/assets/images/openclaw.png"
import codexImg from "@/assets/images/codex-color.png"
import claudecodeImg from "@/assets/images/claudecode-color.png"
import type { AppConfig, Provider, QueueStateInfo, AppInstallations } from "@/types"

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
    <div className={cn("flex items-center gap-1", disabled && "opacity-40 cursor-not-allowed")}>
      <div
        className={cn(
          "w-6 h-6 rounded flex items-center justify-center overflow-hidden flex-shrink-0",
          !enabled && "grayscale opacity-60",
          disabled && "grayscale"
        )}
      >
        {iconUrl ? (
          <img src={iconUrl} alt={label} className="h-5 w-5 object-contain" />
        ) : (
          <span className="text-[9px] font-semibold" style={{ color: "var(--fm-text-3)" }}>
            {label}
          </span>
        )}
      </div>
      <Switch
        checked={enabled}
        disabled={disabled}
        onCheckedChange={onToggle}
        className="h-4 w-7 data-[state=checked]:bg-[var(--fm-primary)] data-[state=unchecked]:bg-[var(--fm-bg-active)]"
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
  appInstallations: AppInstallations | null
  config: AppConfig
  providers: Provider[]
  queueStates: Record<string, QueueStateInfo>
}

export function TopBar({
  port: _port,
  isActive,
  appStates,
  onAppToggle,
  appInstallations,
  config,
  providers,
  queueStates,
}: TopBarProps) {
  const ccInstalled = appInstallations?.cc.installed ?? false
  const hermesInstalled = appInstallations?.hermes.installed ?? false
  const openclawInstalled = appInstallations?.openclaw.installed ?? false

  const routeState = useRouteVisualization(config, providers, queueStates)

  return (
    <div
      className="h-12 px-4 flex items-center gap-3 shrink-0"
      style={{
        background: "var(--fm-bg-surface)",
        borderBottom: "1px solid var(--fm-border-subtle)",
      }}
    >
      {/* Left: proxy status indicator */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span
          className="inline-flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium fm-text-tech"
          style={{
            background: isActive ? "var(--fm-primary-subtle)" : "var(--fm-bg-hover)",
            color: isActive ? "var(--fm-primary-text)" : "var(--fm-text-4)",
            borderRadius: "var(--fm-r-sm)",
            border: `1px solid ${isActive ? "var(--fm-primary-border)" : "var(--fm-border-default)"}`,
          }}
        >
          <span
            className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", isActive && "animate-pulse")}
            style={{ background: isActive ? "var(--fm-primary)" : "var(--fm-text-4)" }}
            aria-hidden="true"
          />
          {isActive ? "运行中" : "已停止"}
        </span>
      </div>

      {/* Center: RouteVisualizer */}
      <RouteVisualizer routeState={routeState} className="flex-1 min-w-0" />

      {/* Right: App injection toggles */}
      <TooltipProvider>
        <div className="flex items-center gap-3 flex-shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">
                <AppToggle
                  id="cc"
                  label="Claude Code"
                  iconUrl={claudecodeImg}
                  enabled={appStates.cc}
                  disabled={!isActive || !ccInstalled}
                  onToggle={(e) => onAppToggle("cc", e)}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{ccInstalled ? "Claude Code" : "未安装"}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">
                <AppToggle
                  id="codex"
                  label="Codex"
                  iconUrl={codexImg}
                  enabled={appStates.codex}
                  disabled={true}
                  onToggle={(e) => onAppToggle("codex", e)}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>开发中</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">
                <AppToggle
                  id="hermes"
                  label="H"
                  iconUrl={hermesImg}
                  enabled={appStates.hermes}
                  disabled={!isActive || !hermesInstalled}
                  onToggle={(e) => onAppToggle("hermes", e)}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{hermesInstalled ? "Hermes" : "未安装"}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default">
                <AppToggle
                  id="openclaw"
                  label="OC"
                  iconUrl={openclawImg}
                  enabled={appStates.openclaw}
                  disabled={!isActive || !openclawInstalled}
                  onToggle={(e) => onAppToggle("openclaw", e)}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p>{openclawInstalled ? "OpenClaw" : "未安装"}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  )
}
