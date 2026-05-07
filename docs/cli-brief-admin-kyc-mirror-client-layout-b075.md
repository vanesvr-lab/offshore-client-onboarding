# CLI Brief — B-075 Admin KYC Long-Form Aligned with Client Wizard

**Status:** Ready for CLI
**Estimated batches:** 5
**Touches migrations:** No
**Touches AI verification:** No
**Resolves:** Field/label/visual divergence between admin's `KycLongForm` (defined inside `ServiceDetailClient.tsx`) and client's `KycStepWizard`. B-074 added inline section reviews to the admin path but the form schema, labels, ordering, and visual style still differ from the client view.

---

## Why this batch exists

Admin and client KYC are functionally the same form rendered two different ways:

- **Client** — `KycStepWizard` is a sequential wizard. One section at a time. Back / Next nav. Designed for clients who need guided progression.
- **Admin** — `KycLongForm` is a long-form page. All sections rendered at once as collapsible accordions. Admins are experienced; they scroll quickly through everything without next-clicking. (Vanessa, 2026-05-07: *"the reason why we had long form is because admin should be able to quickly scroll through rather than clicking. they are more experienced don't need as much guidance to fill the form."*)

The presentation difference is **intentional and stays**. What's wrong today:

- Same field has different labels (e.g. `description_activity` is "Business description" on client, "Description of activity" on admin)
- Some fields exist only on the client side (`source_of_funds_type`, `source_of_funds_other`, `employer`, `industry`, `relationship_history`, `geographic_risk_assessment`)
- Visual style of inputs / sections / "Filled from uploaded document" banner doesn't match
- Admin's accordion sections default to all-open instead of all-collapsed

This brief aligns them. **Single field schema, two presentations.** Admin is fully read-only on the form data — section reviews and doc approve/revoke are the only admin-write actions.

**Field parity goal:** admin renders the SAME fields the client renders, in the same sections, with the same labels and ordering. No admin-only fields are added in this brief — the PDF checklist diff is deferred to a follow-up brief once Vanessa pastes the source content.

---

## Hard rules

1. Complete all 5 batches autonomously. Commit + push + update CHANGES.md after each.
2. **Single source of truth for the field schema.** Extract section/field config into a shared module. Both `KycStepWizard` and `KycLongForm` consume it. Don't duplicate field arrays.
3. Section keys for KYC subsections stay as B-069/B-073/B-074 defined: `kyc:<client_profiles.id>:<category>`. Existing review rows must continue to display correctly.
4. Out of scope tables/sections must remain untouched. **Do NOT modify**: Step 1 Company Setup, Step 2 Financial, Step 3 Banking, Step 5 Documents card, Admin Actions section (Substance Review / Bank Account Opening / Generate FSC Checklist), section reviews data, right-column sidebar (Stage Management / Communication / Audit Trail / Account Manager).
5. The per-person summary cards in Step 4 (Continue KYC / View Summary / Request KYC) stay as the entry point — preserved.
6. Mobile-first. 375px clean.
7. `npm run build` must pass before declaring any batch done.

---

## Batch 1 — Extract shared KYC section schema

Create `src/lib/kyc/sections.ts`:

```ts
export type KycFieldType = "text" | "textarea" | "date" | "select" | "boolean" | "radio";

export interface KycField {
  key: string;                  // matches client_profile_kyc column
  label: string;                // canonical (use the client's existing label)
  type: KycFieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  /** Hidden at SDD; shown at CDD/EDD */
  cddOrAbove?: boolean;
  /** Shown only at EDD */
  eddOnly?: boolean;
  /** Renders the Sparkles AI marker next to the label */
  aiExtractable?: boolean;
}

export interface KycSection {
  title: string;
  description?: string;
  /** Maps to section_key for inline reviews: kyc:<profileId>:<categoryKey> */
  categoryKey:
    | "identity"
    | "financial"
    | "compliance"
    | "professional"
    | "tax"
    | "adverse_media"
    | "wealth"
    | "additional";
  fields: KycField[];
}

export const KYC_SECTIONS_INDIVIDUAL: KycSection[] = [
  /* derived from KycStepWizard's IdentityStep / FinancialStep / DeclarationsStep — taking client's labels as canonical */
];

export const KYC_SECTIONS_ORGANISATION: KycSection[] = [
  /* derived from KycStepWizard's CompanyDetailsStep / CorporateTaxStep — taking client's labels as canonical */
];
```

CLI: read both component sources carefully and produce the actual list. Reference data derived from the field diff already done on 2026-05-07:

**Organisation** — fields are essentially identical except labels:
| key | Canonical label (from client) |
|---|---|
| full_name | Company name |
| company_registration_number | Registration number |
| jurisdiction_incorporated | Jurisdiction of incorporation |
| date_of_incorporation | Date of incorporation |
| industry_sector | Industry sector |
| listed_or_unlisted | Listed or unlisted |
| description_activity | Business description |
| jurisdiction_tax_residence | Tax residency jurisdiction |
| tax_identification_number | Tax identification number |
| regulatory_licenses | Regulatory licences |

**Individual** — client has the superset; take the client list as canonical:

