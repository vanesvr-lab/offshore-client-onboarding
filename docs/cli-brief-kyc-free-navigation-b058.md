# B-058 — Free navigation in per-person KYC + Resend tooltip + Try-again prefill

## Why

Four navigation/feedback gaps in the per-person KYC wizard:

1. **Sub-step breadcrumb only allows backward jumps.** The chevron
   breadcrumb (`Contact › Identity › Address › Financial › …`) gates
   `onClick` on `isCompleted` (i.e., `i < subStepIndex`). Users can
   click previous steps to revisit, but not jump forward to a future
   step they haven't touched yet. The user wants free navigation —
   click any step at any time.
2. **KYC Documents category badges only clickable on the docs
   sub-step.** The progress strip ("IDENTITY (3/3) FINANCIAL (0/3)
   COMPLIANCE (0/1)") renders as plain text everywhere except the
   docs sub-step, where it becomes scroll-to-anchor buttons. The
   user wants those badges clickable from any sub-step — clicking
   IDENTITY (3/3) from the Address sub-step should navigate to the
   docs sub-step AND scroll to the Identity section.
3. **Resend invite tooltip doesn't show on disabled state.** When
   the 24h rate limit kicks in, the Resend invite button is correctly
   disabled — but the explanatory tooltip ("Already sent today. You
   can resend after May 6, 4:08 AM.") never appears, because the code
   uses the native HTML `title` attribute and most browsers don't
   fire hover events on disabled buttons. Users see a greyed-out
   button with no explanation.
4. **No way to manually trigger prefill from an uploaded doc.** After
   a doc is uploaded, the auto-prefill runs once. If it doesn't apply
   values (extraction was empty for the sub-step's fields, OR the
   user typed something first so the targets weren't empty), there's
   no UI affordance to re-apply the existing extraction. Add a
   "Pre-fill from uploaded document" button — same pattern as the
   B-044 control that lived on the Identity step when docs were
   uploaded before the step. The button reads the existing
   `verification_result.extracted_fields` and applies whatever
   matches the sub-step's fields. No AI re-run.
5. **Role toggle doesn't recompute required-docs count.** Adding or
   removing a role on the person currently being viewed in the KYC
   wizard updates the local `persons` state but doesn't refresh the
   page-level `requirements` / `documentTypes` / `documents` props.
   The KYC progress strip ("3 of 7 uploaded") stays stale until the
   user manually reloads. Trigger a `router.refresh()` (or the
   project's equivalent server-data refetch) inside the role-toggle
   handlers.
6. **Person card shows 100% after walking the KYC review even when
   incomplete.** When the user exits the per-person review walk,
   `handleKycComplete` adds the role-id to a local `kycCompletedIds`
   Set. The PersonCard's `kycPct` then HARDCODES to 100% if any
   role-id is in the set, ignoring `computePersonCompletion`'s real
   value. Reloading the page clears the Set and the correct value
   reasserts. Remove the optimistic override; trust the computation.

All four are small, additive UX fixes. Single batch.

## Scope

- **In**: [`src/components/client/PerPersonReviewWizard.tsx`](src/components/client/PerPersonReviewWizard.tsx)
  and [`src/components/client/ServiceWizardPeopleStep.tsx`](src/components/client/ServiceWizardPeopleStep.tsx).
- **Out**: the outer service wizard's top breadcrumb stepper (already
  has its own forward-navigation rules; not changed in this batch).
  Duplicate-profile prevention (separate batch).

## Working agreement

Single batch. Commit, push, update CHANGES.md. No DB changes. After
CLI finishes the file edits, restart the dev server per CLAUDE.md.

---

## Step 1 — Sub-step breadcrumb: drop the "completed only" gate

**File**: [`PerPersonReviewWizard.tsx:1444-1469`](src/components/client/PerPersonReviewWizard.tsx:1444)

Current code:

```tsx
{subSteps.map((s, i) => {
  const isCurrent = i === subStepIndex;
  const isCompleted = i < subStepIndex;
  const canJump = isCompleted;
  return (
    <Fragment key={s.id + i}>
      {i > 0 && (
        <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" aria-hidden="true" />
      )}
      <button
        type="button"
        disabled={!canJump}
        onClick={canJump ? () => setSubStepIndex(i) : undefined}
        aria-current={isCurrent ? "step" : undefined}
        className={cn(
          "px-1.5 py-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          isCurrent && "font-semibold text-brand-navy",
          isCompleted && "text-gray-600 hover:bg-gray-100 cursor-pointer",
          !isCurrent && !isCompleted && "text-gray-300 cursor-default"
        )}
      >
        {subStepBreadcrumbLabel(s.kind)}
      </button>
    </Fragment>
  );
})}
```

Replace with:

```tsx
{subSteps.map((s, i) => {
  const isCurrent = i === subStepIndex;
  const isCompleted = i < subStepIndex;
  const isFuture = i > subStepIndex;
  return (
    <Fragment key={s.id + i}>
      {i > 0 && (
        <ChevronRight className="h-3 w-3 text-gray-300 shrink-0" aria-hidden="true" />
      )}
      <button
        type="button"
        onClick={isCurrent ? undefined : () => setSubStepIndex(i)}
        aria-current={isCurrent ? "step" : undefined}
        className={cn(
          "px-1.5 py-0.5 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
          isCurrent && "font-semibold text-brand-navy cursor-default",
          isCompleted && "text-gray-600 hover:bg-gray-100 cursor-pointer",
          isFuture && "text-gray-400 hover:bg-gray-50 hover:text-gray-700 cursor-pointer"
        )}
      >
        {subStepBreadcrumbLabel(s.kind)}
      </button>
    </Fragment>
  );
})}
```

Key changes:
- Removed `canJump` and `disabled` — every step is clickable except
  the current one (clicking your own current step is a no-op).
- Future steps now have a hover style (`hover:bg-gray-50
  hover:text-gray-700 cursor-pointer`) so they look interactive.
  Slightly muted text color (`text-gray-400` instead of
  `text-gray-300`) so they're readable.

**Note on validation**: free navigation lets users skip through
mandatory fields without filling them. That's intentional — the
existing per-step validation (e.g., the Submit button on the Review
step blocks if required fields are missing) is the gate, not the
breadcrumb. Forms still autosave the partial state.

If you discover a sub-step that crashes when entered with an
incomplete prerequisite (e.g., the Documents step depends on a
person.id that's only created on Contact submit), document it in
CHANGES.md and gate that specific step — but the default is "all
clickable."

---

## Step 2 — KYC category badges: clickable from any sub-step

**File**: [`PerPersonReviewWizard.tsx:1502-1538`](src/components/client/PerPersonReviewWizard.tsx:1502)

Current ternary renders a button only on the doc-list sub-step.
Replace it so the badges are always buttons. When the user is on the
doc-list step → scroll to anchor (existing behavior). When the user
is on any other sub-step → navigate to the doc-list step AND then
scroll to the anchor after render.

### 2.1 — Find the doc-list sub-step index

Near the top of the component, where `reviewSubStepIndex` is already
derived (search for `subSteps.findIndex(s => s.kind === "form-review"`),
add:

```ts
const docsSubStepIndex = subSteps.findIndex((s) => s.kind === "doc-list");
```

### 2.2 — Add pending-scroll state + effect

Below the existing state declarations:

```ts
const [pendingDocsCategory, setPendingDocsCategory] = useState<string | null>(null);

useEffect(() => {
  if (currentSubStep.kind === "doc-list" && pendingDocsCategory) {
    // Wait one frame so the doc-list sub-step's DOM is mounted.
    const id = `docs-cat-${pendingDocsCategory}`;
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
      setPendingDocsCategory(null);
    });
  }
}, [currentSubStep.kind, pendingDocsCategory]);
```

### 2.3 — Replace the ternary with always-button + dual handler

Replace the ternary block (`return currentSubStep.kind === "doc-list" ? <button> : <span>`) with a single always-rendered button:

```tsx
{personCategories.map((cat) => {
  const total = (docTypesByCategory[cat] ?? []).length;
  if (total === 0) return null;
  const handleClick = () => {
    if (currentSubStep.kind === "doc-list") {
      document
        .getElementById(`docs-cat-${cat}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (docsSubStepIndex >= 0) {
      setPendingDocsCategory(cat);
      setSubStepIndex(docsSubStepIndex);
    }
  };
  return (
    <button
      key={cat}
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded hover:bg-gray-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label={`Jump to ${categoryLabel(cat)} documents`}
    >
      {categoryIcon(cat)}
      <span className="font-medium uppercase tracking-wide text-[10px] text-gray-700">
        {categoryLabel(cat)}
      </span>
      <span className="tabular-nums">
        ({uploadedCountFor(cat)}/{total})
      </span>
    </button>
  );
})}
```

Key behaviors:
- On the docs step: scroll to the category's anchor (existing).
- On any other step: stash the target category, navigate to the docs
  step, then the `useEffect` runs once the docs step has rendered and
  scrolls to the anchor.
- `requestAnimationFrame` is enough for React to commit + DOM to
  paint before scrollIntoView fires. If you find it racing on slower
  devices, swap for a 50ms `setTimeout`.

---

## Step 3 — Replace native tooltip on Resend invite button

**File**: [`src/components/client/ServiceWizardPeopleStep.tsx:835-884`](src/components/client/ServiceWizardPeopleStep.tsx:835)
(the `ResendInviteButton` component).

Current code uses `title={tooltip}` (native HTML attribute). Native
tooltips don't fire on disabled buttons because the browser doesn't
dispatch hover events on `disabled` elements. So when the 24h
cooldown kicks in, users see a greyed-out button with no explanation.

The project already has a shadcn Tooltip pattern in use elsewhere
(see `ServiceWizardNav.tsx` for an example: it wraps a disabled
button in a `<span>` so the tooltip can still trigger).

### 3.1 — Apply the same pattern

Replace the current return:

```tsx
return (
  <Button
    size="sm"
    variant="ghost"
    onClick={onClick}
    disabled={isCoolingDown}
    title={tooltip}
    aria-label={label}
    className="h-7 px-3 text-xs gap-1.5 text-gray-600 hover:text-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <Mail className="h-3 w-3" />
    {label}
  </Button>
);
```

With:

```tsx
const button = (
  <Button
    size="sm"
    variant="ghost"
    onClick={onClick}
    disabled={isCoolingDown}
    aria-label={label}
    className="h-7 px-3 text-xs gap-1.5 text-gray-600 hover:text-brand-navy disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <Mail className="h-3 w-3" />
    {label}
  </Button>
);

