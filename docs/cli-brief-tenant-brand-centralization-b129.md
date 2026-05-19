# B-129 — Tenant brand centralization (remove hardcoded GWMS + Mauritius)

## Why

Vanessa is pitching the platform to GWMS Ltd. Today "GWMS" appears as a hardcoded literal in 33 places across 14 files (email templates, portal copy, AI assistant widgets, the floating chat bubble, KYC forms, audit emails) and "Mauritius" appears in 36 places across 20 files (footers, form labels, country defaults). The `tenants` table already exists with one row (`name='GWMS Ltd'`, `slug='gwms'`, default UUID `a1b2c3d4-...`) but the application code never reads from it — the seeded `name` field is decorative.

B-129 wires the actually-rendered strings to the `tenants.settings` JSON column so:

1. **Pitch demos:** Vanessa changes one row in Supabase SQL editor before a demo (e.g. `settings.display_name = 'Acme Holdings Demo Ltd'`) and the entire portal rebrands without a deploy.
2. **Multi-tenant readiness:** every render path now resolves brand from the active tenant. When tech debt #1 ships, no per-template surgery needed.
3. **Cleanup:** `src/lib/tenant.ts` has stale "GWMS" comments; gone after B-129.

The Elarix vendor brand (the AI service / `support@elarix.io` env var / "Elarix AI assistant" mentions) is **NOT** touched — that's a separate axis (platform vendor vs tenant company). If Vanessa later wants to sell white-label, B-131 handles it.

## Out of scope (do NOT do in B-129)

