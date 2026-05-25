import { useState, useEffect } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { getVersion } from "@tauri-apps/api/app"
import type { RetryConfig, UpdateInfo } from "@/types"
import { checkUpdate } from "@/api"
import type { ThemeMode } from "@/lib/theme"
import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"

interface SettingsPageProps {
  retry: RetryConfig
  port: number
  onSave: (retry: RetryConfig, newPort: number, portChanged: boolean) => void
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode) => void
}

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { value: "system", label: "跟随系统", icon: <Monitor className="h-3.5 w-3.5" /> },
  { value: "dark", label: "暗色", icon: <Moon className="h-3.5 w-3.5" /> },
  { value: "light", label: "浅色", icon: <Sun className="h-3.5 w-3.5" /> },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fm-text-tech mb-1.5"
      style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fm-text-4)", fontWeight: "var(--fm-weight-medium)" }}
    >
      {children}
    </div>
  )
}

function SectionHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="fm-text-zh mt-1" style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-4)" }}>
      {children}
    </p>
  )
}

export function SettingsPage({ retry, port, onSave, themeMode, onThemeChange }: SettingsPageProps) {
  const [maxRetries, setMaxRetries] = useState(String(retry.max_retries))
  const [retryDelay, setRetryDelay] = useState(String(retry.retry_delay_secs))
  const [portValue, setPortValue] = useState(String(port))
  const [saving, setSaving] = useState(false)
  const [appVersion, setAppVersion] = useState<string>("")
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {})
  }, [])

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

  async function handleCheckUpdate() {
    setCheckingUpdate(true)
    setUpdateError(null)
    setUpdateInfo(null)
    try {
      const info = await checkUpdate()
      setUpdateInfo(info)
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e))
    } finally {
      setCheckingUpdate(false)
    }
  }

  async function openReleasePage() {
    if (updateInfo?.release_url) {
      await openUrl(updateInfo.release_url)
    }
  }

  return (
    <div className="flex-1 p-5 overflow-auto" style={{ background: "var(--fm-bg-canvas)" }}>
      <h1 className="fm-text-zh mb-5" style={{ fontWeight: "var(--fm-weight-semibold)", color: "var(--fm-text-1)" }}>设置</h1>

      <div className="space-y-5 max-w-[400px]">

        {/* 主题 */}
        <div
          className="p-4 rounded-lg"
          style={{ background: "var(--fm-bg-surface)", border: "1px solid var(--fm-border-subtle)" }}
        >
          <SectionLabel>外观主题</SectionLabel>
          <div className="flex items-center gap-1 p-1 rounded-md" style={{ background: "var(--fm-bg-active)", width: "fit-content" }}>
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onThemeChange(opt.value)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-all",
                )}
                style={{
                  fontSize: "var(--fm-text-xs)",
                  color: themeMode === opt.value ? "var(--fm-text-1)" : "var(--fm-text-4)",
                  background: themeMode === opt.value ? "var(--fm-bg-surface)" : "transparent",
                  border: themeMode === opt.value ? "1px solid var(--fm-border-default)" : "1px solid transparent",
                  fontWeight: themeMode === opt.value ? "var(--fm-weight-medium)" : "var(--fm-weight-regular)",
                  cursor: "pointer",
                  boxShadow: themeMode === opt.value ? "0 1px 3px rgba(0,0,0,0.3)" : "none",
                }}
              >
                {opt.icon}
                <span className="fm-text-zh">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 代理端口 */}
        <div
          className="p-4 rounded-lg"
          style={{ background: "var(--fm-bg-surface)", border: "1px solid var(--fm-border-subtle)" }}
        >
          <SectionLabel>代理端口</SectionLabel>
          <input
            type="number"
            min={1}
            max={65535}
            value={portValue}
            onChange={(e) => setPortValue(e.target.value)}
            className="fm-input fm-text-tech"
            style={{ width: "120px" }}
          />
          <SectionHint>修改后需重启代理服务生效</SectionHint>
        </div>

        {/* 重试配置 */}
        <div
          className="p-4 rounded-lg"
          style={{ background: "var(--fm-bg-surface)", border: "1px solid var(--fm-border-subtle)" }}
        >
          <SectionLabel>重试配置</SectionLabel>
          <div className="flex items-center gap-3">
            <div>
              <div className="fm-text-tech mb-1.5" style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-3)" }}>最大重试次数</div>
              <input
                type="number"
                min={0}
                max={10}
                value={maxRetries}
                onChange={(e) => setMaxRetries(e.target.value)}
                className="fm-input fm-text-tech"
                style={{ width: "80px" }}
              />
            </div>
            <div>
              <div className="fm-text-tech mb-1.5" style={{ fontSize: "var(--fm-text-xs)", color: "var(--fm-text-3)" }}>重试间隔（秒）</div>
              <input
                type="number"
                min={0}
                max={60}
                value={retryDelay}
                onChange={(e) => setRetryDelay(e.target.value)}
                className="fm-input fm-text-tech"
                style={{ width: "80px" }}
              />
            </div>
          </div>
          <SectionHint>遇到 429/503 时的重试策略</SectionHint>
        </div>

        <button onClick={handleSave} disabled={saving} className="fm-btn-primary">
          <span className="fm-text-zh">{saving ? "保存中..." : "保存"}</span>
        </button>
      </div>

      {/* 版本 */}
      <div
        className="mt-8 pt-6 max-w-[400px]"
        style={{ borderTop: "1px solid var(--fm-border-subtle)" }}
      >
        <SectionLabel>版本信息</SectionLabel>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="fm-text-zh" style={{ fontSize: "var(--fm-text-sm)", color: "var(--fm-text-3)" }}>当前版本</span>
            <span className="fm-text-tech" style={{ color: "var(--fm-primary-text)" }}>
              v{updateInfo?.current_version || appVersion}
            </span>
          </div>

          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="fm-btn-secondary"
          >
            <span className="fm-text-zh">{checkingUpdate ? "检查中..." : "检查更新"}</span>
          </button>

          {updateError && (
            <div className="p-3 rounded-md" style={{ background: "var(--fm-error-subtle)", border: "1px solid var(--fm-error-border)" }}>
              <p className="fm-text-zh" style={{ fontSize: "var(--fm-text-sm)", color: "var(--fm-error-text)" }}>{updateError}</p>
            </div>
          )}

          {updateInfo && (
            <div
              className="p-4 rounded-md"
              style={{
                background: updateInfo.has_update ? "var(--fm-primary-subtle)" : "var(--fm-bg-elevated)",
                border: `1px solid ${updateInfo.has_update ? "var(--fm-primary-border)" : "var(--fm-border-default)"}`,
              }}
            >
              {updateInfo.has_update ? (
                <div className="space-y-3">
                  <div className="fm-text-zh" style={{ fontSize: "var(--fm-text-sm)", fontWeight: "var(--fm-weight-medium)", color: "var(--fm-primary-text)" }}>
                    发现新版本 v{updateInfo.latest_version}
                  </div>
                  <button onClick={openReleasePage} className="fm-btn-primary">
                    <span className="fm-text-zh">去 GitHub 下载</span>
                  </button>
                </div>
              ) : (
                <p className="fm-text-zh" style={{ fontSize: "var(--fm-text-sm)", color: "var(--fm-text-3)" }}>
                  已是最新版本 v{updateInfo.latest_version}
                </p>
              )}

              {updateInfo.release_notes && (
                <details className="mt-3">
                  <summary
                    className="fm-text-zh cursor-pointer transition-colors"
                    style={{ fontSize: "var(--fm-text-sm)", color: "var(--fm-text-4)" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fm-text-2)" }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fm-text-4)" }}
                  >
                    查看更新说明
                  </summary>
                  <div
                    className="mt-2 p-3 rounded fm-text-zh whitespace-pre-wrap max-h-48 overflow-auto"
                    style={{
                      fontSize: "var(--fm-text-sm)",
                      color: "var(--fm-text-2)",
                      background: "var(--fm-bg-active)",
                    }}
                  >
                    {updateInfo.release_notes}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
