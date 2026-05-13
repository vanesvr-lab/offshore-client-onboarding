# CLI Brief — B-107 Per-Profile Waive Action + Waiver-Aware % + Review Wizard Button Position

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches API:** No (re-uses existing waive-document endpoint)
**Touches AI verification:** No
**Builds on:** B-100, B-106 (waiver feature)

---

## Pre-flight

Run `git pull origin main` first. No specific feat commit to wait on — B-106 is in.

---

## Why this batch exists

Three small follow-ups after B-106:

1. **Waive action missing from the per-profile Documents subsection.** B-106 batch 3 added the *display* of waived docs (badge + count) inside the per-profile card on `/admin/services/[id]`, but admin can only waive from the KYC Documents tab today. Vanessa wants the same waive / un-waive button on each row of `KycDocsByCategory` so the action is available wherever the doc is shown.
2. **Per-profile completion % doesn't count waived docs as done.** Today the Documents subsection shows e.g. `Documents 37% · 7 of 8 uploaded · 11 waived` — the percentage treats waived docs as still-pending. Should treat waived as done: `(uploaded + waived) / total = %`. So 7 + 11 = 18 out of 19 → ~95%.
3. **Review Wizard button is flush-right.** B-103 placed it in the step-pill row with `justify-between` so it sticks to the right edge of the card. Vanessa wants it nearer the last step pill with a small gap, not hugging the edge.

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **No `as any`.**
4. **Don't restart the dev server.**

---

## Step 1 — Waive action on `KycDocsByCategory` rows

File: [`src/components/kyc/KycDocsByCategory.tsx`](src/components/kyc/KycDocsByCategory.tsx) + the per-row child (`KycDocRow.tsx` per the diff in B-106).

The KYC Documents tab already has a waive/un-waive action implemented inside `KycDocumentsTable.tsx` — copy that affordance verbatim:

- Button label: `Waive` (when not waived) / `Un-waive` (when waived).
- Confirm dialog text (waive only): `The client will no longer be asked to upload this document. You can un-waive it at any time.`
- POST/DELETE call against `/api/admin/services/${serviceId}/waive-document` with `{ scope: "person", client_profile_id, document_type_id }` (same shape the table already uses).
- Optimistic update: splice into / out of the parent's `waivers` array via the `onWaiversChange` callback.

### Threading the waivers callback down

`KycDocsByCategory` already receives the `is_waived` / `waived_at` / `waived_by_name` row fields from B-106 batch 3. Add three new optional props:

```ts
interface Props {
  // … existing
  serviceId?: string;
  profileId?: string;
  waivers?: WaivedDocumentRequirement[];
  onWaiversChange?: (next: WaivedDocumentRequirement[]) => void;
}
```

In the call site inside `ServiceDetailClient.tsx` (around line 2228 where `KycDocsByCategory` is mounted via `<KycLongForm>` or the per-profile body), pass `serviceId`, `profile.id`, `waivers`, and `setWaivers` down through whichever wrapper component currently renders the category list. Add the same plumbing to `KycLongForm` if it sits in the middle of the chain — the props are simple pass-through.

Then in `KycDocRow.tsx` (or whichever component renders the action column inside `KycDocsByCategory`), if `serviceId && profileId && onWaiversChange`, render the waive button. If those are missing (component is mounted somewhere read-only), suppress the button — same fallback `KycDocumentsTable` would use.

### Waive handler

Re-use the helper functions from `KycDocumentsTable.tsx`. To avoid copy-paste drift, extract them into a shared util at `src/lib/waivers/clientActions.ts`:

```ts
export async function waiveDocument(opts: {
  serviceId: string;
  profileId: string;
  documentTypeId: string;
  prev: WaivedDocumentRequirement[];
  onChange: (next: WaivedDocumentRequirement[]) => void;
}): Promise<void> {
  // optimistic insert + POST + rollback on error
}

export async function unwaiveDocument(opts: { ... }): Promise<void> {
  // optimistic remove + DELETE + rollback on error
}
```

Replace the two inline handlers in `KycDocumentsTable.tsx` with calls into this util, and use the same util from the new `KycDocsByCategory` button. Same audit-log behaviour because the endpoint is identical.

---

## Step 2 — Waiver-aware completion percentage

The per-profile Documents subsection header at `ServiceDetailClient.tsx:1843-1847` computes:

```ts
const totalKycDocs = kycDocsByCategory.reduce((acc, c) => acc + c.docs.length, 0);
const totalKycUploaded = kycDocsByCategory.reduce(
  (acc, c) => acc + c.docs.filter((d) => d.is_uploaded).length,
  0,
);
```

