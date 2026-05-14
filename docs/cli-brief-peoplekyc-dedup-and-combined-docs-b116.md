# CLI Brief — B-116 People & KYC Profile Dedup + Documents Step Combined Total

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches API:** No
**Touches AI verification:** No
**Builds on:** B-114 (calcKycPct), B-115 (applies_to filter)

---

## Pre-flight

Run `git pull origin main`. No specific feat to wait on — B-115 already landed.

---

## Why this batch exists

Two aggregate-percentage corrections on `/admin/services/[id]`:

1. **People & KYC step pct over-weights profiles with multiple roles.** Today `peopleKycPct` averages `typedRoles` — that's one row per (profile × role) — so Bruce (Director + Shareholder + UBO) gets counted 3 times while Elarix (Director only) is counted once. With Bruce at 100% and Elarix at 24% and Vanessa at 49%, the math becomes `(100×3 + 24 + 49×2) / 6 = 70%` instead of the real per-profile average `(100 + 24 + 49) / 3 ≈ 58%`. Fix: dedupe by profile id before averaging.
2. **Documents step shows only service-level docs.** `documentsExpectedCount = serviceDocTypes.length` (currently 11), ignoring KYC docs entirely. Vanessa wants the Documents step pill to reflect every doc on the service — service-level docs **and** per-profile KYC docs (applies_to-aware so org profiles don't count individual-only docs). Combined denominator, combined numerator (uploaded + waived), single honest %.

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **No new endpoints, no migrations.** Pure aggregation reshuffle.
4. **No `as any`.**
5. **Don't restart the dev server.**

---

## Step 1 — Dedupe profiles in `peopleKycPct`

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) line ~4477-4488.

Current:

```ts
const kycProfileEntries = typedRoles
  .map((r) => r.client_profiles)
  .filter((p): p is NonNullable<typeof p> => p !== null);
const kycPct = hasDirector && kycProfileEntries.length > 0
  ? Math.round(
      kycProfileEntries.reduce(
        (sum, p) => sum + calcKycPct(pctInputForProfile(p)),
        0,
      ) / kycProfileEntries.length,
    )
  : 0;
```

Replace with a profile-id-deduped version:

```ts
// B-116 — typedRoles has one row per (profile × role); a profile with N
// roles would be counted N times, over-weighting multi-role people. Dedupe
// by profile id so each unique profile contributes its KYC % exactly once.
const uniqueKycProfiles = useMemo(() => {
  const byId = new Map<string, NonNullable<typeof typedRoles[number]["client_profiles"]>>();
  for (const r of typedRoles) {
    if (!r.client_profiles) continue;
    if (!byId.has(r.client_profiles.id)) {
      byId.set(r.client_profiles.id, r.client_profiles);
    }
  }
  return Array.from(byId.values());
}, [typedRoles]);

const kycPct = hasDirector && uniqueKycProfiles.length > 0
  ? Math.round(
      uniqueKycProfiles.reduce(
        (sum, p) => sum + calcKycPct(pctInputForProfile(p)),
        0,
      ) / uniqueKycProfiles.length,
    )
  : 0;
```

Drop the old `kycProfileEntries` constant; it's superseded by `uniqueKycProfiles`. Verify no other code references it.

Also audit `incompleteProfileCount` (used as a step-pill count badge — line ~3755). If it walks `typedRoles`, switch it to walk `uniqueKycProfiles` so the count reflects unique people, not role assignments.

---

## Step 2 — Documents step counts service + KYC docs

File: same — `documentsExpectedCount` / `documentsUploadedCount` block at line ~4542-4549.

### Step 2.1 — Compute applicable KYC docs per profile

KYC doc types are filtered by `applies_to` against the profile's record_type (B-115's `filterDocTypesForRecordType`). Each profile's applicable doc list goes into the denominator. Sum across profiles for the service total.

```ts
import { filterDocTypesForRecordType } from "@/lib/kyc/applicableDocTypes";

// Per-profile applicable KYC doc types — keyed by profile id.
const applicableKycDocsByProfile = useMemo(() => {
  const map = new Map<string, DocumentType[]>();
  for (const p of uniqueKycProfiles) {
    map.set(p.id, filterDocTypesForRecordType(kycDocTypes, p.record_type));
  }
  return map;
}, [uniqueKycProfiles, kycDocTypes]);

// Denominator for KYC docs across all profiles.
const kycDocsExpectedCount = useMemo(() => {
  let n = 0;
  for (const arr of applicableKycDocsByProfile.values()) n += arr.length;
  return n;
}, [applicableKycDocsByProfile]);

// Numerator for KYC docs — uploaded OR waived per (profile, doc_type).
const kycDocsCompletedCount = useMemo(() => {
  let n = 0;
  for (const p of uniqueKycProfiles) {
    const applicable = applicableKycDocsByProfile.get(p.id) ?? [];
    for (const dt of applicable) {
      const isUploaded = kycDocs.some(
        (d) => d.document_type_id === dt.id && d.client_profile_id === p.id,
      );
      const isWaived = waivers.some(
        (w) =>
          w.scope === "person" &&
          w.client_profile_id === p.id &&
          w.document_type_id === dt.id,
      );
      if (isUploaded || isWaived) n++;
    }
  }
  return n;
}, [uniqueKycProfiles, applicableKycDocsByProfile, kycDocs, waivers]);
```

