# CLI Brief — B-068 Section Review Workflow

**Status:** Ready for CLI
**Estimated batches:** 6 (commit + push between each)
**Touches migrations:** Yes (one new table)
**Touches AI verification:** No

---

## Why this batch exists

Today the admin reviews documents one-by-one and progresses workflow stages, but there's no per-section approval workflow. Vanessa wants admins to be able to review each wizard section (Business Info, Contact, Service Details, Directors/Shareholders/UBOs, Documents, and inside KYC: each profile's Identity/Financial/Compliance subsections) independently with a status (Approved / Flagged / Rejected) and notes, with full history per section.

Reviews are **advisory** — they do NOT block application progression. Admin can override. The point is auditability and a structured trail for FSC defensibility.

This brief delivers the foundation: data layer + UI primitives + wiring into the existing admin application detail page. **B-069 redesigns the admin view to mirror the client wizard layout and apply this same pattern to KYC subsections.**

---

## Hard rules

1. Complete all 6 batches autonomously. Commit + push + update CHANGES.md after each. Do not stop unless blocked.
2. After Batch 1, run `npm run db:push` and then `npm run db:status`. Confirm Local + Remote alignment before proceeding. If drift, STOP and document in CHANGES.md.
3. Use existing shadcn/ui (`@base-ui/react`) patterns. Use `render` prop, not `asChild`.
4. Section reviews are advisory only. Never block stage progression, application submission, or any existing flow.
5. Mobile-first: 375px width. Side panel on mobile becomes bottom sheet, on desktop right-slide.
6. `npm run build` must pass before declaring any batch done.
7. Do NOT modify the existing `service_section_overrides` table — that's RAG status (separate concept).

---

## Batch 1 — Migration: `application_section_reviews`

Create `supabase/migrations/<ts>_application_section_reviews.sql`:

```sql
-- Track admin reviews per wizard section. History-preserving: every save
-- inserts a NEW row. Latest row per (application_id, section_key) is the
-- current status. Older rows are the audit trail shown at the bottom of
-- each section.

CREATE TABLE IF NOT EXISTS public.application_section_reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                    REFERENCES public.tenants(id),
  application_id  uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  section_key     text NOT NULL,
  status          text NOT NULL CHECK (status IN ('approved','flagged','rejected')),
  notes           text,
  reviewed_by     uuid REFERENCES public.profiles(id),
  reviewed_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asr_app_idx     ON public.application_section_reviews(application_id);
CREATE INDEX IF NOT EXISTS asr_app_key_idx ON public.application_section_reviews(application_id, section_key, reviewed_at DESC);
CREATE INDEX IF NOT EXISTS asr_tenant_idx  ON public.application_section_reviews(tenant_id);

ALTER TABLE public.application_section_reviews ENABLE ROW LEVEL SECURITY;

-- Admin-only access (clients never see section reviews)
CREATE POLICY "asr_admin_read"  ON public.application_section_reviews
  FOR SELECT USING (public.is_admin());
CREATE POLICY "asr_admin_write" ON public.application_section_reviews
  FOR ALL USING (public.is_admin());
```

After the file lands:

- `npm run db:push`
- `npm run db:status` — confirm pair Local + Remote with no drift
- If `public.is_admin()` doesn't exist, search the existing migrations for the actual helper name (`auth.is_admin()`, `is_admin_user()`, etc.) and use that. Don't invent one.

Add to `src/types/index.ts`:

```ts
export type SectionReviewStatus = "approved" | "flagged" | "rejected";

export interface ApplicationSectionReview {
  id: string;
  tenant_id: string;
  application_id: string;
  section_key: string;
  status: SectionReviewStatus;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string;
  // joined optional
  profiles?: { full_name: string | null } | null;
}
```

**Commit message:** `feat: add application_section_reviews table for per-section admin approval workflow`

---

## Batch 2 — API routes

Create:

- `src/app/api/admin/applications/[id]/section-reviews/route.ts`
  - **GET** — list all reviews for `applicationId`, optionally filtered by `?section_key=...`. Joined to `profiles(full_name)` for the reviewer display name. Sorted by `reviewed_at DESC` so the first row per section_key is the current status.
  - **POST** — body `{ section_key: string; status: "approved"|"flagged"|"rejected"; notes: string | null }`. Inserts a new row using `createAdminClient()`. `reviewed_by` comes from the session (use the existing admin auth helper — search for how other admin routes resolve the actor; copy that pattern). Returns the inserted row.

