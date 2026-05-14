import type { DraftItem } from "@/types"

export function queueItemKey(item: DraftItem): string {
  return `${item.provider_id}::${item.model_id}`
}

export function dedupeQueueItems(items: DraftItem[]): DraftItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = queueItemKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