- **Identity:** full_name, aliases, date_of_birth, nationality, passport_country, passport_number, passport_expiry, address, email, phone
- **Financial:** source_of_funds_type, source_of_funds_description, source_of_funds_other, employer, occupation, industry, work_address, work_email, work_phone, source_of_wealth_description (cddOrAbove for several — verify against existing component logic)
- **Declarations:** is_pep, pep_details, legal_issues_declared, legal_issues_details, tax_identification_number, relationship_history (eddOnly), geographic_risk_assessment (eddOnly)

Acceptance:
- New `src/lib/kyc/sections.ts` exports the two arrays
- No consumer changes yet — both components still render their hardcoded lists
- Build passes

**Commit message:** `chore: extract shared KYC section schema into src/lib/kyc/sections.ts`

---

## Batch 2 — Wire `KycLongForm` to consume the shared schema

Update `KycLongForm` (defined in `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` around line 571):

1. Import `KYC_SECTIONS_INDIVIDUAL` and `KYC_SECTIONS_ORGANISATION` from `@/lib/kyc/sections`
2. Replace the hardcoded `KYC_SECTIONS` and `KYC_SECTIONS_ORG` arrays in `ServiceDetailClient.tsx` (lines ~488–569) with the imported arrays
3. Update field rendering in `KycLongFormSection` so:
   - Field labels come from the shared schema (so "Business description" replaces "Description of activity" automatically; missing labels normalize to client canonical)
   - Field ordering matches the client wizard's ordering
   - Missing-on-admin fields (`source_of_funds_type`, `source_of_funds_other`, `employer`, `industry`, `relationship_history`, `geographic_risk_assessment`) now render alongside the others
   - DD-level gating (`cddOrAbove`, `eddOnly`) hides fields at SDD just like the client wizard does

Verify: existing review rows on `kyc:<profileId>:<category>` still display because categoryKey values are unchanged.

Acceptance:
- All KYC fields the client sees on Identity / Financial / Declarations now render in the admin's KycLongForm
- Labels match the client's labels exactly
- Existing inline review affordances from B-074 still work
- Build passes

**Commit message:** `feat: KycLongForm consumes shared KYC section schema (admin field parity with client)`

---

## Batch 3 — Default-collapsed accordion + visual style alignment

Two sub-tasks.

### 3a — Default all sections collapsed

Currently `KycLongForm` initializes `openSections` to all section titles (`new Set(sections.map(s => s.title))`). Change to default-empty: `new Set()`.

Result: admin opens the page → all sections show as collapsed accordion headers with progress percentage and section-review badge visible. Click a header → expands to show that section's fields. (Vanessa, 2026-05-07: *"by default the page is loaded with all the sections collapsed. i expand the first collapsible when on client i have to hit next in admin i am opening the next collapsible."*)

### 3b — Visual style alignment

Make the long-form section content look identical to the client wizard's step content:

- **Section heading typography** — match client's `<h2 className="text-lg font-semibold text-brand-navy mb-1">` + description paragraph pattern
- **Input styling** — same Input/Textarea/Select sizes and classes the client uses
- **"Filled from uploaded document" banner** — render the same blue banner the client shows when AI-extracted fields are present. Component already exists in `KycStepWizard.tsx`; extract to `src/components/kyc/AiPrefillBanner.tsx` so both consumers render it consistently. Banner shows Sparkles icon + "Filled from uploaded document" + "Values extracted from your passport / ID" text + Re-apply button on client (View button added in Batch 4 for admin).
- **Sparkles AI marker** next to each `aiExtractable: true` field's label — identical to client. The existing field provenance markers from B-070 also continue to render (those are different from the Sparkles "AI-extractable" indicator — the provenance marker shows "this value came from doc X" after extraction; the Sparkles indicator shows "this field can be AI-extracted").

Acceptance:
- Admin opens GBC-0002 Step 4, expands a profile, opens the KYC long-form
- All sections collapsed by default
- Click "Identity" → expands, shows fields with same labels/ordering/inputs as client wizard's Identity step
- Sparkles AI markers visible next to AI-extractable fields
- "Filled from uploaded document" banner visible above fields when extractions exist
- Mobile (375px) clean

**Commit message:** `feat: KycLongForm defaults to all-collapsed + visual alignment with client wizard`

---

## Batch 4 — Read-only enforcement + inline doc View / Approve / Revoke

### 4a — Read-only enforcement

Admin doesn't edit KYC field data in this brief. Form fields render with the `disabled` attribute on every input. The Save button at the bottom of `KycLongForm` is hidden — admin has no edits to save.

(If admin-only editable extras get added later via the deferred PDF-checklist brief, that brief will introduce a `mode="admin"` prop or similar. For now: pure read-only.)

### 4b — Inline View + Approve / Revoke on the banner

The "Filled from uploaded document" banner from Batch 3b currently shows `Re-apply` only. On admin:

