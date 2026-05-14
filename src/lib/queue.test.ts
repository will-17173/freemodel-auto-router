import { dedupeQueueItems, queueItemKey } from "./queue.ts"
import type { DraftItem } from "@/types"

const items: DraftItem[] = [
  { provider_id: "longcat", model_id: "chat" },
  { provider_id: "longcat", model_id: "thinking" },
  { provider_id: "longcat", model_id: "chat" },
  { provider_id: "modelscope", model_id: "chat" },
]

const deduped = dedupeQueueItems(items)

if (deduped.length !== 3) throw new Error("expected duplicate queue items to be removed")
if (deduped[0] !== items[0]) throw new Error("expected first duplicate occurrence to be preserved")
if (queueItemKey(items[1]) !== "longcat::thinking") throw new Error("expected stable queue key")
