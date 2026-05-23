import { useState } from "react"
import { openUrl } from "@tauri-apps/plugin-opener"
import type { RetryConfig, UpdateInfo } from "@/types"
import { checkUpdate } from "@/api"

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

  // 版本检查状态
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)

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
    <div className="flex-1 p-6 overflow-auto">
      <h1 className="fm-card-title mb-6">设置</h1>

      <div className="space-y-5 max-w-md">
        <div className="space-y-2">
          <label className="fm-eyebrow">监听端口</label>
          <input
            type="number"
            min={1}
            max={65535}
            value={portValue}
            onChange={(e) => setPortValue(e.target.value)}
            className="fm-input font-mono"
          />
          <p className="fm-caption">修改后需重启代理服务生效</p>
        </div>

        <div className="space-y-2">
          <label className="fm-eyebrow">最大重试次数</label>
          <input
            type="number"
            min={0}
            max={10}
            value={maxRetries}
            onChange={(e) => setMaxRetries(e.target.value)}
            className="fm-input font-mono"
          />
          <p className="fm-caption">遇到 429/503 时的最大重试次数</p>
        </div>

        <div className="space-y-2">
          <label className="fm-eyebrow">重试间隔（秒）</label>
          <input
            type="number"
            min={0}
            max={60}
            value={retryDelay}
            onChange={(e) => setRetryDelay(e.target.value)}
            className="fm-input font-mono"
          />
          <p className="fm-caption">每次重试之间的等待时间</p>
        </div>

        <button onClick={handleSave} disabled={saving} className="fm-btn-primary mt-6">
          {saving ? "保存中..." : "保存"}
        </button>
      </div>

      {/* 版本检查区域 */}
      <div className="mt-10 pt-6 border-t border-[var(--fm-border)]">
        <h2 className="fm-eyebrow mb-4">版本</h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="fm-caption">当前版本：</span>
            <span className="font-mono text-sm text-[var(--fm-text)]">
              v{updateInfo?.current_version || "0.1.1"}
            </span>
          </div>

          <button
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="fm-btn-secondary"
          >
            {checkingUpdate ? "检查中..." : "检查更新"}
          </button>

          {/* 检查结果 */}
          {updateError && (
            <div className="fm-block-red p-3 rounded-lg">
              <p className="text-sm text-[var(--fm-red)]">{updateError}</p>
            </div>
          )}

          {updateInfo && (
            <div className={`p-4 rounded-lg ${updateInfo.has_update ? "fm-block-lime" : "fm-block-gray"}`}>
              {updateInfo.has_update ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--fm-lime-text)]">
                      发现新版本 v{updateInfo.latest_version}
                    </span>
                  </div>
                  <button
                    onClick={openReleasePage}
                    className="fm-btn-primary"
                  >
                    去 GitHub 下载
                  </button>
                </div>
              ) : (
                <p className="text-sm text-[var(--fm-gray-text)]">
                  已是最新版本 v{updateInfo.latest_version}
                </p>
              )}

              {updateInfo.release_notes && (
                <details className="mt-3">
                  <summary className="text-sm cursor-pointer text-[var(--fm-muted)] hover:text-[var(--fm-text)]">
                    查看更新说明
                  </summary>
                  <div className="mt-2 p-3 bg-[var(--fm-bg)] rounded text-sm text-[var(--fm-text)] whitespace-pre-wrap max-h-48 overflow-auto">
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
