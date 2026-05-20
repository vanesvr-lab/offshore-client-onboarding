# B-147 — /admin/profiles/[id] uses the same rich KYC view as the service detail per-director card

## Why

When admin clicks into a profile from `/admin/profiles`, they get a simpler display-mostly view via a custom `<KycSection>` renderer + a basic documents list. The per-director card on the service detail page (`/admin/services/[id]` → People & KYC) is much richer:

- Editable KYC long form (Identity / Financial / Compliance / Tax sections)
- Documents grid by category (Identity, Financial, Compliance) with status badges
- DD-level dropdown + Portal access + Resend KYC + filing-rep affordance
- AI-driven prefill icons next to fields with extracted values

Vanessa wants the standalone profile detail page to use the **same** rich, editable view — minus the per-service affordances (roles, Remove from service, per-service section reviews) since they don't apply when the profile isn't being viewed in the context of a specific service.

Good news: the rich view's building blocks (`IndividualKycForm`, `OrganisationKycForm`, `KycDocsByCategory`, `KycDocsSummary`) are already standalone reusable components in `src/components/kyc/`. The work is mostly swapping the simpler rendering on `/admin/profiles/[id]` for these components — not a refactor of the service detail page.

## Out of scope (do NOT do in B-147)

- **Role / "On these services" section** — the profile may be attached to multiple services. Listing them on the profile page is a useful follow-up but NOT in this brief's scope (defer to B-148 or later).
- **Audit trail card on the profile detail page** — also useful, also a follow-up.
- **Service-tied affordances** — "Remove from service", per-service section reviews, role checkboxes (Director / Shareholder / UBO). Those stay on the per-service per-director card only.
- **Refactoring the service-detail per-director card into a shared component** — both surfaces use the same building blocks, so they stay in sync without a shared wrapper.
- **Substance review** — service-level, not profile-level.

## Permission gates

Same as the service-detail per-director card:
- Editing KYC field values: `data_access = 'edit'` (per B-127). Junior Officer / Auditor render read-only.
- Filing rep changes: `data_access = 'edit'`.
- Send Invite / Resend Invite: `send_communications`.
- Document upload / replace: existing rules.

---

## Batch 1 — Replace the KYC sections rendering with `IndividualKycForm` / `OrganisationKycForm`

### Update `src/app/(admin)/admin/profiles/[id]/ProfileDetailClient.tsx`

Current state (around lines 480-492):

```tsx
{!isRep && kyc && (
  <div className="space-y-3">
    <h2 className="text-sm font-semibold text-gray-700">KYC Details</h2>
    {sections.map((s) => (
      <KycSection
        key={s.title}
        title={s.title}
        fields={s.fields}
        data={kyc as unknown as Record<string, unknown>}
      />
    ))}
  </div>
)}
```

Replace the inner sections loop with the same form component the service-detail per-director card uses. The form's API takes a `profileId` and an `initialRecord` (the KYC row) and handles its own saves via the existing `/api/profiles/kyc/save` endpoint (which already accepts admin saves per B-131's auth check):

```tsx
{!isRep && kyc && (
  isOrg ? (
    <OrganisationKycForm
      profileId={profile.id}
      initialRecord={kyc as unknown as KycRecord}
      // … pass any other required props (see how ServiceDetailClient
      //   calls it — same shape) …
    />
  ) : (
    <IndividualKycForm
      profileId={profile.id}
      initialRecord={kyc as unknown as KycRecord}
      // … same props as the service-detail invocation …
    />
  )
)}
```

CLI: read how `ServiceDetailClient.tsx` invokes `IndividualKycForm` / `OrganisationKycForm` to mirror the prop shape exactly. The standalone profile invocation should NOT pass any service-scoped props (no `serviceId`, no `roleId`, no per-service section-review hooks).

### Drop the legacy `KycSection` import + component usage from this file

The custom `<KycSection>` was a stopgap. After Batch 1, it's unused on this page. CLI: if the component is used ONLY by `ProfileDetailClient.tsx`, the import gets dropped; if used elsewhere, leave the component but stop importing it here.

### Document conversion: legacy `documents` list → `KycDocsByCategory`

The current page's Documents card (line 513+) renders a simple list:

```tsx
{documents.length > 0 && (
  <Card>
    <CardHeader …>Documents ({documents.length})</CardHeader>
    <CardContent>
      {documents.map((doc) => <li>…</li>)}
    </CardContent>
  </Card>
)}
```

Replace with the per-category grid + summary header used on the service detail page:

