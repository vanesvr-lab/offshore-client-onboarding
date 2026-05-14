# CLI Brief — B-114 Truthful Profile KYC % + DD PATCH Route Fix + Badge Color

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches API:** Yes — `/api/admin/profiles/[id]` PATCH rewritten
**Touches AI verification:** No
**Builds on:** B-107 (waiver-aware completion), B-113 (DD-level selector + calcKycPct)

---

## Pre-flight

Run `git pull origin main`. No specific feat to wait on — B-113 already landed.

---

## Why this batch exists

The profile-level "KYC: X%" badge on `/admin/services/[id]` is currently misleading on three counts:

1. **Wrong fields for organisations.** `calcKycPct` hardcodes an individual-shaped list (DOB / passport / nationality / etc.) and ignores `record_type`. Elarix LLC shows 0% even though every required org field is filled.
2. **Documents not counted.** Vanessa shows 100% with only 3 of 19 KYC docs uploaded — the % only looks at fields. A "complete" profile should mean fields + required docs (waiver-aware).
3. **Badge color is uniform.** Bruce at 100% renders the same color as Vanessa at 30%. Should color-code by state.

Plus a fourth bug surfaced while testing #1: the inline DD-level selector from B-113 doesn't actually persist. The `/api/admin/profiles/[id]` PATCH route still writes to the **legacy `kyc_records`** table; the modern source of truth is `client_profiles.due_diligence_level`. The 200-ok response is misleading — the value never changes for the form's purposes.

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **No new endpoints, no migrations.** Rewrite the existing PATCH; rewrite the existing `calcKycPct`.
4. **No `as any`.**
5. **Don't restart the dev server.**

---

## Step 1 — Rewrite `/api/admin/profiles/[id]` PATCH to target `client_profiles`

File: [`src/app/api/admin/profiles/[id]/route.ts`](src/app/api/admin/profiles/[id]/route.ts).

The current handler updates `kyc_records` — that's the legacy table from the pre-Phase-1 schema (see `supabase/migrations/20260301000003_phase1_schema.sql`). The active service-detail page reads `due_diligence_level` from `client_profiles`, so writes to `kyc_records` go to a dead column.

Replace the table target:

```ts
// Lookup uses client_profiles, not kyc_records.
const { data: current } = await supabase
  .from("client_profiles")
  .select("id, tenant_id, due_diligence_level, email")
  .eq("id", params.id)
  .eq("tenant_id", tenantId)              // restrict by tenant
  .maybeSingle();

if (!current) {
  return NextResponse.json({ error: "Profile not found" }, { status: 404 });
}

const { data: updated, error } = await supabase
  .from("client_profiles")
  .update(update)
  .eq("id", params.id)
  .eq("tenant_id", tenantId)
  .select()
  .single();
```

Audit log changes:
- `entity_type: "client_profile"` (was `"kyc_record"`)
- `entity_id: params.id` — same value but now a `client_profiles.id`
- Use `previous_value.due_diligence_level` from the `current` row (now `client_profiles`)

Drop the `revalidatePath('/admin/clients/...')` if `current.client_id` no longer exists on `client_profiles` (it doesn't — the modern schema uses `client_users` to link profiles to clients). Skip the revalidate or compute the client id via the `client_users` join.

Also import `getTenantId` from `@/lib/tenant` and use it in the lookup query — the route file doesn't tenant-scope today; that's a latent security hole on top of the broken table reference.

Test post-change: PATCH `{ due_diligence_level: 'edd' }` against Bruce's profile id → `client_profiles.due_diligence_level` updates → the form re-renders the EDD-only fields without a page reload.

---

## Step 2 — Rewrite `calcKycPct`: branch by record_type, include docs

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) line ~162.

Replace the hardcoded `KYC_FIELDS` array with a driven-by-sections compute. New signature:

