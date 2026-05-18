import { shouldShowOnboarding } from "./onboarding.ts"

if (!shouldShowOnboarding(null)) throw new Error("expected onboarding to show when no stored value exists")
if (!shouldShowOnboarding("false")) throw new Error("expected onboarding to show for old invalid stored values")
if (shouldShowOnboarding("seen")) throw new Error("expected onboarding to stay hidden after it has been seen")