- **`/admin/settings/branding` admin UI** — Vanessa edits the JSON directly via Supabase SQL editor for the pitch. The polished editor UI is B-130.
- **Elarix vendor-brand abstraction** — kept as-is per the design conversation.
- **Tailwind theme overhaul** — B-129 wires `primary_color` to a single CSS custom property at `<html>` level and bridges via Tailwind config so existing `bg-brand-navy` classes pick up the dynamic value. A full theme-tokens overhaul (semantic tokens, dark mode, etc.) is separate scope.
- **Per-locale formatting** (currency, date format) tied to `country` — B-129 only uses `country` as a display string. Locale-aware formatting is a future brief.
- **Email FROM address** — `RESEND_FROM_EMAIL` env var stays unchanged (it's an Elarix domain — separate axis).

## Field shape

Stored in `tenants.settings` JSON:

```ts
export interface TenantBrand {
  display_name: string;       // "GWMS Ltd" — used in copy + email subjects
  portal_name: string;        // "GWMS Client Portal" — used in email H1, footers, page titles
  country: string;            // "Mauritius" — footer country line, form defaults
  support_email: string;      // "support@elarix.io" — Contact-us links, footer
  logo_url: string | null;    // null → BrandMark renders the current default SVG
  footer_text: string;        // "GWMS Client Portal | Mauritius" — composable; can include {portal_name} / {country} placeholders
  primary_color: string;      // "#1e3a8a" (hex) — brand-navy default
}
```

Default fallbacks (for the helper, in case a key is missing for any tenant):

```ts
const TENANT_BRAND_DEFAULTS: TenantBrand = {
  display_name: 'Untitled',
  portal_name: 'Client Portal',
  country: '',
  support_email: '',
  logo_url: null,
  footer_text: '',
  primary_color: '#1e3a8a',
};
```

---

## Batch 1 — Schema seed (no schema change, just data)

The `tenants` table already has a `settings jsonb NOT NULL DEFAULT '{}'::jsonb` column. B-129 doesn't add new columns; it just populates `settings` for the existing GWMS row.

### Migration: `<timestamp>_seed_tenant_brand.sql`

Use `npx supabase migration new seed_tenant_brand` to generate the timestamp.

```sql
-- B-129 — Populate tenants.settings with the brand fields for the
-- existing GWMS row. Idempotent: uses `||` merge so it preserves any
-- other settings keys that may have been added separately.

UPDATE public.tenants
SET settings = settings || jsonb_build_object(
  'display_name',   'GWMS Ltd',
  'portal_name',    'GWMS Client Portal',
  'country',        'Mauritius',
  'support_email',  'support@elarix.io',
  'logo_url',       null,
  'footer_text',    'GWMS Client Portal | Mauritius',
  'primary_color',  '#1e3a8a'
)
WHERE slug = 'gwms';
```

Re-running the migration with the SAME values is a no-op merge. If Vanessa edits any field via SQL editor for a demo (e.g. sets `display_name = 'Demo Co'`), re-running the migration overwrites her edits back to the GWMS defaults — which is intentional behavior for migrations (idempotent restore to seed state).

### Migration lifecycle (CLI is responsible for the full cycle)

Per CLAUDE.md "Database Migration Workflow":

1. Write the migration file.
2. Commit + push the migration file.
3. `npm run db:push` to apply to prod.
4. `npm run db:status` — confirm Local + Remote pair with no drift.
5. CHANGES.md entry noting the migration filename + that it was pushed.

### Verification (Batch 1)

```sql
-- Should return the full brand JSON for GWMS
SELECT slug, settings FROM public.tenants WHERE slug = 'gwms';
```

### Commit message (Batch 1)

```
feat(db): seed tenant brand fields on GWMS row (B-129)

Populates tenants.settings with display_name, portal_name, country,
support_email, logo_url, footer_text, primary_color. Idempotent
JSON merge so other settings keys are preserved. Foundation for
removing the 33 hardcoded "GWMS" + 36 hardcoded "Mauritius" strings.
```

---

## Batch 2 — TenantBrand type + helper + session enrichment

### New file: `src/lib/tenant-brand.ts`

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export interface TenantBrand {
  display_name: string;
  portal_name: string;
  country: string;
  support_email: string;
  logo_url: string | null;
  footer_text: string;
  primary_color: string;
}

export const TENANT_BRAND_DEFAULTS: TenantBrand = {
  display_name: "Untitled",
  portal_name: "Client Portal",
  country: "",
  support_email: "",
  logo_url: null,
  footer_text: "",
  primary_color: "#1e3a8a",
};

/**
 * Resolve the tenant brand from the `tenants.settings` JSON column.
 * Falls back to defaults for any missing keys. Server-side use only.
 */
export async function getTenantBrand(
  supabase: SupabaseClient,
  tenantId: string
): Promise<TenantBrand> {
  const { data, error } = await supabase
    .from("tenants")
    .select("settings")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return TENANT_BRAND_DEFAULTS;
  const s = (data.settings ?? {}) as Partial<TenantBrand>;
  return { ...TENANT_BRAND_DEFAULTS, ...s };
}

/**
 * Format a footer_text template with {portal_name} / {country} placeholders.
 * Simple string replace — no full templating engine needed.
 */
export function formatFooter(brand: TenantBrand): string {
  return brand.footer_text
    .replace(/\{portal_name\}/g, brand.portal_name)
    .replace(/\{country\}/g, brand.country);
}
```

### Update: `src/lib/auth.ts`

Extend the NextAuth `authorize()` callback to also load `tenantBrand` and attach it to the user object. Then in the `jwt` and `session` callbacks, cache + read it the same way `adminPermissions` is handled (B-127 pattern).

```ts
// in authorize(), after loading adminPermissions:
const tenantBrand = await getTenantBrand(supabase, user.tenant_id ?? DEFAULT_TENANT_ID);

return {
  // … existing fields …
  tenantBrand,
};

// in jwt():
if (user) {
  // … existing token.* assignments …
  token.tenantBrand = (user as { tenantBrand: TenantBrand }).tenantBrand;
}

// in session():
session.user.tenantBrand = (token.tenantBrand as TenantBrand) ?? TENANT_BRAND_DEFAULTS;
```

### Update: `src/types/next-auth.d.ts`

Add `tenantBrand: TenantBrand` to `Session["user"]`.

### Staleness caveat

Same as B-127's adminPermissions: a logged-in user's session keeps its tenantBrand until they re-login. For the pitch demo: Vanessa updates the row, logs out + back in, the new brand is on her session.

### Verification (Batch 2)

```bash
npm run build  # type check passes
```

Manually log in → inspect `session.user.tenantBrand` via any route or RSC → confirm all 7 fields resolve.

### Commit message (Batch 2)

```
feat: TenantBrand resolution + session enrichment (B-129)

src/lib/tenant-brand.ts defines the type + getTenantBrand helper
that resolves the brand from tenants.settings with default
fallbacks. NextAuth authorize/jwt/session callbacks stamp it onto
session.user.tenantBrand so every server + client surface can
read it without a per-render DB hit. Mirrors the B-127 pattern
for adminPermissions.
```

---

## Batch 3 — Replace hardcoded "GWMS" across 14 files

For each file below, replace the hardcoded `"GWMS"` string with a brand read. The pattern depends on the file type.

### Server routes (load brand at top of handler):

| File | Current strings | New pattern |
|------|-----------------|-------------|
| `src/app/api/admin/admins/route.ts` | `"You've been invited to the GWMS admin portal"`, `"You've been invited to join the GWMS admin portal as"` | Load `brand` at top; use `${brand.portal_name} admin portal` |
| `src/app/api/admin/admins/[id]/resend-invite/route.ts` | `"Reminder: your GWMS admin invite"`, `"your invite to the GWMS admin portal"` | Same pattern |
| `src/app/api/admin/profiles/[id]/send-invite/route.ts` | `"GWMS Client Portal"` (H1), `"GWMS Client Portal | Mauritius"` (footer), `"GWMS Client Portal <support@elarix.io>"` (FROM) | H1 = `${brand.portal_name}`, footer = `formatFooter(brand)`, FROM = `${brand.portal_name} <${process.env.RESEND_FROM_EMAIL}>` |
| `src/app/api/admin/documents/[id]/request-update/route.ts` | `"GWMS Client Portal"` H1 + footer, `"at GWMS"` in body | Same pattern |
| `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` | `"Complete your KYC — ${serviceName} at GWMS"` subject, H1 + footer, `"at GWMS"` body | Same pattern |
| `src/lib/review-requests/emails.ts` | Look for `"GWMS"` references and replace via brand | Pass brand into the email-builder fn |

Pattern for each route:

```ts
import { getTenantBrand, formatFooter } from "@/lib/tenant-brand";
import { getTenantId } from "@/lib/tenant";

// at the top of the handler:
const tenantId = getTenantId(session);
const brand = await getTenantBrand(supabase, tenantId);

// then inline:
const subject = `You've been invited to the ${brand.portal_name}`;
const fromName = brand.portal_name;
const footerLine = formatFooter(brand) || brand.portal_name;
```

### Client + admin components (read from session):

| File | Current strings | New pattern |
|------|-----------------|-------------|
| `src/app/(client)/kyc/KycPageClient.tsx` | `"Please contact GWMS to set up your KYC profile."`, `"GWMS will review and contact you if additional information is needed."` | `useSession()` → `session?.user.tenantBrand.display_name`; render `Please contact {brand.display_name}…` |
| `src/components/kyc/OrganisationKycForm.tsx` | `"GWMS"` in label/help text | Same pattern |
| `src/components/kyc/IndividualKycForm.tsx` | `"GWMS"` in label/help text | Same pattern |
| `src/components/admin/AdminAssistant.tsx` | Welcome message references "GWMS" | Read from `useSession()` |
| `src/components/shared/FloatingAssistantWidget.tsx` | Welcome message references "GWMS" | Same |
| `src/components/client/DashboardClient.tsx` | "GWMS" in copy | Same |
| `src/lib/chatbot/llmFallback.ts` | "GWMS" in the system prompt → "If the question is about {portal_name}, answer using the knowledge below" | Inject `brand.portal_name` into the system prompt template |

### Comments / non-rendered:

| File | Action |
|------|--------|
| `src/lib/tenant.ts` | Update the file-level comment from "Single tenant now (GWMS)" to "Single tenant today; brand resolved via getTenantBrand. See src/lib/tenant-brand.ts." Remove "GWMS" from the `DEFAULT_TENANT_ID` docstring. |

### Verification (Batch 3)

```bash
# Should return zero hits in src/ except in comments that still mention GWMS as historical context
grep -rn '"GWMS\|`GWMS\|>GWMS' src/ --include="*.tsx" --include="*.ts"
# Expected: zero hits OR only in non-rendered comments

npm run build
npm run lint
```

Manual: pull up an admin invite email in Resend (or trigger one) → confirm subject says "GWMS admin portal" (because the seeded brand has portal_name = "GWMS Client Portal"). Then in SQL editor: `UPDATE tenants SET settings = settings || jsonb_build_object('portal_name', 'Test Portal') WHERE slug = 'gwms';` → log out + in → trigger another invite → subject now says "Test Portal admin portal". Revert.

### Commit message (Batch 3)

```
feat: replace 33 hardcoded "GWMS" with tenant brand reads (B-129)

14 files updated: admin invite emails, KYC invite emails, document
request emails, review-request emails (server routes); KYC client
page, AdminAssistant, FloatingAssistantWidget, DashboardClient,
chatbot LLM fallback prompt (client components); src/lib/tenant.ts
comments. All "GWMS" literals replaced with reads from
session.user.tenantBrand or getTenantBrand() at the route level.
```

---

## Batch 4 — Replace hardcoded "Mauritius" across 20 files

Same pattern as Batch 3 but for `brand.country`. The 20 files (from the catalog):

```
src/app/layout.tsx
src/types/index.ts
src/app/api/admin/clients/[id]/send-invite/route.ts
src/app/api/admin/migrations/fix-labels/route.ts
src/app/api/admin/migrations/seed-residential-address-fields/route.ts
src/app/api/admin/processes/[id]/request-documents/route.ts
src/app/api/admin/admins/route.ts
src/app/api/admin/admins/[id]/resend-invite/route.ts
src/app/api/admin/documents/[id]/request-update/route.ts
src/app/api/admin/profiles/[id]/send-invite/route.ts
src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts
src/app/(admin)/admin/clients/new/NewClientForm.tsx
src/app/(admin)/admin/clients/[id]/apply/[templateId]/details/page.tsx
src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx
src/app/(client)/apply/[templateId]/details/page.tsx
src/components/kyc/KycStepWizard.tsx
src/components/admin/SubstanceReviewForm.tsx
src/components/shared/BrandMark.tsx
src/components/shared/KycIntroTooltip.tsx
src/components/admin/EditableApplicationDetails.tsx
```

**For each:** open, grep `"Mauritius"`, decide if it's a hardcoded display string or part of a substantive label.

**Cases where Mauritius IS the right thing to keep hardcoded:**

- **Substance review labels** (`SubstanceReviewForm.tsx`) — the FSC §3.2/§3.3/§3.4 sections explicitly reference Mauritius regulatory requirements ("MU resident directors", "MU bank account"). Don't strip these; they're legally accurate for the current tenant only because the tenant IS Mauritius-based. Leave them as-is but add a code comment: `// FSC §3.2 — Mauritius-specific compliance labels. If GWMS expands to other jurisdictions, this whole section needs a per-tenant template.`
- **Migration files** under `src/app/api/admin/migrations/*` — these are one-off seed scripts that run against the GWMS tenant. Leave hardcoded.
- **`src/types/index.ts`** — if "Mauritius" appears in a TypeScript string-literal type union or as a default enum, leave it. Don't make types runtime-dynamic.

**Cases that DO get replaced:**

- Footer lines (`"GWMS Client Portal | Mauritius"`) — already covered by Batch 3 via `formatFooter(brand)`.
- Help / hint text (`"e.g. Mauritius National ID"`) — replace with `e.g. ${brand.country} National ID` where it makes sense, OR leave with a `// VERIFY` comment.
- Default country dropdowns / pre-filled values — replace defaults with `brand.country`.

**CLI judgment call:** if a string says "Mauritius" because it's a country reference that happens to match the tenant, replace it. If it's "Mauritius" because it's part of a specific regulatory reference (FSC, MRA, Companies Act of Mauritius, etc.), leave it.

### Verification (Batch 4)

```bash
# Catalog remaining hardcoded Mauritius. Should ONLY be the FSC/MRA-specific
# legal references that intentionally stay.
grep -rn "Mauritius" src/ --include="*.tsx" --include="*.ts" | grep -v "// "
```

Each remaining hit must be justified (substance review legal labels, migration seeds, etc.). Add a paragraph in the Batch 6 CHANGES.md entry listing what stayed and why.

### Commit message (Batch 4)

```
feat: replace 36 hardcoded "Mauritius" (where appropriate) (B-129)

Country references in email footers + form hint text now read from
brand.country. Substance review (FSC §3.2-3.4) labels stay hardcoded
since they're Mauritius-specific compliance and would need a per-
tenant template to abstract. Migration seed files also stay hard-
coded (one-off scripts).
```

---

## Batch 5 — Logo + primary color

### Logo: update `src/components/shared/BrandMark.tsx`

Today the component renders a hardcoded SVG (or similar). Make it conditional:

```tsx
// Pseudocode — adapt to the existing BrandMark structure
export function BrandMark({ size = 32 }: { size?: number }) {
  const { data: session } = useSession();
  const logoUrl = session?.user.tenantBrand?.logo_url;
  if (logoUrl) {
    return <img src={logoUrl} alt={`${session.user.tenantBrand.display_name} logo`} width={size} height={size} />;
  }
  // Fallback: existing hardcoded SVG
  return <DefaultBrandSvg size={size} />;
}
```

For server components that render BrandMark (RSCs), pass `logoUrl` as a prop instead of using `useSession`.

### Primary color: CSS custom property at the root

In `src/app/layout.tsx` (the root layout):

```tsx
import { auth } from "@/lib/auth";
import { TENANT_BRAND_DEFAULTS } from "@/lib/tenant-brand";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const primaryColor = session?.user.tenantBrand?.primary_color ?? TENANT_BRAND_DEFAULTS.primary_color;
  return (
    <html lang="en" style={{ "--brand-primary": primaryColor } as React.CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
```

### Tailwind config bridge

In `tailwind.config.ts` (or `.js`), update the existing `brand` color palette so `brand-navy` (or whichever class is the primary) reads from the CSS variable:

```ts
// tailwind.config.ts
theme: {
  extend: {
    colors: {
      brand: {
        navy: "var(--brand-primary, #1e3a8a)",
        // … other shades stay static for now …
      },
    },
  },
},
```

**Caveat:** Tailwind classes that use opacity modifiers (`bg-brand-navy/50`) won't work with raw CSS variables. The trick is to convert the hex to RGB components in the CSS variable:

```css
--brand-primary: 30 58 138;  /* RGB triplet, no commas */
```

And in Tailwind config:

```ts
brand: {
  navy: "rgb(var(--brand-primary) / <alpha-value>)",
}
```

Then the root layout converts hex → RGB before injecting. A small `hexToRgb()` helper handles this:

```ts
function hexToRgbTriplet(hex: string): string {
  const v = hex.replace(/^#/, "");
  return `${parseInt(v.slice(0,2), 16)} ${parseInt(v.slice(2,4), 16)} ${parseInt(v.slice(4,6), 16)}`;
}
// In RootLayout:
const primary = hexToRgbTriplet(session?.user.tenantBrand?.primary_color ?? '#1e3a8a');
return <html style={{ "--brand-primary": primary }}>…</html>
```

### Verification (Batch 5)

Manual:
1. Load the portal → confirm the primary color is the current brand-navy blue.
2. In SQL editor: `UPDATE tenants SET settings = settings || jsonb_build_object('primary_color', '#dc2626') WHERE slug = 'gwms';` (red).
3. Log out + back in (or hard-refresh; the session needs to pick up the new value).
4. Confirm primary-colored elements (buttons, badges, focus rings) render red.
5. Revert via the same SQL pattern.

For logo:
1. Upload a test logo to public/test-logo.png (or use an external URL).
2. `UPDATE tenants SET settings = settings || jsonb_build_object('logo_url', '/test-logo.png') WHERE slug = 'gwms';`
3. Refresh → confirm BrandMark renders the uploaded image.
4. Set logo_url back to null → BrandMark falls back to the default SVG.

### Commit message (Batch 5)

```
feat: tenant-driven logo + primary color (B-129)

BrandMark renders tenant.logo_url when set, falls back to the
default SVG when null. Root layout injects primary_color as a
CSS variable (--brand-primary, RGB triplet) so Tailwind
bg-brand-navy / text-brand-navy classes resolve dynamically with
opacity support. Pitch demo capability: edit the JSON, watch
the portal rebrand.
```

---

## Batch 6 — CHANGES.md + tech debt

### CHANGES.md

Add a top-of-file entry under `## B-129 — Tenant brand centralization (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add to #1 (No multi-tenancy)** an update note: "B-129 (2026-05-19) centralized brand strings to `tenants.settings`, which means a new tenant inserted today would automatically have its own brand identity flow through every email + UI surface. The remaining multi-tenant work is per-tenant data isolation (RLS scoped to tenant_id), tenant context resolution from session/subdomain, and admin UI for managing multiple tenants — none of which were in B-129's scope."
- **Add new Open entry**: "Admin UI for editing tenant brand — B-129 wired the data path but Vanessa edits via SQL editor for now. New brief B-130 builds `/admin/settings/branding` with field editors + logo upload."
- **Add new Open entry**: "Substance review labels are still Mauritius-hardcoded — B-129 left FSC §3.2-3.4 labels as-is since they're jurisdiction-specific compliance. When (if) GWMS expands to other jurisdictions, the substance section needs a per-tenant compliance template. Estimate: 2-3 days; depends on the new jurisdiction's specific framework."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write, commit + push file, `db:push`, `db:status`, CHANGES.md.
2. **Per-batch commits:** six commits. Stage by filename — never `git add .` or `git add -A`.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No admin UI for editing the brand — that's B-130.
- No Elarix vendor-brand abstraction — separate axis.
- No per-locale formatting (currencies, dates).
- No FSC compliance label abstraction.
- No environment-variable-driven brand override.