B-106 batch 3 added `totalKycDocsExcludingWaived`. Today the percentage that drives the section header (the "37%" in Vanessa's screenshot) is probably built off `totalKycUploaded / totalKycDocsExcludingWaived` — but the percent shown still feels wrong because the screenshot has 7 + 11 = 18 done out of 19 and reads 37%.

Find the call site that drives the section's `percentage` prop on `ServiceCollapsibleSection`. Update it to:

```ts
const waivedCount = kycDocsByCategory.reduce(
  (acc, c) => acc + c.docs.filter((d) => d.is_waived).length,
  0,
);
const doneCount = totalKycUploaded + waivedCount;
const pct = totalKycDocs > 0
  ? Math.round((doneCount / totalKycDocs) * 100)
  : 0;
```

Same logic for the RAG status: `pct >= 100 → green`, `pct > 0 → amber`, else `red`.

The summary text inside `KycDocsSummary` should keep its current shape ("`<uploaded>` of `<total - waived>` uploaded · `<waived>` waived") — readability — but the percentage chip on the section header now reflects "real progress".

Apply the same fix to the **service-level** Documents section header. The block around `ServiceDetailClient.tsx:3545-3549`:

```ts
const documentsUploadedCount = uploadedServiceTypeIds.size;
const documentsExpectedCount = serviceDocTypes.length;
const documentsPct = ...;
```

Add a service-waiver count:

```ts
const serviceWaivedCount = waivers.filter((w) => w.scope === "application").length;
const documentsDoneCount = documentsUploadedCount + serviceWaivedCount;
const documentsPct = documentsExpectedCount > 0
  ? Math.round((documentsDoneCount / documentsExpectedCount) * 100)
  : 0;
```

This makes the service-level Documents header pct align with the rest.

If `peopleKycPct` (the People & KYC top-level pill) is computed elsewhere and also needs waiver awareness, find the calc (likely in `src/lib/utils/` — grep for `peopleKycPct`) and apply the same `(uploaded + waived) / total` shape.

---

## Step 3 — Reposition the Review Wizard button

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) around line 3528–3531.

Today:

```tsx
<div className="rounded-lg border bg-white px-4 py-3 flex items-center justify-between gap-3">
  <AdminApplicationStepIndicator steps={ADMIN_STEPS_SERVICES} onStepClick={handleStepClick} />
  <Link
    href={`/admin/services/${service.id}/review?step=0`}
    className="..."
    style={{ backgroundColor: "#24a0ed" }}
  >
    <Wand2 className="size-4" />
    Review Wizard
  </Link>
</div>
```

The `justify-between` pushes the button to the far right of the card. Replace with `gap`-based layout, and use a generous gap so the button reads as visually separate from the pill cluster (Vanessa's exact words: "so it looks separate"):

```tsx
<div className="rounded-lg border bg-white px-4 py-3 flex items-center flex-wrap gap-x-8 gap-y-3">
  <AdminApplicationStepIndicator steps={ADMIN_STEPS_SERVICES} onStepClick={handleStepClick} />
  <Link
    href={`/admin/services/${service.id}/review?step=0`}
    className="..."
    style={{ backgroundColor: "#24a0ed" }}
  >
    <Wand2 className="size-4" />
    Review Wizard
  </Link>
</div>
```

Three changes:
1. Drop `justify-between` — button no longer hugs the card's right edge.
2. `gap-x-8` (32px horizontal) between the pills row and the button — clearly readable as a separate element rather than another step. If 32px reads cramped at the chosen font, bump to `gap-x-10`; if it reads too far, drop to `gap-x-6`. Pick the smallest value that visually decouples the two clusters.
3. `gap-y-3` + `flex-wrap` so on narrow viewports the button falls to a new row instead of overflowing.

If the pills row ends up wider than the card's content width on common screens, the button naturally wraps below it — acceptable. Alternative if Vanessa wants the button always on the same row at desktop widths: nest the pills in a child `flex-1` wrapper so they take available space and the button always sits at the row's end with the `gap-x-8` gap. Pick whichever reads cleaner at her usual viewport (1440px-ish).

---

## Step 4 — Commit + push + CHANGES.md

```
feat: waive action in per-profile docs + waiver-aware completion % + review wizard button repositioned
```

CHANGES.md entry under `## B-107`:

```
## B-107 — Per-profile waive + waiver-aware % + button position (done <date>)

- `src/components/kyc/KycDocsByCategory.tsx` + `KycDocRow.tsx`: waive/un-waive button on each row, matching KycDocumentsTable's UX. Shared util at `src/lib/waivers/clientActions.ts` consolidates the waive/un-waive logic (no duplication with the table).
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`: KYC + service-level Documents percentages now treat waived docs as done — `(uploaded + waived) / total` — so a profile with all required docs either uploaded or waived shows 100% instead of being stuck below.
- Same file: Review Wizard button drops `justify-between`, sits adjacent to the last step pill with `gap-3` breathing space; wraps to a new row on narrow viewports.
```

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] Inside the per-profile Documents subsection on `/admin/services/[id]`, every row has a Waive button (or Un-waive when already waived); clicking opens the confirm dialog, persists, and the row treatment flips immediately
- [ ] After waiving a doc, the section header % recomputes to count it as done
- [ ] A profile with all docs either uploaded or waived shows 100% on its Documents section header
- [ ] Service-level Documents section header % also counts service waivers as done
- [ ] Review Wizard button sits adjacent to the `Documents` step pill with a small visible gap, not flush against the card's right edge
- [ ] On narrow viewports (resize to ~900px), the Review Wizard button wraps below the pills, doesn't overflow horizontally
- [ ] CHANGES.md has a single B-107 entry

---

## After the batch

Final commit + push → tell Vanessa one line: "B-107 done — waive in per-profile docs, % counts waivers, button repositioned." Stop.
