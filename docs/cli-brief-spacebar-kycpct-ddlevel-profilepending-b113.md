# CLI Brief — B-113 Spacebar Fix + KYC % Fix + Inline DD-Level Selector + Per-Profile Pending Popover

**Status:** Ready for CLI
**Estimated batches:** 3
**Touches migrations:** No
**Touches API:** No (reuses existing endpoints)
**Touches AI verification:** No
**Builds on:** B-110 (force-review notes), B-111 (computePendingItems), B-112 (pill gauges)

---

## Pre-flight

Run `git pull origin main`. No specific feat to wait on — B-112 already landed.

---

## Why this batch exists

Four corrections to `/admin/services/[id]`:

1. **Spacebar swallowed when typing notes in the KYC review dialog.** The `SectionReviewPanel` sheet portals to body but React synthetic events bubble through the React parent tree. Two `<div role="button">` collapsible headers above the sheet (in `ServiceDetailClient.tsx`) have an `onKeyDown` that calls `e.preventDefault()` on space — swallowing the space before it reaches the focused textarea, and toggling the underlying section.
2. **Profile KYC % is wrong** — Bruce is at 80% even though every required field at his CDD level is filled. Two bugs in `calcKycPct`: it counts `source_of_funds_description` (optional "Additional context") as required, and counts `source_of_wealth_description` (which is `eddOnly: true` — hidden from CDD profiles entirely).
3. **Can't change DD level on the service page** — admin has to navigate to `/admin/clients/[id]` or `/admin/profiles/[id]` to bump a profile from CDD to EDD. Add an inline selector on the per-profile header strip.
4. **No per-profile pending view** — the service-level Pending card (B-111) is great for whole-service triage, but admin still has to scan it to find what's pending *for a specific profile*. Add a "Pending (N)" button on each profile header → popover listing items scoped to that profile.

---

## Hard rules

1. **Three batches, three commits.** After each: stage specific files → commit → `git push origin HEAD:main` → CHANGES.md sub-entry under `## B-113` → next.
2. `npm run build` clean after each batch.
3. **No new endpoints, no migrations.** Reuses existing APIs.
4. **No `as any`.**
5. **Don't restart the dev server.**

---

## Batch 1 — Spacebar fix + KYC % fix

Quick wins; both are bug fixes.

### Step 1.1 — Spacebar fix

Two `<div role="button" tabIndex={0}>` collapsible headers in [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) intercept space at the React parent level:

- Line ~862 (KycLongFormSection header):
```jsx
onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
```
- Line ~2476 (per-profile docs expanded toggle): same pattern.

When `SectionReviewPanel` opens over the page and admin types in the notes textarea, the keydown bubbles through React → hits these handlers → `preventDefault()` swallows the space.

Fix both handlers — only act when focus is on the header itself, not bubbled from a descendant:

```jsx
onKeyDown={(e) => {
  if (e.target !== e.currentTarget) return;   // ignore bubbled events from children
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    onToggle();
  }
}}
```

Same change at both line locations.

**Audit**: `git grep -n 'role="button"' src/` — if any other elements use the same toggle-on-space pattern across a React subtree that may contain portal'd inputs (e.g. document detail dialog, alerts dialog), apply the same `e.target !== e.currentTarget` guard.

### Step 1.2 — `calcKycPct` fix

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) line ~162.

Current:

```ts
function calcKycPct(kyc: KycFull | null): number {
  if (!kyc) return 0;
  const KYC_FIELDS = [
    "date_of_birth", "nationality", "passport_number", "passport_expiry",
    "occupation", "address", "source_of_funds_description", "source_of_wealth_description",
    "is_pep", "legal_issues_declared",
  ];
  // …
}
```

Two issues:
- `source_of_funds_description` is optional (no `required: true` in `src/lib/kyc/sections.ts`) — should not count toward required-fields-filled %.
- `source_of_wealth_description` is `eddOnly: true` — only renders for profiles where DD level is EDD.

Replace with DD-aware logic:

```ts
function calcKycPct(kyc: KycFull | null, ddLevel?: string | null): number {
  if (!kyc) return 0;
  const KYC_FIELDS: string[] = [
    "date_of_birth", "nationality", "passport_number", "passport_expiry",
    "occupation", "address",
    "is_pep", "legal_issues_declared",
  ];
  // source_of_funds_description: optional ("Additional context" textarea) — exclude.
  // source_of_wealth_description: EDD-only — include only when ddLevel === "edd".
  if (ddLevel === "edd") {
    KYC_FIELDS.push("source_of_wealth_description");
  }
  const filled = KYC_FIELDS.filter((f) => {
    const v = (kyc as Record<string, unknown>)[f];
    if (typeof v === "boolean") return true;  // booleans count as filled once set
    if (v == null || v === "") return false;
    return true;
  });
  return Math.round((filled.length / KYC_FIELDS.length) * 100);
}
```