return (
  <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-block" tabIndex={isCoolingDown ? 0 : -1} />}
      >
        {button}
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs max-w-[220px]">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
```

Key points:
- The `<span>` wrapper is what receives the hover event since the
  inner button is disabled. `inline-block` keeps the original layout.
- `tabIndex={isCoolingDown ? 0 : -1}` makes the wrapper keyboard-focusable
  ONLY when disabled, so screen readers can announce the cooldown
  reason. When enabled, the button itself is the tab stop.
- The tooltip text already has all three states (cooldown, last-sent
  date, first-send copy) — just shown in a real component now.
- Add the imports if not already present:
  ```ts
  import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
  ```

### 3.2 — Same pattern check elsewhere

`grep -rn 'title=' src/components/client src/components/shared`. If
any other disabled-button + native-title combination exists in the
client KYC surface, apply the same shadcn fix. Don't go fishing
across the whole codebase — keep it to the per-person KYC + service
wizard area.

---

## Step 4 — "Pre-fill from uploaded document" button

**Files**:
- [`src/components/kyc/steps/ResidentialAddressStep.tsx:201-208`](src/components/kyc/steps/ResidentialAddressStep.tsx:201)
- [`src/components/kyc/steps/IdentityStep.tsx`](src/components/kyc/steps/IdentityStep.tsx) — same pattern.

After a doc is uploaded, give the user a manual button to apply the
existing AI extraction to the form. Same shape as the B-044 "Fill
from uploaded document" pattern that lived on the Identity step
back when docs were uploaded before the step.

**No AI re-run.** This button just reads the doc's existing
`verification_result.extracted_fields`, intersects with the
sub-step's `availableExtracts`, and PATCHes any matches into empty
form fields. Cheap, instant, no Anthropic call.

The button should be visible whenever an addressDoc/passportDoc has
been uploaded (i.e., `verification_result` exists), regardless of
whether the auto-prefill landed values. This way the user can:
- Re-pull values they accidentally cleared
- Pull values that auto-prefill skipped (e.g., they typed first, so
  the target wasn't empty)
- Just manually trigger when they want explicit control

### 4.1 — Add the handler in `ResidentialAddressStep`

Near the top of the component, add:

```ts
const [manualPrefilling, setManualPrefilling] = useState(false);

async function handleManualPrefill() {
  if (!effectiveKycRecordId) return;
  if (availableExtracts.length === 0) {
    toast.info("This document didn't include address details. Please enter them below.");
    return;
  }
  setManualPrefilling(true);
  try {
    const payload: Record<string, string> = {};
    for (const row of availableExtracts) payload[row.target] = row.value;
    const res = await fetch("/api/profiles/kyc/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kycRecordId: effectiveKycRecordId, fields: payload }),
    });
    if (!res.ok) throw new Error("save failed");
    const patch: Partial<KycRecord> = {};
    for (const [k, v] of Object.entries(payload)) {
      (patch as Record<string, unknown>)[k] = v;
    }
    onChange(patch);
    setBannerState("success");
    toast.success(`Filled ${availableExtracts.length} field${availableExtracts.length === 1 ? "" : "s"} from your proof of address.`);
  } catch {
    toast.error("Couldn't fill from document — please try again.");
  } finally {
    setManualPrefilling(false);
  }
}
```

Note: this uses `availableExtracts` (all extractable values for the
sub-step's fields, regardless of whether targets are filled) — NOT
`prefillable` (which excludes already-filled targets). So clicking
the button OVERWRITES any values currently in the form. That's
intentional — manual user action implies "use the doc's values".

### 4.2 — Render the button when a doc is uploaded

The button appears in two places — depending on banner state:

**On the yellow "error" banner** (auto-prefill found nothing for
this sub-step):

```tsx
{bannerState === "error" && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-center gap-2.5">
    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" aria-hidden="true" />
    <p className="flex-1 text-sm text-amber-800">
      Couldn&apos;t auto-fill from your document. Please enter values manually.
    </p>
    {addressDoc && availableExtracts.length > 0 && (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void handleManualPrefill()}
        disabled={manualPrefilling}
        className="h-7 text-xs text-amber-900 hover:bg-amber-100"
      >
        {manualPrefilling ? <Loader2 className="h-3 w-3 animate-spin mr-1" aria-hidden="true" /> : <Sparkles className="h-3 w-3 mr-1" aria-hidden="true" />}
        {manualPrefilling ? "Filling…" : "Pre-fill from uploaded document"}
      </Button>
    )}
  </div>
)}
```

The button is **only shown if `availableExtracts.length > 0`** — if
the AI extracted nothing relevant, there's nothing to pre-fill, and
showing the button would be misleading.

**On the blue "success" banner** (auto-prefill landed some values
but the user might want to re-apply):

```tsx
{bannerState === "success" && (
  <div className="rounded-lg border border-brand-blue/30 bg-brand-blue/5 px-4 py-3 flex items-start gap-3">
    <Sparkles className="h-4 w-4 text-brand-blue shrink-0 mt-0.5" aria-hidden="true" />
    <div className="flex-1">
      <p className="text-sm font-medium text-brand-navy">Filled from uploaded document</p>
      <p className="text-xs text-gray-600">Values extracted from your proof of address.</p>
    </div>
    {addressDoc && availableExtracts.length > 0 && (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void handleManualPrefill()}
        disabled={manualPrefilling}
        className="h-7 text-xs"
      >
        Re-apply
      </Button>
    )}
  </div>
)}
```

Imports needed:
```ts
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
```

### 4.3 — Same pattern in `IdentityStep.tsx`

Identical handler + button rendering on its banners. Doc reference
is `passportDoc` (or whatever the local name is). Toast copy uses
"passport" instead of "proof of address". Same conditional render
based on `availableExtracts.length > 0`.

---

## Step 5 — Recompute required-docs after role toggle

**File**: [`src/components/client/ServiceWizardPeopleStep.tsx:962-978`](src/components/client/ServiceWizardPeopleStep.tsx:962)

The handlers only mutate local state:

```ts
const handleRoleRemoved = useCallback((roleId: string) => {
  const next = persons.filter((p) => p.id !== roleId);
  setPersons(next);
  onPersonsChange(next);
}, [persons, onPersonsChange]);

