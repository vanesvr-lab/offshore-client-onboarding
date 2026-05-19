// B-129 Batch 7 — Platform vendor brand (separate axis from tenant
// brand). Hardcoded constants with env-var overrides so a white-label
// deployment can rebrand the platform vendor without code changes.

export const PLATFORM_BRAND = {
  name: process.env.NEXT_PUBLIC_PLATFORM_NAME ?? "Elarix",
  tagline:
    process.env.NEXT_PUBLIC_PLATFORM_TAGLINE ??
    "The intelligent portal for client due diligence and compliance",
  logo_url: process.env.NEXT_PUBLIC_PLATFORM_LOGO_URL ?? "/elarix-logo.png",
} as const;

export type PlatformBrand = typeof PLATFORM_BRAND;
