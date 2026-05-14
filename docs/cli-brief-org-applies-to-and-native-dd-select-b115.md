# CLI Brief — B-115 Org-Aware Required Docs (applies_to) + Native DD Selector

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches API:** No (data filter only)
**Touches AI verification:** No
**Builds on:** B-113 (per-profile Pending + DD selector), B-114 (record-type-aware calcKycPct)

---

## Pre-flight

Run `git pull origin main`. No specific feat to wait on — B-114 already landed.

---

## Why this batch exists

Two issues surfaced testing B-114:

1. **Pending for org profiles lists individual-only docs.** Elarix LLC's Pending popover shows "Driving Licence — not uploaded", "National ID Card — not uploaded", etc. — those are person-specific docs and never apply to a corporation. The `document_types` table has an `applies_to` column with values `individual` / `organisation` / `both`, but `calcKycPct` (B-114) and `computeProfilePendingItems` (B-113) both treat every KYC doc type as required regardless of who they apply to. Fix: filter the required-doc list by `applies_to` matching the profile's record type.
2. **DD-level selector still won't open.** B-114 fixed the PATCH route (`client_profiles` is now the write target — verify via DB after a change), but admin still can't interact with the dropdown on `/admin/services/[id]`. Two contributing causes:
   - The parent wrapper at `ServiceDetailClient.tsx:2315` has `onClick={(e) => e.stopPropagation()}` — base-ui's `Select` uses an internal event chain that gets tangled when a parent kills propagation.
   - base-ui's `<SelectValue />` doesn't auto-map to the SelectItem's children — that's why the trigger shows lowercase `"sdd"` instead of `"SDD"`.

For a tiny inline selector both issues go away if we just use a native `<select>` element. No portal, no synthetic-event chain, browser-native label rendering.

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **No new endpoints, no migrations.**
4. **No `as any`.**
5. **Don't restart the dev server.**

---

## Step 1 — Filter required docs by `applies_to`

### Step 1.1 — Shared helper

File: `src/lib/kyc/applicableDocTypes.ts`.

```ts
import type { DocumentType } from "@/types";

/**
 * Filter a list of KYC doc types down to the ones applicable to a profile's
 * record_type. `applies_to` on `document_types` is one of:
 *   - 'individual'
 *   - 'organisation'
 *   - 'both'
 * `both` rows always pass. Anything else (legacy NULL etc.) passes too so we
 * don't accidentally hide types that haven't been categorised yet.
 */
export function filterDocTypesForRecordType(
  docTypes: DocumentType[],
  recordType: string | null | undefined,
): DocumentType[] {
  const want = recordType === "organisation" ? "organisation" : "individual";
  return docTypes.filter((dt) => {
    const a = dt.applies_to;
    if (!a) return true;        // legacy rows without applies_to: keep
    return a === want || a === "both";
  });
}
```

Add `applies_to: string | null` to the `DocumentType` type in `src/types/index.ts` if it isn't already typed (the column exists in the DB — make sure the type reflects it).

### Step 1.2 — Apply to `calcKycPct`

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) — `calcKycPct` (rewritten in B-114).

Inside the function, before the `requiredDocs = kycDocTypes` line, filter:

```ts
const requiredDocs = filterDocTypesForRecordType(kycDocTypes, profile.record_type);
```

Import `filterDocTypesForRecordType` from the new module.

### Step 1.3 — Apply to `computeProfilePendingItems`

File: [`src/lib/services/computePendingItems.ts`](src/lib/services/computePendingItems.ts) — the doc loop in `computeProfilePendingItems`.

Replace the inline `input.documentTypes` reference with the filtered set:

```ts
const applicableDocTypes = filterDocTypesForRecordType(
  input.documentTypes,
  input.profile.record_type,
);
for (const dt of applicableDocTypes) {
  // existing isUploaded / isWaived check, push PendingItem
}
```

---

## Step 2 — Replace base-ui Select with native `<select>` in `ProfileDdLevelSelector`

File: [`src/components/admin/ProfileDdLevelSelector.tsx`](src/components/admin/ProfileDdLevelSelector.tsx).

Rewrite the component as a native element. Same props, same PATCH logic, same `onLevelChanged` callback — only the rendered control changes.

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";

interface Props {
  profileId: string;
  currentLevel: string | null;
  onLevelChanged: (next: string) => void;
}

const OPTIONS: { value: string; label: string }[] = [
  { value: "sdd", label: "SDD" },
  { value: "cdd", label: "CDD" },
  { value: "edd", label: "EDD" },
];