### Step 2.2 — Fold into the Documents step total

Replace the existing assignments:

```ts
// Today:
const documentsUploadedCount = uploadedServiceTypeIds.size;
const documentsExpectedCount = serviceDocTypes.length;
const documentsServiceWaivedCount = waivers.filter((w) => w.scope === "application").length;

// After:
const documentsServiceWaivedCount = waivers.filter((w) => w.scope === "application").length;
const documentsServiceCompleted = uploadedServiceTypeIds.size + documentsServiceWaivedCount;

const documentsUploadedCount = documentsServiceCompleted + kycDocsCompletedCount;
const documentsExpectedCount = serviceDocTypes.length + kycDocsExpectedCount;
```

Existing `documentsPct` calculation downstream now sees the combined totals automatically.

The section header text — currently `Documents (X of N uploaded)` — keeps the same shape. With KYC docs folded in, X and N rise; the label remains accurate.

### Step 2.3 — Don't disturb the per-tab labels inside the section

Inside `AdminDocumentsSection`, the `Service Docs (0/11)` and `KYC Documents (12)` tab labels are computed independently from `serviceDocTypes` / `kycDocTypes` and stay tab-scoped. No change needed there — the per-tab labels are correct as a drill-down. Only the parent step pill + section header reflect the combined number.

### Step 2.4 — Smoke test

1. Bruce 100%, Elarix 24%, Vanessa 49% → People & KYC pill reads ~58%, not 70%.
2. Documents step pill: with 0 of 11 service docs uploaded and 3 of (say) 22 KYC docs uploaded, header reads ~9% or so based on the combined denominator. The earlier "0 of 11 uploaded" number disappears in favour of "3 of 33 uploaded" (or whatever the combined totals work out to).
3. Toggling a service-level waiver bumps the combined Documents pct. Same for a per-profile KYC waiver.
4. The People & KYC step pill is unchanged by Documents changes (separate aggregation).

---

## Step 3 — Commit + push + CHANGES.md

```
fix: dedupe profiles in peopleKycPct + Documents step counts service docs + per-profile KYC docs (applies_to-aware)
```

CHANGES.md under `## B-116`:

```
## B-116 — People & KYC dedup + combined Documents total (done <date>)

- `peopleKycPct` now averages each unique profile exactly once instead of weighting by role-row count. Bruce-with-3-roles no longer triple-weights his 100% in the aggregate.
- `incompleteProfileCount` reads the deduped profile set.
- Documents step pill/section header now reflects service docs + per-profile KYC docs combined (applies_to-aware via `filterDocTypesForRecordType`, waiver-aware for both scopes). Per-tab labels inside the section remain tab-scoped.
```

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] On the screenshot's test service: People & KYC step pill reads ~58% (was 70%). Math: (100 + 24 + 49) / 3 = 57.66 → 58.
- [ ] Documents step pill: header reads "X of N uploaded" where N is `serviceDocTypes.length + Σ applicable KYC doc types per profile`. E.g. 11 service + (Bruce-applicable) + (Vanessa-applicable) + (Elarix-applicable, org-filtered) = N
- [ ] Per-tab labels inside the Documents section ("Service Docs (0/11)" and "KYC Documents (12)") unchanged
- [ ] Waiving a service doc bumps the Documents % correctly
- [ ] Waiving a per-profile KYC doc bumps the Documents % AND keeps the per-profile KYC % flow correct
- [ ] CHANGES.md has a single B-116 entry

---

## Tech debt to log

Append to `docs/tech-debt.md`:

- **Documents step and per-profile KYC % share the same underlying KYC-doc data.** Waiving a person-scope doc bumps both metrics. Conceptually correct (the doc is "done" both at the profile level and the service level) but worth flagging — a future "all-up service completion" might want to deduplicate further, or each metric should explicitly call out what it counts.

---

## After the batch

Final commit + push → tell Vanessa one line: "B-116 done — People & KYC dedups by profile, Documents step counts both service + KYC docs." Stop.