const handleRoleAdded = useCallback((person: ServicePerson) => {
  const next = [...persons, person];
  setPersons(next);
  onPersonsChange(next);
}, [persons, onPersonsChange]);
```

The required-docs count, the categories, and the per-category
breakdown all derive from `requirements` + `documentTypes` (passed
as props from the server-rendered page). When a role changes, those
props don't refresh, so the strip stays stale.

### 5.1 — Trigger a server refresh on role change

Add `useRouter` and call `router.refresh()` after the local state
update so Next.js re-runs the server component, fetching the latest
`requirements` / `documentTypes` / `documents` / `persons`:

```ts
import { useRouter } from "next/navigation";

const router = useRouter();

const handleRoleRemoved = useCallback((roleId: string) => {
  const next = persons.filter((p) => p.id !== roleId);
  setPersons(next);
  onPersonsChange(next);
  router.refresh();
}, [persons, onPersonsChange, router]);

const handleRoleAdded = useCallback((person: ServicePerson) => {
  const next = [...persons, person];
  setPersons(next);
  onPersonsChange(next);
  router.refresh();
}, [persons, onPersonsChange, router]);
```

`router.refresh()` is cheap — it re-runs the server component for
the current route, but client state (which step you're on, which
person you're reviewing, what's in form fields) is preserved. The
user won't see a flicker beyond the new count appearing.

### 5.2 — Verify the props actually update

After `router.refresh()`, the page-level `requirements`,
`documentTypes`, `documents`, and `persons` should re-fetch from
Supabase. Confirm by:

1. Reading the count BEFORE toggling a role (e.g., "X of 7 uploaded").
2. Toggling a role on the SAME person.
3. Watching the count update without a manual reload.

If the count doesn't change after step 3, dig into the page-level
fetch: it might be using a stale cache or `force-static` rendering.
Check `src/app/(client)/services/[id]/page.tsx` for any
`export const dynamic = "force-static"` or similar — most pages in
this project are `force-dynamic` per CLAUDE.md so this should be
fine.

---

## Step 6 — Drop the kycCompletedIds optimistic override

**File**: [`src/components/client/ServiceWizardPeopleStep.tsx`](src/components/client/ServiceWizardPeopleStep.tsx)
lines 910, 992-1002, 1028-1029, 1052-1056, 1157-1159.

Currently the component maintains a local `kycCompletedIds: Set<string>`
that gets a role-id added every time `handleKycComplete()` fires (i.e.,
when the user exits the per-person review walk). Two render paths then
hardcode `kycPct = 100` when ANY role-id of a person is in the Set,
overriding the real computation.

This is wrong. Walking the KYC review steps is not the same as
completing them — the user could have skipped required docs, left
forms blank, or simply clicked through. The fix:

### 6.1 — Remove the override paths

Replace line 1157-1159:

```ts
const kycPct = roleRows.some((rr) => kycCompletedIds.has(rr.id))
  ? 100
  : completion.percentage;