Both routes must:
- Use `createAdminClient()`
- Verify the caller is an admin (use the existing pattern — likely a `requireAdmin()` helper or middleware)
- Return JSON with shape `{ data?: ApplicationSectionReview | ApplicationSectionReview[]; error?: string }`

**Commit message:** `feat: section reviews API — list + create endpoints`

---

## Batch 3 — `SectionReviewBadge` + `SectionReviewButton` components

Create `src/components/admin/SectionReviewBadge.tsx`:

- Props: `status: SectionReviewStatus | null` (null when no review yet)
- Renders a small pill/badge with color:
  - `approved` → green (`bg-green-100 text-green-700`) + checkmark icon
  - `flagged` → amber (`bg-amber-100 text-amber-700`) + flag icon
  - `rejected` → red (`bg-red-100 text-red-700`) + X icon
  - `null` → "Not reviewed" (`bg-gray-100 text-gray-500`) + neutral dot
- Use `lucide-react` icons (CheckCircle2, Flag, XCircle, Circle)

Create `src/components/admin/SectionReviewButton.tsx`:

- Props: `applicationId: string; sectionKey: string; sectionLabel: string; currentStatus: SectionReviewStatus | null; onReviewSaved: (review: ApplicationSectionReview) => void`
- Renders an outline Button with text "Review" and a small icon
- On click: opens a `SectionReviewPanel` (built in Batch 4)

The button + badge combo will sit next to each section's CardTitle. Shared header pattern — provide a wrapper component:

Create `src/components/admin/SectionHeader.tsx`:

```tsx
interface Props {
  title: string;
  applicationId: string;
  sectionKey: string;
  currentStatus: SectionReviewStatus | null;
  onReviewSaved: (review: ApplicationSectionReview) => void;
  rightSlot?: React.ReactNode; // for existing actions like Documents uploader
}
```

Renders: `[CardTitle] [Badge] [right-aligned: rightSlot, ReviewButton]`. Use existing `flex items-center justify-between` with `gap-2`.

**Commit message:** `feat: section review badge + button + header components`

---

## Batch 4 — `SectionReviewPanel` (right-slide modal)

Create `src/components/admin/SectionReviewPanel.tsx`:

- Use the existing shadcn/ui `Sheet` component (`@/components/ui/sheet`). If it doesn't exist in the project, search for the modal pattern used elsewhere (e.g. `Dialog`) and use the same library — DO NOT pull in Radix or any new UI library.
- Props: `applicationId; sectionKey; sectionLabel; open; onOpenChange; onSaved: (review) => void`
- Content (top to bottom):
  1. Section label as the panel title (e.g. "Review: Business Information")
  2. Three radio-style large buttons: Approved (green border on select), Flagged (amber), Rejected (red). Use `RadioGroup` if shadcn has one, else three styled buttons with one-of-three state.
  3. Notes textarea (`<Textarea>`) — required when status is `rejected` or `flagged`, optional when `approved`. Min 4 rows.
  4. Buttons row at bottom: Cancel + Save. Save is disabled until status is selected and (if required) notes are filled.
- On Save: POST to `/api/admin/applications/[id]/section-reviews`. On success, call `onSaved(review)` then close panel. Toast on success/error.
- Width: `sm:max-w-md` on desktop. On mobile, full width / bottom sheet behavior — use whatever side prop the project uses. **Right-slide on desktop** — confirmed requirement.
- Do NOT cover the page details — the sheet is anchored to the right edge with the page underneath visible (not a backdrop overlay full opacity). If the existing Sheet uses a darkened backdrop, keep it but ensure the page is still visible. Acceptable to use `bg-black/20` or no overlay — match what other admin Sheets in the project do.

**Commit message:** `feat: right-slide section review panel with status + notes form`

---

## Batch 5 — `SectionNotesHistory` component

Create `src/components/admin/SectionNotesHistory.tsx`:

- Props: `reviews: ApplicationSectionReview[]` (already filtered to a single section_key, sorted DESC by reviewed_at)
- Renders a collapsible section at the bottom of a Card's content:
  - Header: `Admin notes (N)` with chevron — collapsed by default
  - Expanded: list of reviews, each row shows:
    - status badge (small, inline)
    - notes (italic if not present, "No notes")
    - reviewer name (from `profiles.full_name` if joined, else "Admin")
    - relative date (use `date-fns` `formatDistanceToNow` if available, else absolute `toLocaleString()`)
