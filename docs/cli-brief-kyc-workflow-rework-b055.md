# B-055 — Per-person KYC workflow rework

## Why

Real-device QA on Bruce Banner (GBC-0002, 3 roles: Director + Shareholder
+ UBO) surfaced both bugs and UX friction in the per-person KYC wizard:

- **32 documents to upload up-front** is overwhelming. Users see the
  doc-list step first and quit before even reaching the form fields.
- **No bridge between OCR extraction and form fields**. The AI already
  extracts `passport_number`/`date_of_birth`/etc. from uploads but the
  results never land in `client_profile_kyc`. Users re-type what they
  already uploaded.
- **Bug**: completion bar shows 100% when many required docs are still
  missing (only 7 of 32 uploaded for Bruce). Two count sources diverge
  silently.
- **Bug**: when navigating from "Review KYC" back to a wizard step, the
  Back/Save & Close/Next buttons disappear. `hideWizardNav` state isn't
  reset on exit.
- **No quick path to review** from a deep sub-step. The user must walk
  the entire wizard to reach the review screen.
- **Top stepper is dot+line** style; user prefers a breadcrumb pattern.

Goal: re-order the per-person sub-steps so forms come first and bulk
docs come last; let key form steps optionally accept a single document
upload that auto-fills the form fields AND counts toward KYC docs
progress; fix the 100% bug; fix the lost-button bug; add a "Review"
shortcut at every sub-step; and convert the top stepper to a
breadcrumb.

Confirmed shape with the user:
- KYC Documents stays as **one combined sub-step** (last position) with
  clickable category badges that scroll/jump to that section.
- Passport / POA upload at form steps **double-counts** — fills form +
  marks the doc as uploaded.
- Top stepper = breadcrumb with `›` separators (`Company Setup ›
  People › **Banking** › Documents`).
- Sub-step nav under person name = same breadcrumb pattern, smaller.

## Scope

- **In**: per-person KYC wizard (`PerPersonReviewWizard.tsx`), the outer
  service wizard's top stepper, `personCompletion.ts` bug, and the
  `hideWizardNav` reset in `ServiceWizard.tsx`.
- **Out**: external KYC fill flow (`/kyc/fill/[token]` already audited and shaped during B-052; if a sub-step reorder needs to apply there too, do it consistently — flag any divergence). Admin views unchanged.

## Working agreement

4 batches. Each ships independently. After each batch: commit, push,
update CHANGES.md. Restart dev server (`pkill -f "next dev"; sleep 2;
rm -rf .next; npm run dev`) only after batches that touch layouts.

The user explicitly wants you to perform every step including the
verification — no manual hand-offs back to her unless something
genuinely fails. Per CLAUDE.md "Database Migration Workflow", any new
migration in this brief MUST be applied via `npm run db:push` and
verified with `npm run db:status` before the batch is considered done.

The user prefers terse chat output — one line per batch (done /
blocked / question). Details go in CHANGES.md.

---

## Batch 1 — Bug fixes (ship first)

Two independent bugs. Small diffs each, but both visible to users right
now.

### 1.1 — `computePersonCompletion` counts wrong required-docs set

**File**: [`src/lib/utils/personCompletion.ts:119-156`](src/lib/utils/personCompletion.ts:119)

**Bug**: lines 124-141 derive `docsRequired` from the `requirements`
array (filtered by document type id + DD level inclusion + person
scope). But the doc-list strip in
[`PerPersonReviewWizard.tsx:585-597`](src/components/client/PerPersonReviewWizard.tsx:585)
derives its set from `documentTypes` filtered by `ddReqDocTypeIds` +
scope='person'. The two sets diverge — for Bruce Banner the strip
shows 32 required docs while `computePersonCompletion` sees few or
zero, so `docsTotal` is artificially small and the percentage hits 100%
despite 25 missing docs.

**Fix**: change `computePersonCompletion`'s docs-required derivation to
match the strip exactly. The function already accepts
`documentTypes` — it just needs to use the same filter.

Replace lines 124-141 with:

```ts
// ── Required documents (must match the visible KYC-docs strip) ──
const personScopeDocTypes = documentTypes.filter(
  (dt) => (dt.scope ?? "person") === "person"
);
const ddIncludedDocTypeIds = new Set(
  requirements
    .filter((r) => r.requirement_type === "document" && r.document_type_id)
    .filter((r) => includedLevels.includes(r.level as "basic" | "sdd" | "cdd" | "edd"))
    .map((r) => r.document_type_id as string)
);
const docsRequired = personScopeDocTypes
  .filter((dt) => ddIncludedDocTypeIds.has(dt.id))
  .map((dt) => dt.id);
const docsTotal = docsRequired.length;
const docsFilled = docsRequired.filter((id) =>
  personDocs.some((d) => d.document_type_id === id && d.is_active !== false)
).length;
```