const isComplete = kycPct === 100;
```

With:

```ts
const kycPct = completion.percentage;
const isComplete = completion.isComplete;
```

(`isComplete` is already returned by `computePersonCompletion` per
B-055 §1.1; use it directly instead of inferring from `kycPct === 100`.)

Same pattern at line 1028-1029. Replace:

```ts
const markedComplete = kycCompletedIds.has(roleId);
const completionPct = markedComplete ? 100 : completion.percentage;
```

With:

```ts
const completionPct = completion.percentage;
```

### 6.2 — Trigger router.refresh() on review-walk exit

Replace `handleKycComplete()` at line 992-1002:

```ts
const handleKycComplete = () => {
  setReviewingRoleId(null);
  setReviewAllOrder(null);
  setReviewAllIndex(0);
  router.refresh();
};
```

The `router` reference is the same one added in Step 5 — share it.
The refresh re-fetches the server-side data so any KYC field saves /
doc uploads from the walk are reflected in the post-walk computation.

Same treatment for `handleExitKycReview()` (search for it in the same
file): add `router.refresh()` so exiting via "Back to People" also
refreshes data.

### 6.3 — Delete the now-unused state

Remove line 910:

```ts
const [kycCompletedIds, setKycCompletedIds] = useState<Set<string>>(new Set());
```

And remove every `setKycCompletedIds` call throughout the file
(lines 993, 1052). If TypeScript complains about an unused import or
function, clean it up.

### 6.4 — Sanity: the computation must be correct

The B-055 Batch 1 fix to `computePersonCompletion` already corrected
the divergence between the doc-list strip (32 docs) and the function
(0 docs). After Step 6, the PersonCard should show the same percentage
that the in-wizard progress strip shows. Verify by hovering both —
they should agree.

If after Step 6 the PersonCard shows < 100% but the user genuinely
completed everything, that's a separate bug in
`computePersonCompletion` — flag it, don't reintroduce the optimistic
override.

---

## Step 7 — Verification

1. **Restart dev server** (CLAUDE.md):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Sub-step breadcrumb forward jumps** — open a person's KYC at the
   Contact sub-step. The breadcrumb should now let you click ANY step
   directly:
   - Click "Documents" from Contact → lands on doc-list sub-step.
   - Click "Review" → lands on review.
   - Click back to "Identity" from anywhere.
   - Current step text stays bold + non-clickable; everything else
     hovers + clicks.

3. **KYC category quick-jump from any sub-step** — at the Address
   sub-step, click the "IDENTITY (3/3)" badge in the KYC Documents
   strip. Expected:
   - Page navigates to the Documents sub-step.
   - Scrolls smoothly to the Identity Documents heading.
   - Same flow works from Contact, Identity, Financial, Declarations,
     Review.

4. **From the docs sub-step itself** — click "FINANCIAL (0/3)" badge.
   Expected: smooth-scroll to the Financial section without leaving
   the sub-step (existing behavior preserved).

5. **Resend invite tooltip on disabled state** — find any person
   whose `invite_sent_at` is within the last 24h (e.g., the
   "PANIKEN VANESSA" row on GBC-0002 was sent at 2026-05-05 04:08
   UTC and is in cooldown). Hover the disabled "Resend invite"
   button. Expected: shadcn Tooltip appears with "Already sent
   today. You can resend after May 6, 4:08 AM." within ~300ms.
   Hover an enabled button → tooltip shows the "Last sent on …"
   line or the first-send copy. Keyboard tab through the page →
   the disabled button's wrapper receives focus and screen readers
   announce the cooldown reason.

6. **Pre-fill from uploaded document button**:
   - **Case A — yellow banner with extractable values**: upload a
     POA where the AI extracted SOMETHING usable (e.g., one
     address line). Auto-prefill fills the matching empty fields.
     Banner shows blue "Filled from uploaded document" with a
     "Re-apply" button. Clicking it re-applies the same values
     (no visible change unless user had cleared them).
   - **Case B — yellow banner with no extractable values**: upload
     a POA where the AI returned no address fields at all. Banner
     stays yellow "Couldn't auto-fill". The "Pre-fill from
     uploaded document" button does NOT appear (nothing to fill).
   - **Case C — yellow banner with extracts but auto-prefill
     blocked** (e.g., user typed in fields first → targets weren't
     empty → auto-prefill skipped): banner shows yellow with
     button visible. Click → fields overwritten with doc values,
     banner flips to blue.
   - Same behavior on Identity sub-step with passport upload.

7. **Role toggle recomputes count** — open a person's KYC wizard (note
   the current "X of N uploaded" count). Toggle a role on (e.g.,
   add Director) using the role checkboxes at the top. Expected:
   the count updates within a second to reflect the new
   role's required docs without a manual page reload. Toggle off
   → count returns. Per-category breakdown also updates.

8. **No optimistic 100% on review walk** — open a person whose KYC is
   genuinely incomplete (some required fields or docs missing). Click
   "Review [Name]" → walk through every sub-step → reach the Review
   step → click out / back to People. Expected: PersonCard shows the
   ACTUAL percentage (< 100%). Reloading the page should NOT change
   the value. If the % was different before vs after the walk
   because the user actually filled fields, that's correct — the
   refresh after the walk picks up real saves. The only thing
   removed is the lie "you walked through, so you're done."

9. **`npm run lint && npm run build && npm test`** — all green.

---

## CHANGES.md

```markdown
### 2026-05-XX — B-058 — Free navigation in per-person KYC + Resend tooltip + retry prefill (Claude Code)

