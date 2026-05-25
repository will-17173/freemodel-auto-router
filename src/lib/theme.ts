export type ThemeMode = "system" | "dark" | "light"

const STORAGE_KEY = "fm-theme"

export function getTheme(): ThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === "dark" || stored === "light" || stored === "system") {
    return stored
  }
  return "dark"
}

export function setTheme(mode: ThemeMode): void {
  localStorage.setItem(STORAGE_KEY, mode)
  applyTheme(mode)
}

export function applyTheme(mode: ThemeMode): void {
  const html = document.documentElement
  if (mode === "dark") {
    html.setAttribute("data-theme", "dark")
  } else if (mode === "light") {
    html.setAttribute("data-theme", "light")
  } else {
    // system: remove attr, let @media prefers-color-scheme handle it
    html.removeAttribute("data-theme")
  }
}

/** Call once on app init */
export function initTheme(): void {
  applyTheme(getTheme())

  // Listen for system preference changes
  const mq = window.matchMedia("(prefers-color-scheme: dark)")
  mq.addEventListener("change", () => {
    if (getTheme() === "system") {
      applyTheme("system")
    }
  })
}