Every caller of `calcKycPct` must pass the DD level. Two locations to update:
- The per-profile `PersonCard` (line ~1620): `const kycPct = calcKycPct(kyc, profile.due_diligence_level);`
- Any other invocation — grep `calcKycPct(` and pass DD level.

Update the `stepsWithState` memo in B-111 that aggregates People & KYC completion: it should call `calcKycPct(kyc, profile.due_diligence_level)` per profile and average.

For organisation profiles, the existing field list might be wrong (DOB / nationality / passport don't apply). Out of scope for this batch — file a tech-debt entry: "`calcKycPct` uses an individual-shaped field list; for organisation profiles it always under-counts. Move to a `KYC_REQUIRED_FIELDS_FOR_RECORD_TYPE` lookup."

### Step 1.3 — Smoke test

Re-open Bruce's profile (or any CDD profile with all required fields filled and no Additional context) → should now show 100%.

### Step 1.4 — Commit + push + CHANGES.md

```
fix: spacebar in KYC review notes + KYC % counts only required fields gated by DD level
```

CHANGES.md under `## B-113` → batch 1.

---

## Batch 2 — Inline DD-level selector on per-profile header

**Goal:** admin can change a profile's `due_diligence_level` directly from the service page without navigating away.

### Step 2.1 — Reuse the existing PATCH endpoint

`AccountProfilesTable` already calls a PATCH to update DD level (see `src/components/admin/AccountProfilesTable.tsx` line ~82 — it sends `{ due_diligence_level: val }`). Find the endpoint URL it uses and reuse exactly that. If the endpoint is profile-scoped (e.g. `/api/admin/profiles/[id]`) without requiring a `client_id` in the path, this is a direct reuse.

If the endpoint is client-scoped (`/api/admin/clients/[clientId]/profiles/[profileId]`), check whether the service detail page has the client id in scope — `profile.client_id` or via the service's owning client. If not in scope, fetch it lazily on first DD change OR extend the API loader to surface it.

### Step 2.2 — Component

File: `src/components/admin/ProfileDdLevelSelector.tsx`.

```tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Props {
  profileId: string;
  currentLevel: string | null;
  onLevelChanged: (next: string) => void;
}

const OPTIONS = [
  { value: "sdd", label: "SDD" },
  { value: "cdd", label: "CDD" },
  { value: "edd", label: "EDD" },
];

export function ProfileDdLevelSelector({ profileId, currentLevel, onLevelChanged }: Props) {
  const [saving, setSaving] = useState(false);

  async function handleChange(next: string) {
    if (next === currentLevel || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profileId}`, {  // verify exact path
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_diligence_level: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to update DD level");
      }
      onLevelChanged(next);
      toast.success(`DD level updated to ${next.toUpperCase()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Select value={currentLevel ?? ""} onValueChange={(v) => v && handleChange(v)} disabled={saving}>
      <SelectTrigger className="h-7 w-20 text-xs">
        <SelectValue placeholder="DD" />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

### Step 2.3 — Mount on the per-profile header

In `ServiceDetailClient.tsx`, the per-profile header strip (currently shows avatar, name, roles, KYC %, Local Director badge, Review button — around line 1955-1990). Add the selector adjacent to the role chips:

```tsx
<ProfileDdLevelSelector
  profileId={profile.id}
  currentLevel={profile.due_diligence_level}
  onLevelChanged={(next) => {
    // Patch parent state so the form re-renders + the KYC % recomputes.
    onProfileSaved?.(profile.id, null, { due_diligence_level: next, ... });
    // Or trigger router.refresh() if simpler.
  }}
/>
```

The form below uses `dueDiligenceLevel={profile.due_diligence_level}` (line ~2225) — when state updates, `KycLongForm` re-renders, `gateSectionForLevel` runs with the new level, and EDD-only fields appear / disappear instantly.

### Step 2.4 — Audit-log

The existing PATCH endpoint should already audit DD-level changes. If it doesn't, add it (action: `profile_dd_level_changed`, metadata: `{ old_level, new_level }`).

### Step 2.5 — Commit + push + CHANGES.md

```
feat: inline DD-level selector on per-profile header — change level without leaving the service page
```

CHANGES.md under `## B-113` → batch 2.

---

## Batch 3 — Per-profile pending popover

**Goal:** a "Pending (N)" button on each profile header → popover listing what's pending for that specific profile only.

### Step 3.1 — Extend `PendingItem` with profile scope

File: [`src/lib/services/computePendingItems.ts`](src/lib/services/computePendingItems.ts).

Add an optional `profileId?: string` to `PendingItem`. Populate it for items that are clearly profile-scoped:

- `profile_kyc_<id>` (already keyed on profile id) → `profileId: p.id`
- Auto alerts with `sourceEntityType === "profile"` → `profileId: a.sourceEntityId`
- Auto alerts with `sourceEntityType === "document"` → look up the doc's `client_profile_id` if present, set `profileId` accordingly (service docs leave it null)
- Manual alerts pinned to a profile (currently no profile linkage in `service_alerts` — leave null for now)

Non-profile-scoped items (rejected/flagged section reviews at the step level, missing service docs, sections in progress at the step level) keep `profileId: undefined`.

### Step 3.2 — Per-profile compute

Add to `computePendingItems.ts`:

```ts
export function filterPendingForProfile(
  items: PendingItem[],
  profileId: string,
): PendingItem[] {
  return items.filter((i) => i.profileId === profileId);
}
```

Or, more useful — a per-profile-only compute that ALSO inspects profile-specific gaps the service-level list doesn't surface granularly:

```ts
export function computeProfilePendingItems(input: {
  profile: ClientProfile;
  kyc: KycFull | null;
  ddLevel: string;
  profileDocuments: ServiceDoc[];
  documentTypes: DocumentType[];      // person-scope only
  waivers: WaivedDocumentRequirement[];
  autoAlerts: AutoAlert[];
}): PendingItem[] {
  const out: PendingItem[] = [];

  // 1. Missing required KYC fields for this profile (DD-level-gated, see calcKycPct).
  const REQUIRED_FIELDS: string[] = [
    "date_of_birth", "nationality", "passport_number", "passport_expiry",
    "occupation", "address",
  ];
  if (input.ddLevel === "edd") REQUIRED_FIELDS.push("source_of_wealth_description");
  for (const f of REQUIRED_FIELDS) {
    const v = (input.kyc as Record<string, unknown> | null)?.[f];
    if (v == null || v === "") {
      out.push({
        id: `field_${input.profile.id}_${f}`,
        severity: "warning",
        label: `${formatFieldLabel(f)} — missing`,
        actionType: "scroll_to_section",
        actionPayload: `person-card-${input.profile.id}`,
        profileId: input.profile.id,
      });
    }
  }

  // 2. Missing required KYC docs (person-scope), waiver-aware.
  for (const dt of input.documentTypes) {
    const isUploaded = input.profileDocuments.some(
      (d) => d.document_type_id === dt.id && d.client_profile_id === input.profile.id,
    );
    const isWaived = input.waivers.some(
      (w) => w.scope === "person" && w.client_profile_id === input.profile.id && w.document_type_id === dt.id,
    );
    if (!isUploaded && !isWaived) {
      out.push({
        id: `doc_${input.profile.id}_${dt.id}`,
        severity: "warning",
        label: `${dt.name} — not uploaded`,
        actionType: "scroll_to_section",
        actionPayload: `person-card-${input.profile.id}`,
        profileId: input.profile.id,
      });
    }
  }

  // 3. Profile-scoped auto alerts (doc expiry, KYC age — already keyed via sourceEntityId).
  for (const a of input.autoAlerts) {
    if (a.severity === "info") continue;
    const isThisProfile =
      (a.sourceEntityType === "profile" && a.sourceEntityId === input.profile.id) ||
      (a.sourceEntityType === "document"
        && input.profileDocuments.some((d) => d.id === a.sourceEntityId));
    if (!isThisProfile) continue;
    out.push({
      id: `alert_${input.profile.id}_${a.key}`,
      severity: a.severity,
      label: a.title,
      detail: a.note,
      actionType: a.sourceEntityType === "document" ? "open_document" : "scroll_to_section",
      actionPayload: a.sourceEntityType === "document"
        ? a.sourceEntityId
        : `person-card-${input.profile.id}`,
      profileId: input.profile.id,
    });
  }

  return out.sort(severitySorter);  // reuse from main computePendingItems
}
```

`formatFieldLabel` maps `date_of_birth → "Date of birth"`, `passport_number → "Passport number"`, etc. Tiny dictionary.

### Step 3.3 — UI: "Pending (N)" button + popover

Reuse a popover primitive. Check `src/components/ui/` for `Popover.tsx` (base-ui has a Popover). If not present, use a `Dialog` set to anchor-positioned bottom of the trigger, OR add a `Popover` wrapper now — minimal scope.

Component: `src/components/admin/ProfilePendingButton.tsx`.

```tsx
"use client";
import { useState, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { computeProfilePendingItems, type PendingItem } from "@/lib/services/computePendingItems";

interface Props {
  profileId: string;
  items: PendingItem[];                     // pre-computed by parent
  onAction: (item: PendingItem) => void;    // hand back to parent for navigation
}

export function ProfilePendingButton({ profileId, items, onAction }: Props) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
      >
        <AlertCircle className="size-3.5" />
        Pending ({items.length})
      </button>
      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-white p-3 shadow-lg"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Pending for this profile
          </p>
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => { onAction(item); setOpen(false); }}
                  className="w-full text-left text-xs text-gray-700 hover:bg-gray-50 rounded px-2 py-1.5"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

### Step 3.4 — Mount on the per-profile header

Compute per-profile items in `ServiceDetailClient.tsx`:

```ts
const perProfilePending = useMemo(() => {
  const map = new Map<string, PendingItem[]>();
  for (const role of typedRoles) {
    const p = role.client_profiles;
    if (!p) continue;
    const items = computeProfilePendingItems({
      profile: p,
      kyc: Array.isArray(p.client_profile_kyc) ? p.client_profile_kyc[0] : p.client_profile_kyc,
      ddLevel: p.due_diligence_level ?? "cdd",
      profileDocuments: profileDocs.filter((d) => d.client_profile_id === p.id),
      documentTypes: kycDocTypes,
      waivers,
      autoAlerts: autoAlertsState,
    });
    map.set(p.id, items);
  }
  return map;
}, [typedRoles, profileDocs, kycDocTypes, waivers, autoAlertsState]);
```

Pass `perProfilePending.get(profile.id) ?? []` to each `ProfilePendingButton` in the header strip. Render the button to the right of the role chips, adjacent to the new DD selector from Batch 2.

### Step 3.5 — Action handler

Re-use the action handler the service-level `ServicePendingCard` already uses (the scroll/open/open-doc switch). If it's already exported / lifted to a util, just reuse. If it's inline in the card, lift to `src/lib/services/handlePendingAction.ts` and use from both surfaces.

### Step 3.6 — Commit + push + CHANGES.md

```
feat: per-profile Pending button + popover showing what's pending for each profile
```

CHANGES.md under `## B-113` → batch 3.

---

## Acceptance criteria

- [ ] `npm run build` clean after each batch
- [ ] Typing a space inside KYC review notes inserts a space character; the underlying section does NOT collapse/expand
- [ ] Bruce (CDD, all required fields filled, no Additional context, no Source of wealth description) shows 100% — not 80%
- [ ] EDD profiles still get dinged for empty `source_of_wealth_description`
- [ ] On the per-profile header, a DD-level selector shows the current level (SDD/CDD/EDD); changing it persists, re-renders the form, and surfaces the previously-hidden EDD fields without page reload
- [ ] When a profile has pending items, a `Pending (N)` button appears in the header. Clicking opens a popover listing items scoped to that profile. Clicking an item navigates correctly (scroll/open).
- [ ] When a profile has zero pending items, no button renders (clean state)
- [ ] CHANGES.md has three sub-entries under `## B-113`

---

## Tech debt to log

Append to `docs/tech-debt.md`:

- **`calcKycPct` uses an individual-shaped field list.** Organisation profiles always under-count because DOB/nationality/passport don't apply. Move to a `KYC_REQUIRED_FIELDS_FOR_RECORD_TYPE` lookup (one list per record_type + DD level). Out of scope for B-113.
- **Manual alerts have no profile linkage.** `service_alerts` table only knows about service; for per-profile pending we can't include manual alerts. Add `client_profile_id` (nullable) to `service_alerts` and surface in the per-profile popover when set.

---

## After all three batches

Final commit + push → tell Vanessa one line: "B-113 done — spacebar fix, KYC % gated by DD level, inline DD selector, per-profile pending popover." Stop.
