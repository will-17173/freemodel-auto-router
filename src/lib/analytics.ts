type AnalyticsParams = Record<string, string | number | boolean | null | undefined>

declare global {
  interface Window {
    gtag?: (command: "event", eventName: string, params?: AnalyticsParams) => void
  }
}

export function trackEvent(eventName: string, params: AnalyticsParams = {}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  window.gtag("event", eventName, params)
}