1. Add a `View` button next to `Re-apply`. Order: `[ View ]  [ Re-apply ]`.
2. Clicking `View` opens a right-slide panel (use the same Sheet pattern as `SectionReviewPanel`). The panel shows:
   - **Doc preview** at the top (image inline, or PDF embed). Reuse the existing `DocumentPreviewDialog` content rendering — extract into a shared inline component if needed.
   - **Status pill** showing the current state. Map from existing columns:
     - AI verification: `documents.verification_status` (verified / flagged / needs_review / checking / skipped / pending)
     - Admin override: `documents.admin_status` (approved / rejected / null)
     - Pill displays the more authoritative state — `admin_status` if set, else `verification_status`
   - **AI verification notes** (if `verification_result.notes` or similar is set) — collapsed by default
   - **Action button at bottom:**
     - If `admin_status` is null or `pending` → green `Approve` button. Clicking sets `admin_status = 'approved'`, `admin_status_by = current admin`, `admin_status_at = now()`, optional `admin_status_note` from a textarea above.
     - If `admin_status === 'approved'` → outline `Revoke approval` button. Clicking clears the admin_status fields back to null + inserts an audit row.

3. **Wire to existing document review API.** Find the PATCH endpoint the deep document review page (`/admin/applications/[id]/documents/[docId]/page.tsx`) uses to set `admin_status`. If there isn't a dedicated route, extract the mutation into `/api/admin/documents/[id]/admin-status/route.ts`.

4. **Client side does NOT show the View button** — only Re-apply, as today. Gate by checking the rendering context (e.g. via a `showAdminControls` prop).

The banner needs the source document's id. Pull it via the field-extractions data already passed to `KycLongForm` (B-070 `fieldExtractions`): for the fields in this category section, find the most recent `field_extractions` row with a `source_document_id` and use that.

Acceptance:
- Admin opens an Identity bucket where AI extracted from a passport. Sees the blue banner with `[ View ] [ Re-apply ]`.
- Click `View` → right-slide panel shows the passport image + status pill + Approve button.
- Click `Approve` → status pill flips to "Approved", panel closes, banner shows a small approved indicator.
- Re-open `View` → now shows `Revoke approval`.
- Click `Revoke approval` → status reverts.
- Client view does NOT show the View button.
- Build passes; mobile clean.

**Commit message:** `feat: KycLongForm read-only + inline doc View / Approve / Revoke`

---

## Batch 5 — Smoke test + cleanup + polish

1. Smoke test on `/admin/services/<gbc-0002>` Step 4:
   - Click "Continue KYC for Vanessa Rangasamy" (UBO+shareholder profile)
   - Verify long-form opens with all sections collapsed
   - Expand each section → fields match the client wizard for that step (same labels, same ordering, same inputs)
   - All inputs disabled
   - Inline Review button on each section header → opens `SectionReviewPanel` → save → badge updates
   - Sparkles + "Filled from uploaded document" banner visible on Identity (passport extracted)
   - View button on banner → right-slide panel → Approve → status updates correctly
   - Open the same profile in client portal (login as them) → wizard shows same fields, no Review buttons, no View button (only Re-apply)
2. Verify `KycStepWizard` (client) is unchanged in behavior and visual style
3. Delete dead code: the old hardcoded `KYC_SECTIONS` / `KYC_SECTIONS_ORG` arrays in `ServiceDetailClient.tsx` if no longer referenced
4. CHANGES.md entry: B-075 references the shared schema extraction, the alignment, the default-collapsed change, the inline doc Approve/Revoke flow. Note explicitly that admin-only fields are NOT added in this brief — deferred pending the FSC checklist PDF diff.
5. Background dev server restart:
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
6. Final commit + push.

**Commit message:** `chore: B-075 smoke test + cleanup`

---

## Out of scope

- **Admin-only fields** — none added in this brief. Deferred until Vanessa's FSC checklist PDFs (`fs-41_form_a-Checklist.pdf` for GBC + `checklist-authorised-company.pdf` for AC) are readable and we can diff against `client_profile_kyc`. A follow-up brief will introduce them once the field list is concrete.
- **Client wizard layout changes** — client is the source of truth; admin adapts to it.
- **Renaming database columns** — still tech debt #26.
- **"Approve All" / "Review all KYC" wizard mode** — explicit skip from earlier briefs.
- **Per-profile aggregate review key** — derived from subsection reviews; no separate row.
- **Admin Actions section** (Substance Review / Bank Account Opening / Generate FSC Checklist from B-072) — different surface area, untouched.

---

## Open questions (do not block — choose sensibly)

- The client `IdentityStep` / `FinancialStep` / `DeclarationsStep` components currently have their fields hardcoded with bespoke render logic (Sparkles markers, validation, multi-country selectors). Decide: should they ALSO be migrated to consume the shared schema in this brief, or leave the wizard side hardcoded? **Pragmatic call:** leave the wizard-side as-is for this brief. The shared schema becomes the canonical reference; the client may migrate later. Add a tech debt entry if the wizard's hardcoded list drifts from the shared schema.
- The `Re-apply` button on the banner — admin should still be able to trigger it (re-extract from updated docs). Keep it.
- DD-level gating — for fields like `relationship_history` (EDD only), make sure the admin long-form respects the profile's actual DD level, same as the client wizard does. Don't show EDD-only fields on an SDD profile.
