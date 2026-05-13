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
