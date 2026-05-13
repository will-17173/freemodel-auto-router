import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Key, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Provider } from "@/types"

interface ProvidersPageProps {
  providers: Provider[]
  authMap: Record<string, boolean>
  activeProviderId: string | undefined
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