- Empty state when reviews is `[]`: render nothing (don't show the header).

This component sits inside the CardContent at the bottom, separated by `border-t mt-4 pt-3`.

**Commit message:** `feat: per-section admin notes history at bottom of each section`

---

## Batch 6 — Wire into existing admin app detail page

Update `src/app/(admin)/admin/applications/[id]/page.tsx`:

1. **Server-side fetch all section reviews** for this application:
   ```ts
   const { data: sectionReviews } = await supabase
     .from("application_section_reviews")
     .select("*, profiles:reviewed_by(full_name)")
     .eq("application_id", id)
     .order("reviewed_at", { ascending: false });
   ```
2. Group them by `section_key` — write a small helper `groupBySection(reviews)` returning `Record<string, ApplicationSectionReview[]>` with each array sorted DESC.
3. The first row per section_key is `currentStatus` for that section. The rest is history.
4. Wrap the page content in a client component shell `AdminApplicationSections.tsx` so that section state can update reactively without full page refresh after a review save. The existing top-level page stays a server component.

Update `src/components/admin/AdminApplicationSections.tsx` (new client component):

- Receives `applicationId` + initial `sectionReviews` from server.
- Holds local state of section reviews so optimistic updates work after Save.
- Renders the existing children as-is, but each Card uses the new `SectionHeader` instead of inline `CardHeader > CardTitle`.

**Section keys to wire:**

| Section key | Section label | Where it lives |
|---|---|---|
| `business` | Business Information | Inside `EditableApplicationDetails.tsx` (the business Card) |
| `contact` | Contact Information | Inside `EditableApplicationDetails.tsx` (the contact Card) |
| `service` | Service Details | Inside `EditableApplicationDetails.tsx` (the service Card) |
| `people` | Directors, Shareholders & UBOs | Section D Card in page.tsx |
| `documents` | Documents | Documents Card in page.tsx |

**Wiring pattern per section:**

```tsx
<Card>
  <SectionHeader
    title="Business Information"
    applicationId={id}
    sectionKey="business"
    currentStatus={currentStatusFor("business")}
    onReviewSaved={(r) => addReview(r)}
    rightSlot={<EditButton />}
  />
  <CardContent>
    {/* existing content */}
    <SectionNotesHistory reviews={historyFor("business")} />
  </CardContent>
</Card>
```

For `EditableApplicationDetails.tsx`: that file already structures Cards for business / contact / service. Pass `sectionReviews` through and render `SectionHeader` + `SectionNotesHistory` inside each Card. Do NOT break the existing edit flow — the `rightSlot` should hold the existing Edit/Save/Cancel actions for that section.

**Do NOT wire** these sections (they're informational, not reviewable):
- AI Flagged Discrepancies
- Verification Checklist
- The right-column sidebar items (Stage Management, Communication, Audit Trail, Account Manager)

**Acceptance:**
- Each of the 5 reviewable sections has a status badge (gray "Not reviewed" by default), a Review button, and a collapsible notes history at the bottom.
- Clicking Review opens a right-slide panel that doesn't fully cover the section content.
- Saving a review updates the badge immediately (optimistic) and adds a row to the history.
- Saving rejected/flagged without notes is blocked client-side.
- Existing edit flows on Business/Contact/Service still work.
- `npm run build` passes.
- Mobile (375px) renders cleanly: panel becomes a bottom sheet or full-screen, badge wraps below title if needed.

**Commit message:** `feat: wire section reviews into admin application detail page`

---

## Final step (after Batch 6)

1. Run `npm run build` one more time end-to-end.
2. Update `CHANGES.md` with the B-068 completion entry. Reference the migration filename and the 5 wired section keys.
3. Run the dev-server restart pattern in the background:
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. Final commit + push (the CHANGES.md update if not already in the last batch's commit).
5. Stop. B-069 is the next brief and continues from here.

---

## Out of scope (deferred to other briefs)

- Mirroring the client wizard layout in admin view — **B-069**
- Section reviews on KYC subsections (Identity / Financial / Compliance per profile) — **B-069**
- Field-level "from doc" provenance markers — **B-070**
- Service-template ↔ document binding, scope admin UI — **B-071**
- Admin Actions registry + Substance Review — **B-072**

---

## Open questions (do not block — choose sensibly)

- Section ordering: keep current order on the page. Don't reorder.
- Status icons: use lucide-react `CheckCircle2 / Flag / XCircle / Circle`.
- "Not reviewed" badge can be subtle (gray) so it doesn't shout on every section.
- If `Sheet` component doesn't exist, copy the project's existing modal/dialog pattern — there will be one already in use for KYC or document preview.