```ts
import { KYC_SECTIONS_INDIVIDUAL, KYC_SECTIONS_ORGANISATION, gateSectionForLevel } from "@/lib/kyc/sections";
import type { KycSection, KycField, DueDiligenceLevel } from "@/lib/kyc/sections";

interface CalcKycInput {
  kyc: KycFull | null;
  profile: {
    record_type?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    due_diligence_level?: string | null;
  };
  profileDocs: ServiceDoc[];           // uploaded docs scoped to this profile
  kycDocTypes: DocumentType[];          // all KYC doc types (scope='person')
  waivers: WaivedDocumentRequirement[]; // for this service
  profileId: string;                    // needed to filter waivers
}

function calcKycPct(input: CalcKycInput): number {
  const { kyc, profile, profileDocs, kycDocTypes, waivers, profileId } = input;
  const sections = profile.record_type === "organisation"
    ? KYC_SECTIONS_ORGANISATION
    : KYC_SECTIONS_INDIVIDUAL;
  const level = (profile.due_diligence_level ?? "cdd") as DueDiligenceLevel;
  const gated = sections
    .map((s) => gateSectionForLevel(s, level))
    .filter((s): s is KycSection => s !== null);

  // Required fields — required: true AND no conditional showWhen.
  const requiredFields = gated.flatMap((s) =>
    s.fields.filter((f) => f.required && !f.showWhen),
  );

  // Required docs — every KYC doc type counts as required for the profile
  // (matches the existing "X of N uploaded" math elsewhere on the page).
  const requiredDocs = kycDocTypes;

  const totalRequired = requiredFields.length + requiredDocs.length;
  if (totalRequired === 0) return 100;

  // Count filled fields. A few keys live on `client_profiles` rather than
  // `client_profile_kyc` (full_name, email, phone, address) — pull from
  // profile in those cases.
  const PROFILE_KEYS = new Set(["full_name", "email", "phone", "address"]);
  const filledFields = requiredFields.filter((f) => {
    const v = PROFILE_KEYS.has(f.key)
      ? (profile as Record<string, unknown>)[f.key]
      : (kyc as Record<string, unknown> | null)?.[f.key];
    if (f.type === "boolean") return v !== null && v !== undefined;
    if (v == null || v === "") return false;
    return true;
  }).length;

  // Count "done" docs — uploaded for this profile OR waived.
  const filledDocs = requiredDocs.filter((dt) => {
    const isUploaded = profileDocs.some((d) => d.document_type_id === dt.id);
    const isWaived = waivers.some(
      (w) =>
        w.scope === "person" &&
        w.client_profile_id === profileId &&
        w.document_type_id === dt.id,
    );
    return isUploaded || isWaived;
  }).length;

  return Math.round(((filledFields + filledDocs) / totalRequired) * 100);
}
```

Every caller of `calcKycPct` now passes the full input object. Find them via `git grep -n 'calcKycPct('` and update.

For the `stepsWithState` memo (B-111) that aggregates People & KYC completion, average each profile's calcKycPct using the same shape.