Four clickability/feedback upgrades:

- Sub-step breadcrumb (`Contact › Identity › Address › …`) now lets
  users jump forward as well as backward. Previously gated to
  completed steps only. Validation still happens per-step (the
  Submit button blocks if required fields are missing on Review),
  so free navigation doesn't bypass requirements — it just removes
  the "must walk in order" friction.
- KYC Documents category badges (IDENTITY / FINANCIAL / COMPLIANCE
  …) are now clickable from any sub-step. Click from outside the
  docs step → navigates to docs + scrolls to the category's
  section. Existing in-step scroll behavior preserved.
- Resend invite button tooltip now uses the shadcn Tooltip
  component instead of the native `title` attribute. Native
  tooltips don't fire on disabled buttons, so the 24h cooldown
  reason was invisible to users. Now wrapped in a span that
  receives the hover/focus event, with screen-reader access via
  conditional `tabIndex`.
- Address and Identity sub-step banners now expose a "Pre-fill from
  uploaded document" button (or "Re-apply" on the success state)
  whenever the uploaded doc has at least one extractable value
  matching the sub-step's fields. Same pattern as B-044 — applies
  the existing AI extraction to the form on demand. No AI re-run.
  Useful when auto-prefill was skipped because the user typed into
  fields first, or when the user wants explicit control over the
  fill.
- Role toggle now triggers `router.refresh()` so the page-level
  `requirements` / `documentTypes` / `documents` / `persons`
  re-fetch and the KYC progress strip reflects the new role's
  required-docs count without a manual reload.
- Removed the local `kycCompletedIds` optimistic override that
  forced `kycPct = 100` on the PersonCard whenever the user exited
  the per-person review walk. Walking the steps is not the same as
  finishing them; the card now trusts `computePersonCompletion`'s
  real value. `handleKycComplete` and `handleExitKycReview` now
  call `router.refresh()` so any saves from the walk are picked
  up server-side.

UI only. No DB changes.
```

---

## Things to flag to the user

- No migrations.
- All changes in one file (`PerPersonReviewWizard.tsx`).
- After CLI finishes, dev server cache restart is needed.
- If a sub-step happens to crash when entered with an incomplete
  prerequisite, gate that specific step explicitly — don't undo
  the free-nav change wholesale.

## Rollback

`git revert` the single commit. UI-only.
