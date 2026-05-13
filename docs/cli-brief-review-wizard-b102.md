# CLI Brief — B-102 Admin Review Wizard

**Status:** Hold until B-101 lands
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** Only re-uses existing endpoints (no new routes)
**Builds on:** B-068 (section reviews), B-098 (review vocabulary), B-099 (step pills + accordion), B-100 (review tooltip), B-101 (in-flight)

---

## Hold rule

Do not start B-102 until commit `feat: floating AI assistant placeholder widget …` (B-101 batch 6) is on `origin/main`. B-102 edits the step-pill row in `ServiceDetailClient.tsx`; B-101 batch 1 also edits the stage strip in the same file. Run `git pull origin main` and `git log --oneline -10` first — the six B-101 feat commits must all be visible.

---

## Why this batch exists

Admin wants a wizard-style review experience for `/admin/services/[id]` so they don't have to scroll through one long page. The existing scroll page **stays untouched** — this brief adds a parallel `Review Wizard` view at a new route. Same data, same edit capability, same save endpoints. The only thing new is the chrome (one step per screen + nav buttons).

User-visible behaviour:

1. New button on the existing page, in the step-pill row, immediately after the last step pill (`Documents`). Label: `Review Wizard`. Color: `#24a0ed` (sky blue) so it stands apart from the brand-navy pills.
2. Click → navigates to `/admin/services/[id]/review?step=0`.
3. The review page mirrors the existing page's content but renders **one step at a time**. Bottom nav: `[Previous] [Next] [Mark as Reviewed]` + `[Exit Review]` top-right.
4. Edits inside a step save the same way they do on the existing page (every field already has its own dirty tracker + Save bar from B-078 etc). On clicking `Next` or `Mark as Reviewed`, any pending dirty edits auto-save first (matching the client wizard's "save on advance" pattern), then the page moves to the next step.
5. `Mark as Reviewed` additionally writes a `reviewed` row to `application_section_reviews` for the current step's section key (reusing the existing section-review POST from B-068) before advancing.
6. People & KYC step shows the **profile list** (mirroring client's `ServiceWizardPeopleStep`). Clicking a profile opens that profile's KYC content in the same screen — when done with the profile's sub-steps, admin returns to the list. `Mark as Reviewed` on the list marks the whole step reviewed.
7. Documents step shows the existing `KycDocumentsTable` exactly as it appears on the scroll page.
8. URL is the source of truth for current step: `?step=N` where N is 0–4 (0=Company Setup, 1=Financial, 2=Banking, 3=People & KYC, 4=Documents). Refresh / deep-link preserves position. Per-profile sub-step uses `?step=3&profile=<id>&substep=<n>`.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main`) + CHANGES.md update.
2. `npm run build` clean.
3. **Existing page is untouched** except for the single new button in the step-pill row. Do not change scroll behaviour, accordion state, section JSX, or save logic on `/admin/services/[id]`.
4. **No new save endpoints, no migrations.** Re-use everything that exists.
5. **No `as any`.** Cast via `unknown` first when needed.
6. **Worktree → main** for push: `git push origin HEAD:main`. Do not push to a feature branch.
7. **Don't restart the dev server.**

---

## Implementation approach

The existing `ServiceDetailClient.tsx` (~3700 lines) renders all 5 step sections inline. Two viable paths:

- **Path A — reuse `ServiceDetailClient` with new props.** Add optional `reviewMode?: boolean` + `reviewStep?: number` props. When `reviewMode` is true, the component hides the title row + stage strip + accordion machinery + non-current-step section JSX, and renders the bottom nav strip instead. Pollutes a large file but ships fast.
- **Path B — new dedicated component.** Extract each step's section JSX into a reusable component (`ServiceCompanySetupSection`, `ServiceFinancialSection`, etc.), then mount them individually from both the scroll page and the review wizard. Cleaner long-term but the extraction is a multi-hour refactor on its own.

**Pick Path A.** The pollution is bounded (a handful of conditional renders) and the brief stays a single batch. Mark the extraction as tech debt if/when ServiceDetailClient hits another scaling pain.

---

## Step 1 — Add the `Review Wizard` entry button

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) — the step-pill container around line 3528–3531.

Today:

```tsx
<div className="rounded-lg border bg-white px-4 py-3">
  <AdminApplicationStepIndicator steps={ADMIN_STEPS_SERVICES} onStepClick={handleStepClick} />
</div>
```

Change the inner container to a flex row with the pills on the left and the button on the right:

```tsx
<div className="rounded-lg border bg-white px-4 py-3 flex items-center justify-between gap-3">
  <AdminApplicationStepIndicator steps={ADMIN_STEPS_SERVICES} onStepClick={handleStepClick} />
  <Link
    href={`/admin/services/${service.id}/review?step=0`}
    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white whitespace-nowrap shadow-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
    style={{ backgroundColor: "#24a0ed" }}
  >
    <Wand2 className="size-4" />
    Review Wizard
  </Link>
</div>
```

Import `Wand2` from `lucide-react`. If the row gets too tight on narrow viewports, wrap to a new line via `flex-wrap`. Keep the existing accordion logic and step-click behaviour intact — this is purely additive.

---

## Step 2 — New page route

File: `src/app/(admin)/admin/services/[id]/review/page.tsx`.

Server component. Re-use the same Supabase queries that drive the scroll page (`page.tsx` next door). The simplest pattern:

1. Read `serviceId` from `params`.
2. Read `step` from `searchParams` (default `0`).
3. Re-export / call the same data-loader the scroll page uses. If the existing `page.tsx` doesn't have an exported loader, extract its body into a `loadServiceDetail(serviceId)` helper at the top of that file and call it from both pages.
4. Render `<ReviewWizardClient {...everything from the loader} initialStep={step} />`.

Auth: same gate as the scroll page (admin_users membership check).

---

## Step 3 — The `ReviewWizardClient` component

File: `src/app/(admin)/admin/services/[id]/review/ReviewWizardClient.tsx`.

The cleanest implementation:

```tsx
"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ServiceDetailClient } from "../ServiceDetailClient"; // existing
// ... other imports

export function ReviewWizardClient(props: AllTheLoaderProps & { initialStep: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = parseInt(searchParams.get("step") ?? "0", 10);
  // ... advance / retreat helpers update the URL with router.replace

  return <ServiceDetailClient {...props} reviewMode reviewStep={step} />;
}
```

Then add to `ServiceDetailClient`'s props interface:

```ts
interface ServiceDetailClientProps {
  // ... all existing props
  reviewMode?: boolean;
  reviewStep?: number;
}
```

Inside `ServiceDetailClient`, gate the visual chrome by `reviewMode`:

- When `reviewMode` is true, hide:
  - The sticky shell's stage strip + step indicator row (the wizard chrome replaces both)
  - The right-rail (Status / Internal Notes / Risk Assessment / Audit Trail) — those don't belong in a focused review flow
  - All section cards whose step index ≠ `reviewStep`
  - The bottom-floating Save bar (it's replaced by Next / Mark as Reviewed in the wizard nav)
- Add a sticky top bar inside the wizard render path:
  - Left: small step indicator (just step N of 5 + section name)
  - Right: `Exit Review` link → navigates to `/admin/services/${id}` (without `/review`)
- Add a sticky bottom nav:
  - `[← Previous]` (disabled on step 0)
  - `[Next →]` (label changes to `Finish` on the last step; on finish, navigates back to `/admin/services/${id}`)
  - `[Mark as Reviewed]` — uses `#24a0ed` to match the entry button, sits to the right of Next
- Per-step content stays exactly as it appears on the scroll page (so every existing edit field, save mechanism, and dirty tracker carries over for free).

### Step mapping

Use the existing `ADMIN_STEPS_SERVICES` constant from `ServiceDetailClient.tsx`. Step indices match the existing pills:

| Step | section_key | What's shown |
|------|-------------|--------------|
| 0 | `company_setup` | Company Setup card |
| 1 | `financial` | Financial card |
| 2 | `banking` | Banking card |
| 3 | `people_kyc` | People & KYC profile list |
| 4 | `documents` | KYC Documents tab content |

---

## Step 4 — Save-on-advance

Wire the wizard's `Next` and `Mark as Reviewed` buttons through the existing per-section Save bars.

The current admin page has a global save bar that flushes all dirty fields across all sections — that's already triggered by `handleSaveAll()` (or similarly named) inside `ServiceDetailClient`. Expose a `saveAllRef` (`React.MutableRefObject<() => Promise<boolean>>`) so the wizard nav can call it before advancing:

```tsx
async function advance(nextStep: number) {
  if (saveAllRef.current && isDirtyAnywhere) {
    const ok = await saveAllRef.current();
    if (!ok) {
      toast.error("Couldn't save changes — fix the errors and try again.");
      return;
    }
  }
  router.replace(`/admin/services/${id}/review?step=${nextStep}`);
}
```

No new endpoints; this just chains the existing save before navigating. Mirror the client wizard's `saveAndCloseRef` pattern from `ClientServiceDetailClient.tsx`.

---

## Step 5 — Mark as Reviewed

The section review POST already exists from B-068 (look in `/api/admin/applications/[id]/section-reviews/route.ts` per tech-debt #26 — `application_id` actually holds service IDs in the modern path). On `Mark as Reviewed` click:

1. Run the same save-on-advance auto-save.
2. POST to the section-reviews endpoint with `{ section_key: STEP_SECTION_KEYS[step], status: "reviewed" }`.
3. Optimistically update the section status in local state so the badge flips immediately.
4. Advance to the next step.

No notes dialog — silent thumbs-up. Admin who wants to leave a note uses the existing inline section-review controls inside the section card (which are still visible on the wizard page since we render the full section card content, not a stripped-down summary).

---

## Step 6 — People & KYC sub-stepping

Step 3 shows the profile list. Clicking a profile expands that profile's content inline (mirroring how the existing per-profile accordion works on the scroll page). When a profile is expanded, the bottom nav adapts:

- `Previous` becomes `← Back to list` (collapses the profile back into the list view).
- `Next` becomes `Next Profile →` (collapses current profile, expands the next profile in the list).
- `Mark as Reviewed` becomes `Mark Profile Reviewed` (writes to `application_section_reviews` with a per-profile `subject_id` per the existing pattern, then advances to the next profile).

URL state: `?step=3&profile=<id>` when a profile is expanded; `?step=3` for the list.

The per-profile card content (all the sections inside `roleRow.client_profiles` rendering) stays exactly as it appears on the scroll page — same fields, same save bar, same dirty tracker. The wizard just controls which profile is expanded.

---

## Step 7 — Exit Review

`Exit Review` link in the top bar → `/admin/services/${id}` (without `/review`). If there are unsaved changes, the existing unsaved-changes dialog (already wired in `ServiceDetailClient` for nav guards) handles the warning. No new dialog needed.

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] Existing `/admin/services/[id]` scroll page is visually and functionally unchanged except for the new `Review Wizard` button in the step-pill row
- [ ] Button background is `#24a0ed`, sits to the right of the last step pill, has a wand icon + `Review Wizard` label
- [ ] Click → `/admin/services/[id]/review?step=0` loads with the Company Setup section visible, stage strip + right rail hidden, sticky top + bottom nav present
- [ ] `Next` advances to step 1 (URL updates); editing a field then clicking Next auto-saves first (no warning dialog)
- [ ] `Mark as Reviewed` writes a `reviewed` row, flips the section badge, then advances
- [ ] `Previous` works correctly + URL stays in sync
- [ ] Step 3 shows the profile list; clicking a profile opens its content inline; `Next Profile` cycles through profiles; back-to-list works
- [ ] Step 4 shows the KYC Documents table identical to the scroll page
- [ ] On the last step, `Next` reads `Finish` and returns to `/admin/services/[id]` after auto-save
- [ ] `Exit Review` top-right always returns to `/admin/services/[id]`; unsaved-changes guard fires if needed
- [ ] Deep-linking `?step=2` directly loads step 2; refresh preserves position
- [ ] CHANGES.md has a single B-102 entry referencing the new files + the entry-button change

---

## Tech debt to log

Append to `docs/tech-debt.md` after the batch:

- **`ServiceDetailClient.tsx` is now dual-purpose** — drives both the scroll page and the wizard via `reviewMode`/`reviewStep` props. The single-file size is approaching unsustainable. Next time we touch this file structurally, extract each step's section JSX (`ServiceCompanySetupSection`, `ServiceFinancialSection`, `ServiceBankingSection`, `ServicePeopleKycSection`, `ServiceDocumentsSection`) into standalone components and have both the scroll page and the wizard mount them by name. That collapses `reviewMode` into a layout-only concern.

---

## After the batch

Final commit + push + CHANGES.md → tell Vanessa: "B-102 done — Review Wizard live on /admin/services/[id]/review." Stop.