export function ProfileDdLevelSelector({
  profileId,
  currentLevel,
  onLevelChanged,
}: Props) {
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    if (!next || next === currentLevel || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_diligence_level: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update DD level");
      }
      onLevelChanged(next);
      toast.success(`DD level updated to ${next.toUpperCase()}`, {
        position: "top-right",
      });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update DD level",
        { position: "top-right" },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <select
      aria-label="Due diligence level"
      value={currentLevel ?? ""}
      onChange={(e) => void handleChange(e.target.value)}
      disabled={saving}
      className="h-6 w-20 rounded-md border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-navy/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {!currentLevel && <option value="">DD</option>}
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
```

Why native works here:
- No portal — the dropdown is browser-managed, not affected by parent `stopPropagation`.
- The browser maps `<option value="sdd">SDD</option>` to display "SDD" automatically; no `SelectValue` render-prop dance.
- Click + keyboard + screen-reader behaviour is platform-native, no library bugs to inherit.
- Tiny visual footprint — h-6 w-20 matches the existing trigger size; rounded border keeps it consistent with the rest of the chip-y header.

Drop the `Select` / `SelectContent` / `SelectItem` / `SelectTrigger` / `SelectValue` imports. The component now has zero dependency on `src/components/ui/select.tsx`.

---

## Step 3 — Smoke test

1. Elarix LLC Pending popover no longer lists Driving Licence / National ID Card / Proof of Occupation / etc. Only org-applicable docs appear (Certificate of Incorporation, Memorandum & Articles, anything with `applies_to in ('organisation', 'both')`).
2. Bruce's Pending popover still lists individual-applicable docs (no change).
3. Click the DD selector on Bruce's profile → dropdown opens (native browser styling) → pick EDD → toast confirms → form re-renders with the previously-hidden Source-of-Wealth field visible → refresh → value persists.
4. Same on Elarix LLC's selector.
5. KYC % on Elarix recomputes to reflect the now-shorter required-docs denominator.

---

## Step 4 — Commit + push + CHANGES.md

```
fix: org profiles only count applies_to-matching docs (KYC % + Pending popover); native <select> for inline DD selector
```

CHANGES.md under `## B-115`:

```
## B-115 — Org-aware required docs + native DD selector (done <date>)

- New shared util `src/lib/kyc/applicableDocTypes.ts` filters `document_types` by `applies_to` against a profile's record_type ("individual" / "organisation" / "both"); legacy NULL rows are kept.
- `calcKycPct` (ServiceDetailClient.tsx) now filters required docs through the helper. Elarix LLC's KYC % stops counting individual-only doc types as missing.
- `computeProfilePendingItems` (src/lib/services/computePendingItems.ts) same filter — org Pending popover no longer lists Driving Licence / National ID Card / etc.
- `ProfileDdLevelSelector` rewritten using a native `<select>` instead of base-ui Select. Avoids the parent `stopPropagation` interaction at ServiceDetailClient.tsx:2315 and the SelectValue lowercase-render quirk. Dropdown now opens reliably and persists across refresh.
```

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] Elarix LLC's Pending popover lists only org-applicable + "both" doc types; no individual-only docs (Driving Licence, etc.)
- [ ] Elarix's KYC % reflects the org-applicable doc denominator (denominator is smaller than before; pct is higher all else equal)
- [ ] Bruce's Pending popover is unchanged (still lists individual + both docs)
- [ ] DD selector on a profile header — clicking opens the dropdown; picking a new value persists; refresh shows the new value; form reveals/hides EDD fields immediately
- [ ] Trigger text displays "SDD"/"CDD"/"EDD" in upper case (no more "sdd" lowercase)
- [ ] CHANGES.md has a single B-115 entry

---

## Tech debt to log

Append to `docs/tech-debt.md`:

- **Native `<select>` styling has visible OS variance.** macOS and Windows render the dropdown menu slightly differently. The trigger itself is styled but the open menu isn't customisable in CSS. Acceptable for now (it's a 3-option DD picker); if visual parity becomes a need, build a small custom dropdown without base-ui.
- **`document_types.applies_to` doesn't enforce values via CHECK constraint.** A typo'd value (e.g. `'individuals'` instead of `'individual'`) would silently slip through and behave like a legacy NULL — kept by default. Add a CHECK in a future migration if we start adding doc types via tools other than the admin UI.

---

## After the batch

Final commit + push → tell Vanessa one line: "B-115 done — org-aware docs + DD selector works now." Stop.