If any unit tests exist for the old function, update or delete them (they're testing a deprecated shape).

---

## Step 3 — Same fix in `computeProfilePendingItems`

File: [`src/lib/services/computePendingItems.ts`](src/lib/services/computePendingItems.ts) — `computeProfilePendingItems` (added in B-113) has its own hardcoded individual-shaped REQUIRED_FIELDS list. For org profiles, it would list "date of birth: missing" etc. — nonsense.

Refactor the same way:

```ts
const sections = input.profile.record_type === "organisation"
  ? KYC_SECTIONS_ORGANISATION
  : KYC_SECTIONS_INDIVIDUAL;
const level = (input.ddLevel ?? "cdd") as DueDiligenceLevel;
const gated = sections
  .map((s) => gateSectionForLevel(s, level))
  .filter((s): s is KycSection => s !== null);
const requiredFields = gated.flatMap((s) =>
  s.fields.filter((f) => f.required && !f.showWhen),
);

for (const f of requiredFields) {
  const PROFILE_KEYS = new Set(["full_name", "email", "phone", "address"]);
  const v = PROFILE_KEYS.has(f.key)
    ? (input.profile as Record<string, unknown>)[f.key]
    : (input.kyc as Record<string, unknown> | null)?.[f.key];
  const empty = f.type === "boolean"
    ? v === null || v === undefined
    : v == null || v === "";
  if (empty) {
    out.push({
      id: `field_${input.profile.id}_${f.key}`,
      severity: "warning",
      label: `${f.label} — missing`,
      actionType: "scroll_to_section",
      actionPayload: `person-card-${input.profile.id}`,
      profileId: input.profile.id,
    });
  }
}
```

The doc-loop already works for both record types (any unfilled + un-waived KYC doc surfaces). Verify nothing extra to do there.

---

## Step 4 — KYC % badge color

In the profile header strip (around line ~1955-1990 of `ServiceDetailClient.tsx`), the "KYC: X%" badge currently renders in default text color. Add state-driven coloring:

```tsx
const kycColor =
  kycPct >= 100 ? "text-green-600"
  : kycPct > 0  ? "text-amber-600"
  : "text-red-600";

<span className={`text-xs font-medium ${kycColor}`}>
  KYC: {kycPct}%
</span>
```

Match the visual RAG language used elsewhere on the page. No background fill — just the text color.

---

## Step 5 — Smoke test

1. Bruce (individual, CDD, all fields + all docs waived where applicable) → green "KYC: 100%" badge.
2. Elarix LLC (organisation, SDD, company details filled, no docs) → KYC % reflects org-required fields + the 19 doc types not done. Probably amber, maybe ~10-20%.
3. Change Elarix's DD selector to CDD → the form below reveals new fields (or shows same — depending on org gating); KYC % recomputes immediately.
4. Vanessa (individual, all fields done, 3 of 19 docs) → KYC % drops from 100% to ~40-50%.
5. Refresh — values persist (DD level write actually lands now).

---

## Step 6 — Commit + push + CHANGES.md

```
fix: profile KYC % now branches by record_type, includes docs, color-coded badge, DD PATCH targets client_profiles
```

CHANGES.md under `## B-114`:

```
## B-114 — Truthful profile KYC % + DD PATCH fix + badge color (done <date>)

- `/api/admin/profiles/[id]` PATCH rewritten: was updating legacy `kyc_records`, now updates `client_profiles` (the modern source of truth). Tenant-scoped. Audit log entity_type bumped to `client_profile`.
- `calcKycPct` drives off KYC_SECTIONS_INDIVIDUAL / KYC_SECTIONS_ORGANISATION (record_type-aware), gates by DD level via existing `gateSectionForLevel`, and counts required KYC doc types (waiver-aware) alongside required fields. Elarix LLC now reports an honest org pct; Vanessa drops below 100% until her required docs are uploaded or waived.
- KYC % badge on the profile header color-codes: green ≥100, amber >0, red 0.
- `computeProfilePendingItems` (B-113) given the same record_type-aware refactor so the Pending popover surfaces org-relevant fields for org profiles.
```

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] DD selector on a profile header → changing it persists; refresh shows the new value; form reveals/hides EDD fields immediately
- [ ] Individual profile with every required field filled at CDD level and all required docs uploaded → 100%, badge green
- [ ] Individual profile with required fields filled but only some docs uploaded → KYC % reflects the doc shortfall, badge amber
- [ ] Organisation profile (Elarix LLC) shows a non-zero percentage based on org-required fields + docs
- [ ] Per-profile Pending popover on an org profile lists org-relevant missing fields (e.g. "Registration number — missing"), not individual fields like "Date of birth — missing"
- [ ] Audit log row written for DD level changes has `entity_type: "client_profile"`
- [ ] CHANGES.md has a single B-114 entry

---

## Tech debt to log

Append to `docs/tech-debt.md`:

- **All KYC doc types are treated as required for every profile.** Today calcKycPct treats every `kycDocTypes` row as required. In practice some doc types only apply to certain roles (e.g. UBO-only forms). When role-scoped doc requirements ship (via `role_requirements` table?), filter `requiredDocs` to only those that apply to the profile's roles. The math will still be right by structure — just the field count gets more accurate.
- **Conditional fields with `showWhen` are skipped from the required count.** A few fields like `source_of_funds_other` only render when the parent select is "other". Right now they're excluded from the denominator even when they're effectively required. Acceptable tradeoff; revisit if it causes noticeable under-counting.

---

## After the batch

Final commit + push → tell Vanessa one line: "B-114 done — KYC % is honest now (fields + docs, record-type-aware, color-coded), DD selector actually persists." Stop.
