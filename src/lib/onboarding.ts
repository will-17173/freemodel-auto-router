export const ONBOARDING_SEEN_VALUE = "seen"

export function shouldShowOnboarding(storedValue: string | null) {
  return storedValue !== ONBOARDING_SEEN_VALUE
}
