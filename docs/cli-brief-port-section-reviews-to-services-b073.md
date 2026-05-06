# CLI Brief — B-073 Port Section Reviews to `/admin/services/[id]`

**Status:** Ready for CLI
**Estimated batches:** 4 (commit + push between each)
**Touches migrations:** No
**Touches AI verification:** No
**Depends on:** B-068 (tables + components) and B-069 (KYC review panel) already landed

---

## Why this batch exists

B-068 + B-069 wired section reviews + step indicator + per-subsection KYC reviews into `/admin/applications/[id]` — the **legacy** admin detail page that reads from the `applications` table. The project has since moved to a `services` data model, with the modern admin detail page at `/admin/services/[id]` (which reads from the `services` table).

All real services with `service_number` (GBC-0001 through GBC-0004, AC-0001/2/3, BAO-0001) live in `services`. The legacy `applications` table only has 1 visible row in the queue — a stale test. Vanessa wants to test the new admin section-review UI on `GBC-0002` (a real service).

The components from B-068/B-069 are already built, generic, and reusable — they just need to be plugged into the modern services detail page. The wizard-shaped 5-section structure already exists at `ServiceDetailClient.tsx` via `ServiceCollapsibleSection` blocks. **No structural redesign needed.**

This brief is a port — small, focused, no new schema.

---

## Hard rules