```tsx
{!isRep && (
  <Card>
    <CardHeader …>
      <CardTitle>KYC Documents</CardTitle>
      <KycDocsSummary documents={documents} /> {/* total + per-category counts + waived */}
    </CardHeader>
    <CardContent>
      <KycDocsByCategory
        documents={documents}
        profileId={profile.id}
        // … any other props the service-detail invocation passes …
      />
    </CardContent>
  </Card>
)}
```

Reference the service detail page's invocation for the exact prop list. Mirror what it does, omit only the service-tied props.

### Verification (Batch 1)

```bash
npm run build
npm run lint
```

Manual:
1. Open `/admin/profiles` → click any individual director profile (e.g. Tony Stark). The detail page now renders:
   - Contact info card (existing)
   - **Editable** KYC long form via `IndividualKycForm` — same as the service detail page (Your Identity, Financial, Compliance, Tax)
   - **KYC Documents** card with the per-category grid (Identity / Financial / Compliance counts + status badges) instead of the flat list
2. Edit a field in the KYC form → click outside / wait for autosave → field persists.
3. Open an organisation profile (record_type='organisation') → page renders `OrganisationKycForm` instead.
4. Open a representative profile (is_representative=true) → "Representatives do not require KYC" banner shows (existing behavior preserved).

### Commit message (Batch 1)

```
feat: /admin/profiles/[id] uses rich editable KYC view (B-147)

Replaces the custom display-mostly <KycSection> + flat documents
list with the same IndividualKycForm / OrganisationKycForm +
KycDocsByCategory + KycDocsSummary components used by the
service-detail per-director card. Profile-canonical mode: no
service-tied affordances (roles, Remove-from-service, per-service
section reviews). Edit/save behavior is identical to the service
detail because the underlying components save via
/api/profiles/kyc/save which already handles both auth contexts.
```

---

## Batch 2 — Filing rep affordance on the profile page

The service-detail per-director card has the B-134 "+ Add representative for KYC" affordance / "Filed by [name] [change]" badge inline. The standalone profile page should also expose this so admins can manage the rep without going through a specific service.

Add the same affordance to `/admin/profiles/[id]`, somewhere near the Contact Information card (or as its own card below). The component lives in / can be pulled out of the service-detail page's per-director rendering. CLI: same pattern as Batch 1 — find the inline JSX in `ServiceDetailClient.tsx` (the `Filed by` + change button + rep picker), and either:

- Extract it into a `<ProfileFilingRepCard profileId={profile.id} ... />` reusable component, OR
- Inline a copy on the profile page (faster, ~30 lines)

CLI's call. The first is cleaner if the inline JSX is fairly self-contained; the second is faster.

### Verification (Batch 2)

Manual:
1. Open a director profile that has no filing rep → "+ Add representative for KYC" button appears.
2. Click → existing rep picker modal opens (same as service detail) → pick a rep → button changes to "Filed by [name] [change]".
3. Same flow on a profile that already HAS a filing rep set → "Filed by [name] [change]" shows.

### Commit message (Batch 2)

```
feat: filing rep affordance on /admin/profiles/[id] (B-147)

Same "+ Add representative for KYC" / "Filed by [name] [change]"
control from the service-detail per-director card, now available
on the standalone profile detail page. Lets admin manage the rep
without going through a specific service.
```

---

## Batch 3 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-147 — Rich KYC view on profile detail page (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Profile detail page could also show 'On services' list — the profile may be attached to multiple services; surfacing them with their roles (e.g. 'Director on GBC-0005, Shareholder on AC-0001') would give admins a one-page view. ~1-2 hours; new brief when needed."
- **Add new Open entry**: "Audit trail card on profile detail page — same as service detail's right-rail Audit Trail card, but filtered to events affecting this profile. ~2 hours."
- **Add new Open entry**: "Eventual shared `<ProfileKycCard>` component — service-detail per-director card and the standalone profile page now use the same building blocks but mount them independently. If both grow more affordances in parallel and drift, refactor into a shared wrapper that accepts an optional `serviceId` for service-mode. ~half-day; not urgent."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure UI change reusing existing components.
2. **Per-batch commits:** three commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No "On these services" list on the profile detail page.
- No audit trail card on the profile detail page.
- No service-tied affordances (roles, Remove from service, per-service section reviews).
- No refactor of the service-detail per-director card into a shared component.
- Legacy `<KycSection>` custom component stays in the codebase if used elsewhere; only removed from `ProfileDetailClient.tsx`'s imports.