If after this change Bruce Banner still shows 100% with missing docs,
the next suspect is `requirements` itself being stale or filtered too
aggressively at the call site (`ServiceWizardPeopleStep.tsx:1146-1156`
or `1017-1027`). Trace and fix.

**Verification**:
- Open the People step for GBC-0002 → Bruce Banner card.
- Expected: KYC % drops from 100% to roughly `(7 docs uploaded + form
  fields filled) / (32 docs + form fields total)`. Actual number
  depends on how many form fields are filled, but it should be < 100%
  while 25 docs are missing.
- Add a unit test in `tests/unit/utils/personCompletion.test.ts`:
  ```
  - given 32 person-scope required docs at this DD level + only 7
    uploaded → docsFilled === 7, percentage < 100
  - given ALL docs uploaded but missing required form field → percentage
    < 100, isComplete === false
  - given no required docs at all (docsTotal === 0) AND all form
    fields filled → percentage === 100 (existing behavior preserved)
  ```

### 1.2 — Wizard nav buttons disappear after exiting Review KYC

**File**: [`src/components/client/ServiceWizard.tsx:92,361-373`](src/components/client/ServiceWizard.tsx:92)

**Bug**: `hideWizardNav` state is set true when entering Review KYC
inside the People step (via `onNavVisibilityChange`). When the user
exits review (handler around line 200-220 in
`ServiceWizardPeopleStep.tsx`), the state isn't flipped back, so the
nav remains hidden when they navigate to other wizard steps.

**Fix**: ensure the People step calls `onNavVisibilityChange(false)` in
its review-exit handler. Or — cleaner — move the visibility logic into
ServiceWizard itself: reset `hideWizardNav` to false on every
`currentStep` change.

Pick the second approach (less coordination, fewer call sites). Add to
`ServiceWizard.tsx`:

```ts
useEffect(() => {
  setHideWizardNav(false);
}, [currentStep]);
```

This guarantees the nav reappears on every step change, regardless of
how the previous step left the state.

**Verification**:
- People step → Review KYC for any person → Exit review → step indicator
  click on Step 1 (Company Setup) → wizard footer (Back / Save & Close
  / Next) is visible.
- Same path → click Step 3 (Banking) → footer visible.

**Commit/push**: `fix: KYC completion bug + wizard nav state reset`

---

## Batch 2 — Reorder sub-steps + clickable category jumps

After Batch 1, sub-step order moves docs from first → last, contact
becomes optional first, and the doc-list step gains in-page anchors so
the category badges become navigation.

### 2.1 — Move doc-list sub-steps to the end of the per-person flow

**File**: [`src/components/client/PerPersonReviewWizard.tsx:625-650`](src/components/client/PerPersonReviewWizard.tsx:625)

The current sub-step builder pushes doc-list categories first, then
form sub-steps. Reverse to push form sub-steps first, then docs at the
end.

New sub-step order for **individuals** (after Batch 2):

1. `contact` — optional contact sub-step (Next button works even if blank)
2. `form-identity` — identity form (Batch 3 will add optional passport upload here)
3. `form-residential-address` — address form (Batch 3 will add optional POA upload here)
4. `form-financial` — financial form (CDD/EDD only)
5. `form-declarations` — declarations
6. `doc-list` — **single combined** doc-list step covering all categories at the end
7. `form-review` — final review

For **organisations**:

1. `contact`
2. `form-org-details`
3. `form-org-tax`
4. `doc-list`
5. `form-org-review`

Important: instead of one `doc-list` sub-step **per category** (current
behavior), collapse them into a **single** `doc-list` sub-step that
shows ALL categories vertically stacked. The category badges in the
progress strip become anchor links (Batch 2.2).

### 2.2 — Make the KYC progress strip clickable

**File**: [`PerPersonReviewWizard.tsx:1198-1227`](src/components/client/PerPersonReviewWizard.tsx:1198)

Inside the (new) single doc-list sub-step, wrap each category section
in a div with `id={"docs-cat-" + category}`. Then in the progress strip
at line 1210-1224, change each category badge from a plain `<span>` to
a `<button>` that smooth-scrolls to its anchor:

```tsx
<button
  type="button"
  onClick={() => {
    document.getElementById(`docs-cat-${cat}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }}
  className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-50 transition-colors"
>
  {categoryIcon(cat)}
  <span className="font-medium uppercase tracking-wide text-[10px] text-gray-700">
    {categoryLabel(cat)}
  </span>
  <span className="tabular-nums">({uploadedCountFor(cat)}/{total})</span>
</button>
```

Render the doc list itself with one section per category, each with the
matching anchor id. Preserve all existing per-doc rendering (upload,
status badges, etc.).

### 2.3 — Make the contact sub-step truly optional

**File**: `PerPersonReviewWizard.tsx` (find `case "contact"` in the
sub-step renderer)

Currently the contact sub-step blocks Next if fields aren't filled (or
shows them as required). Add a clear visual cue at the top:

> "Contact details are optional. You can fill these now or skip and
> come back later."

Ensure Next is never disabled on this sub-step. (If the existing logic
disables based on `isContactValid`, gate that on a new `optional`
flag.)

### 2.4 — Update sub-step navigation indices

The sub-step array length and ordering changed, so:
- Re-validate every `setSubStepIndex(N)` call site — they often hardcode
  positions like "go to first doc-list" which used to be index 0.
- Update the chip-strip / progress markers on the review-walk view to
  match the new order.
- The per-person card progress bar (in
  `ServiceWizardPeopleStep.tsx:777-787`) reads from
  `computePersonCompletion`, which is order-agnostic — no change
  needed.

**Verification**:
- Walk Bruce Banner KYC: contact → identity → address → financial →
  declarations → docs → review.
- On the docs sub-step, click each category badge in the strip →
  smooth-scrolls to that section. Try IDENTITY (3/6) → page scrolls to
  the Identity Documents heading.
- Skip contact (don't fill anything, click Next) → lands on identity
  form, no validation block.

**Commit/push**: `feat: reorder per-person KYC subsetps + clickable category jumps`

---

## Batch 3 — Top breadcrumb stepper + sub-step breadcrumb + Review shortcut

All visual / navigation polish. Three independent edits, but they share
the breadcrumb visual language so they ship together.

### 3.1 — Convert top wizard stepper to breadcrumb

**File**: [`src/components/client/ServiceWizardStepIndicator.tsx:13-56`](src/components/client/ServiceWizardStepIndicator.tsx:13)

Replace the dot+line layout with a horizontal breadcrumb:

```tsx
<nav aria-label="Wizard progress" className="flex items-center gap-1.5 flex-wrap text-sm">
  {steps.map((step, i) => {
    const isCurrent = i === currentStepIndex;
    const isCompleted = i < currentStepIndex;
    const isClickable = isCompleted; // can jump back to completed steps
    return (
      <Fragment key={step.id}>
        {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden />}
        <button
          type="button"
          disabled={!isClickable}
          onClick={isClickable ? () => onStepClick(i) : undefined}
          className={cn(
            "h-8 px-2 rounded inline-flex items-center gap-1.5 transition-colors",
            isCurrent && "font-bold text-brand-navy",
            isCompleted && "text-gray-700 hover:bg-gray-50 cursor-pointer",
            !isCurrent && !isCompleted && "text-gray-400 cursor-default"
          )}
        >
          {isCompleted && <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />}
          <span>{step.label}</span>
        </button>
      </Fragment>
    );
  })}
</nav>
```

Keep the existing `onStepClick` plumbing. The visual: completed steps
get a green check + label, current is bold navy, future is muted gray.
Separator between each is `›` (lucide `ChevronRight`).

Mobile: the `flex-wrap` lets the breadcrumb wrap to two lines if it
overflows. No horizontal scroll.

### 3.2 — Sub-step breadcrumb under person name

**File**: `PerPersonReviewWizard.tsx` (the header area, where person
name + roles are shown)

Same breadcrumb pattern, smaller scale. Render between the person name
and the roles row:

```tsx
<nav aria-label="Sub-step progress" className="flex items-center gap-1 flex-wrap text-xs text-gray-500 mb-2">
  {subSteps.map((s, i) => {
    const isCurrent = i === currentSubStepIndex;
    const isCompleted = i < currentSubStepIndex;
    return (
      <Fragment key={i}>
        {i > 0 && <ChevronRight className="h-3 w-3" aria-hidden />}
        <button
          onClick={isCompleted ? () => setSubStepIndex(i) : undefined}
          className={cn(
            "px-1.5 py-0.5 rounded",
            isCurrent && "font-semibold text-brand-navy",
            isCompleted && "text-gray-600 hover:bg-gray-100 cursor-pointer",
            !isCurrent && !isCompleted && "text-gray-300 cursor-default"
          )}
        >
          {subStepLabel(s)}
        </button>
      </Fragment>
    );
  })}
