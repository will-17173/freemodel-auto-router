import { trackEvent } from "./analytics.ts"

const originalGtag = window.gtag

delete window.gtag
trackEvent("missing_gtag_is_ignored", { value: 1 })

const calls: unknown[][] = []
window.gtag = (...args: unknown[]) => {
  calls.push(args)
}

trackEvent("queue_created", { item_count: 2 })

if (calls.length !== 1) throw new Error("expected one analytics event")
if (calls[0][0] !== "event") throw new Error("expected event command")
if (calls[0][1] !== "queue_created") throw new Error("expected event name")
if ((calls[0][2] as { item_count?: number }).item_count !== 2) {
  throw new Error("expected event params to be forwarded")
}

window.gtag = originalGtag