1. Complete all 4 batches autonomously. Commit + push + update CHANGES.md after each.
2. Do NOT introduce new tables, columns, or migrations. Reuse `application_section_reviews` as-is.
3. Reuse the existing components from B-068/B-069 unchanged where possible (`SectionReviewBadge`, `SectionReviewButton`, `SectionReviewPanel`, `SectionHeader`, `SectionNotesHistory`, `AdminApplicationSectionsProvider`, `ConnectedSectionHeader`, `ConnectedNotesHistory`, `AdminApplicationStepIndicator`, `AdminKycPersonReviewPanel`).
4. **Pass `service.id` as the `applicationId` prop value** everywhere these components expect an `applicationId`. The table column `application_section_reviews.application_id` will hold service ids going forward. This is intentional misleading-naming — see Batch 4's tech-debt entry.
5. Existing `/admin/applications/[id]` page stays functional (don't break it) — it'll be deleted in a future cleanup once we confirm the services path is the only one in use.
6. Mobile-first. 375px width must render cleanly.
7. `npm run build` must pass before declaring any batch done.

---

## Batch 1 — Server-side fetch section reviews + provider wrap

Update `src/app/(admin)/admin/services/[id]/page.tsx`:

1. Add a parallel query in the `Promise.all([...])` block to fetch section reviews for this service:

```ts
supabase
  .from("application_section_reviews")
  .select("*, profiles:reviewed_by(full_name)")
  .eq("application_id", id)   // id is the service.id; column is misleadingly named — see Batch 4
  .order("reviewed_at", { ascending: false }),
```

2. Pass the result down to `ServiceDetailClient` as a new prop `sectionReviews: ApplicationSectionReview[]`.

3. Update `ServiceDetailClient.tsx`:
   - Import `AdminApplicationSectionsProvider` from `@/components/admin/AdminApplicationSections`
   - Wrap the component's main return JSX in:
     ```tsx
     <AdminApplicationSectionsProvider
       applicationId={service.id}
       initialReviews={sectionReviews}
     >
       {/* existing JSX */}
     </AdminApplicationSectionsProvider>
     ```
   - Make sure the provider sits OUTSIDE the existing left/right grid so both the (forthcoming) step indicator and the section headers can read from the same context.

Acceptance:
- Page still renders for GBC-0002.
- `useSectionReview()` hook works in any descendant component.
- `npm run build` passes.

**Commit message:** `feat: services detail page wraps in section-reviews provider`

---

## Batch 2 — Wire `ConnectedSectionHeader` + `ConnectedNotesHistory` into the 5 ServiceCollapsibleSection blocks

Update `ServiceDetailClient.tsx`. The five existing `ServiceCollapsibleSection` blocks already render Card-shaped collapsible sections with their own headers. We need to add review affordances:

| Step | Section | section_key |
|---|---|---|
| 1 | Company Setup | `company_setup` |
| 2 | Financial | `financial` |
| 3 | Banking | `banking` |
| 4 | People & KYC | `people` |
| 5 | Documents | `documents` |

(Note: the legacy admin page used `business`, `contact`, `service` — those were three sub-cards inside Company Setup. The modern services page collapses them into a single Company Setup section, so we use one key. Cleaner.)

Approach options for `ServiceCollapsibleSection`:

**Option A — extend the component:** Add optional `sectionKey?: string` prop to `ServiceCollapsibleSection`. When provided, render the badge + Review button inside the existing section header, and append `<ConnectedNotesHistory sectionKey={sectionKey} />` at the bottom of the collapsible content.

**Option B — wrap each call site:** Wrap the existing `ServiceCollapsibleSection` children with `ConnectedSectionHeader`/`ConnectedNotesHistory` at each of the five call sites. More boilerplate but no changes to the underlying component.

**Pick Option A** — extends `ServiceCollapsibleSection` once; cleaner end result. If the component's structure makes A invasive (e.g. the header is rendered inside a `summary` element with strict layout), fall back to B.

Wire all five sections. Confirm:
- The badge and Review button appear next to each section title.
- Clicking Review opens the right-slide panel; saving updates the badge.
- Notes history appears at the bottom of each expanded section.

**Do NOT wire** review affordances into:
- The collapse-toggle clickable area itself (the badge should be visible even when collapsed; the Review button is clickable without expanding the section)
- The right-column sidebar (Stage Management, Communication, Audit Trail, Account Manager) — informational only

Acceptance:
- All 5 main sections on `/admin/services/<id>` show the new badge + Review button.
- Save flow works for each.
- Build passes.

**Commit message:** `feat: section-review affordances on all 5 ServiceCollapsibleSection blocks`

---

## Batch 3 — Step indicator + KYC subsection reviews

Two sub-tasks:

### 3a — Step indicator at top

Add `<AdminApplicationStepIndicator />` above the main grid in `ServiceDetailClient.tsx`. The existing component already aggregates status from a list of section keys per step.

Update its default `ADMIN_STEPS_DEFAULT` if needed so the section_keys match what we wired in Batch 2:

```ts
const ADMIN_STEPS_DEFAULT = [
  { id: "company-setup", label: "Company Setup", sectionKeys: ["company_setup"] },
  { id: "financial",     label: "Financial",     sectionKeys: ["financial"] },
  { id: "banking",       label: "Banking",       sectionKeys: ["banking"] },
  { id: "people-kyc",    label: "People & KYC",  sectionKeys: ["people"] },
  { id: "documents",     label: "Documents",     sectionKeys: ["documents"] },
];
```

If the indicator currently uses the legacy keys (`business`, `contact`, `service`), update it. If the indicator's keys are baked into a const that's used by both legacy + services pages, accept a `steps` prop and pass the right config from each consumer.

Smooth-scroll anchors: assign each `ServiceCollapsibleSection` an `id` matching the step id (e.g. `id="step-people-kyc"`). Click on a step in the indicator scrolls to the matching section.

### 3b — KYC subsection reviews per profile

The People & KYC step today renders profiles via the existing logic in `ServiceDetailClient.tsx` (see `KYC_SECTIONS` and `KYC_SECTIONS_ORG` arrays around line 476). Inside Step 4, render `<AdminKycPersonReviewPanel applicationId={service.id} />` BELOW the existing per-profile content.

Section key format stays as B-069 defined: `kyc:<profile_id>:<category>` where `<profile_id>` is `client_profiles.id`. The panel handles fetching its own data (or already has a server-component variant — check what was built in B-069 Batch 3 and reuse).

If `AdminKycPersonReviewPanel` was built to read profiles via its own fetch, no change needed. If it expects profiles passed in as a prop, pass `roles.map(r => r.client_profiles).filter(Boolean)` as the profiles list.

Acceptance:
- Step indicator visible at top of `/admin/services/<id>`.
- Aggregate status pills correctly reflect underlying section reviews.
- Step click → smooth-scrolls to that step.
- Inside Step 4, expanded per-profile cards show 8 KYC subsection cards each with Review affordances.
- Build passes.

**Commit message:** `feat: step indicator + per-profile KYC subsection reviews on services detail`

---

## Batch 4 — Tech debt + final polish

1. Add an entry to the Tech Debt Tracker in `CHANGES.md`:

   > **#26 — `application_section_reviews.application_id` stores service ids.** B-073 ports section reviews to `/admin/services/[id]` while reusing the existing table from B-068. The column name is misleading — it now holds either `applications.id` (legacy path, 1 stale test row) or `services.id` (modern path, going forward). Once the legacy `applications` table is fully retired, rename column to `subject_id` (or `service_id`) and rename the API route from `/api/admin/applications/[id]/section-reviews` to a service-prefixed path. Affects: `application_section_reviews` table, `/api/admin/applications/[id]/section-reviews/*` route handlers, and any component prop named `applicationId` that's now passed a service id.

2. Confirm the existing legacy admin page at `/admin/applications/[id]` still loads (the 1 stale test row should still be reachable). If it's broken because of any shared component changes, fix it.

3. Quick mobile pass at 375px on `/admin/services/<a-real-service-id>`:
   - Step indicator wraps via `flex-wrap` (already does)
   - Section badges render next to titles even on narrow viewport (no overflow)
   - KYC subsection cards stack cleanly

4. Final `npm run build`. CHANGES.md entry referencing B-073 completion + the tech debt entry. Background dev server restart:
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
5. Final commit + push.
6. Stop. B-070 / B-071 / B-072 follow.

**Commit message:** `chore: B-073 polish + tech debt #26 noted`

---

## Out of scope (deferred)

- Renaming `application_id` column → tracked as tech debt #26
- Deleting the legacy `/admin/applications/[id]` route → defer until queue is also moved to services
- Field-level provenance markers — **B-070**
- Doc-model fixes — **B-071**
- Admin Actions / Substance Review — **B-072**

---

## Open questions (do not block — choose sensibly)

- If `ServiceCollapsibleSection` is consumed by other pages besides services detail, prefer Option B (wrap at call sites) so the component stays unchanged. Else Option A is cleaner.
- The KYC panel in B-069 Batch 3 (`AdminKycPersonReviewPanel`) was built as a parallel admin component because the legacy path uses `KycStepWizard` via `PersonsManager`. The services path may use a different KYC renderer entirely (`KYC_SECTIONS` arrays directly in `ServiceDetailClient.tsx`). If `AdminKycPersonReviewPanel` doesn't slot in naturally, render the section-review affordances inline next to the existing KYC section blocks (`KYC_SECTIONS` / `KYC_SECTIONS_ORG`) instead — same `kyc:<profile_id>:<category>` keys.
- If section keys collide with legacy keys (`business` vs `company_setup`), the new keys win — only the services path is the source of truth going forward. Legacy reviews on `business` / `contact` / `service` keys are stranded test data; safe to leave.