</nav>
```

Where `subStepLabel(s)` maps each sub-step kind to a short label:
- `contact` → "Contact"
- `form-identity` → "Identity"
- `form-residential-address` → "Address"
- `form-financial` → "Financial"
- `form-declarations` → "Declarations"
- `doc-list` → "Documents"
- `form-review` → "Review"
- (org variants similar)

### 3.3 — "Review [Person Name]" shortcut at every sub-step

Add a tertiary button in the per-person wizard header (top-right of the
content area, NOT in the wizard footer). Visible on every sub-step
except the review step itself:

```tsx
{currentSubStep.kind !== "form-review" && currentSubStep.kind !== "form-org-review" && (
  <Button
    variant="ghost"
    size="sm"
    onClick={() => setSubStepIndex(reviewSubStepIndex)}
    className="text-brand-navy hover:bg-gray-50"
  >
    Review {personName} <ArrowRight className="h-3.5 w-3.5 ml-1" />
  </Button>
)}
```

Where `reviewSubStepIndex` is the index of the `form-review` (or
`form-org-review`) sub-step — compute once via
`subSteps.findIndex(s => s.kind.endsWith("review"))`.

### 3.4 — Rename "Review & Submit" → "Review"

**Files**:
- `PerPersonReviewWizard.tsx:462` (org review button)
- `PerPersonReviewWizard.tsx:642` (individual review label)
- Any other occurrence — `grep -rn "Review & Submit\|Review & save"
  src/`

Replace with simply "Review". The actual submit happens elsewhere; this
button just lands on the review screen.

**Verification**:
- Top stepper renders as breadcrumb at 1280px / 768px / 375px — no
  horizontal scroll, wraps cleanly on mobile.
- Click a completed step in the breadcrumb → navigates back to it; the
  wizard nav buttons appear (Batch 1.2 already fixed this).
- On any sub-step inside per-person KYC, "Review Bruce Banner" button
  visible top-right. Click → lands on the review sub-step. Click breadcrumb
  to go back → returns cleanly.
- Final review screen says "Review", not "Review & Submit".

**Commit/push**: `feat: breadcrumb stepper + per-step Review shortcut`

---

## Batch 4 — Smart pre-fill from passport / POA OCR (the bigger feature)

**This batch is the largest. If the user prefers to ship Batches 1-3
first and defer this, leave it for B-056. Otherwise continue.**

The Anthropic-powered OCR already extracts fields and stores them in
`document_uploads.verification_result` JSON (`extracted_fields` key).
Batch 4 adds:

1. An optional upload affordance on the Identity and Address form
   sub-steps.
2. A bridge that takes extracted fields from the upload response and
   writes them to `client_profile_kyc` so the form pre-fills.
3. The same upload counts as the canonical Passport / Proof-of-Address
   doc upload, so the KYC docs progress strip updates immediately
   (IDENTITY 3/6 → 4/6).

### 4.1 — Audit + map extracted fields to KYC columns

**File**: `src/lib/ai/verifyDocument.ts` (and `prompts/` if relevant)

Confirm the field keys the AI returns for a passport upload:
- `passport_number`
- `date_of_birth` (YYYY-MM-DD)
- `passport_expiry` (YYYY-MM-DD)
- `nationality`
- `full_name`

For proof of address:
- `address_line_1`
- `address_line_2`
- `address_city`
- `address_state`
- `address_postal_code`
- `address_country`

If the prompt asks for these but in different keys, normalize the names
in the bridge (Step 4.3). If the prompt doesn't ask for them at all,
update the prompt template to extract them — but only for these
specific document types.

### 4.2 — Optional upload affordance on form sub-steps

**File**: `PerPersonReviewWizard.tsx` — the case `"form-identity"` and
`"form-residential-address"` renderers.

At the top of each form, render a card:

```tsx
<div className="rounded-lg border border-dashed bg-blue-50/30 p-4 mb-4">
  <p className="text-sm font-medium text-brand-navy mb-1">
    Have your {docTypeLabel} handy?
  </p>
  <p className="text-xs text-gray-600 mb-3">
    Upload it here — we'll auto-fill the fields below from the document.
    You can edit anything that doesn't look right.
  </p>
  <Button
    variant="outline"
    onClick={triggerUpload}
    disabled={prefillUploading}
  >
    {prefillUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
    Upload {docTypeLabel}
  </Button>
</div>
```

Where `docTypeLabel` is "Passport" on Identity and "Proof of address"
on Address. The button opens the existing `DocumentUploadWidget` flow
but routes the result through the new pre-fill handler.

### 4.3 — Pre-fill bridge

After the upload completes and the AI verification response returns
`extracted_fields`:

1. Take the relevant subset of fields from `extracted_fields`.
2. For each non-empty value: PATCH `/api/profiles/kyc/save` with
   `{ kycRecordId, fields: { passport_number: extracted.passport_number, ... } }`.
3. After the PATCH succeeds, refresh the form state from the response
   so the user sees the values populate.
4. Show a subtle "✓ Pre-filled from your passport" toast +
   inline "Pre-filled — please review" hint next to each field that was
   set.

The KYC docs progress strip auto-updates because the upload IS a real
document upload — `profileDocs` re-fetches, the corresponding category
counter goes from 3/6 to 4/6.

### 4.4 — Don't double-upload

Important: if the user uploads passport at Identity, then visits the
Documents step, the passport row should show "✓ Uploaded" not "Upload"
button. The existing render of `DocumentUploadWidget` should handle
this automatically because it's keyed on `document_type_id` and the
upload created a real `document_uploads` row. Verify in dev — if not,
adjust the row state.

### 4.5 — User-facing copy & tone

The pre-fill is optional. If the user skips upload and types the fields
manually, that's fine. The card uses gentle copy ("Have your … handy?
Upload it here") — never disabled or implied as required.

### 4.6 — Verification

- Go to per-person KYC → Identity sub-step → click Upload Passport →
  use a fixture passport image (or any image; a real verification will
  fail but the upload+extraction flow runs).
- After the AI returns: form fields populate. Toast appears.
- Click Next to Address sub-step → upload a proof-of-address →
  fields populate.
- Click Next through to Documents step → IDENTITY (4/6) (was 3/6 before
  passport) and (1/6 → 2/6 for the POA category if applicable).

**Commit/push**: `feat: smart pre-fill from passport + POA OCR uploads`

---

## CHANGES.md

After all batches, write a single rollup entry plus per-batch entries
(1 paragraph each). Move tech-debt #11 ("No real-time updates")
unchanged — this batch doesn't address it.

Add a new tech-debt entry if you encounter scope you can't complete:

```
### Open
| 21 | <description of any item discovered but deferred> | <severity> | <reason> |
```

## CLAUDE.md

If the breadcrumb stepper changes any of the navigation conventions,
update the "Key Gotchas" section. If smart pre-fill adds a new code
pattern (e.g., extracted_fields → kyc field mapping helper), document
its location.

## Verification (full)

After all batches:

1. `npm run lint && npm run build && npm test` — green.
2. Walk Bruce Banner KYC end-to-end at 1280px and 375px:
   - Top breadcrumb shows "Setup › People › Banking › Documents", current
     bolded.
   - Inside KYC: sub-step breadcrumb under the person name shows
     "Contact › Identity › Address › Financial › Declarations › Documents
     › Review".
   - Identity sub-step: "Upload Passport" card visible. Upload → fields
     populate.
   - KYC % at the end: < 100% if any required doc still missing.
   - "Review Bruce Banner" button visible top-right at every sub-step
     except the final review.
3. Click Step 1 in the breadcrumb after exiting Review KYC → wizard
   footer (Back / Save & Close / Next) is visible. (Bug 1.2 fixed.)
4. Open the production deploy URL on a real phone, repeat #2 at 375px —
   no horizontal scroll, no clipped buttons (B-053 fixes still hold).

## Things to flag to the user

- **No DB migrations** in Batch 1, 2, 3. Batch 4 only modifies a JSON
  column's content — no schema change.
- If during Batch 4 you discover the AI prompt doesn't extract the
  needed fields, you'll need to update the prompt template — flag this
  as an additional commit ("chore: extend verify-document prompt for
  passport+POA fields").
- If you decide to defer Batch 4, post a short note in CHANGES.md and
  close the PR with Batches 1-3 only.

## Rollback

All changes are additive UI + a single utility function fix. To roll
back: `git revert` the relevant commit. No DB migrations to reverse,
no breaking API changes.
