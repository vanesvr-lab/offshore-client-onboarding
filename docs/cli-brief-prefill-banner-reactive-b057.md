# B-057 — Prefill banner reacts to document uploads (single source of truth)

## Why

Real-device QA on the per-person KYC wizard surfaced contradictory
banners after uploading a Proof of Address:

- A **green** banner from the outer `PrefillUploadCard` ("Pre-filled
  from your proof of address — please review the values below.")
- A **yellow** banner from the inner `ResidentialAddressStep`
  ("Couldn't auto-fill from your document. Please enter values
  manually.")
- Form fields all empty + required-field errors firing.

Root cause: two independent prefill systems looking at different
slices of the same extraction:

1. **Outer system** (`PerPersonReviewWizard.tsx` / `PrefillUploadCard`)
   sets a sticky `prefillFilledKinds.has("poa")` flag if the AI
   returned ANY non-empty value with a `prefill_field` mapping (e.g.,
   `full_name` got extracted but no address fields). Green banner
   shows.
2. **Inner system** (`ResidentialAddressStep` / `IdentityStep`) uses a
   one-shot `useEffect` gated by `prefillFiredRef` that runs **once on
   mount** and never re-evaluates on subsequent doc uploads. Filtered
   to address-/identity-specific fields. When zero relevant fields
   come back, sets `bannerState = "error"`. Yellow banner shows.

The two banners both render at the same time. The user sees a
contradiction.

The user's preferred fix: **the inner step should re-evaluate its
banner state every time a relevant document is uploaded**, and the
outer "Pre-filled" banner should be removed so the inner step is the
single source of truth for prefill feedback.

## Scope

- **In**: `ResidentialAddressStep.tsx`, `IdentityStep.tsx`,
  `PerPersonReviewWizard.tsx` (`PrefillUploadCard` filled state).
- **Out**: changing the AI prompt, the `ai_extraction_fields` config
  on doc types, or the OCR pipeline. If the AI didn't return
  address-relevant fields for the user's POA upload, the user will
  correctly see the yellow "Couldn't auto-fill" banner — that's
  honest UX, not a bug.

## Working agreement

Single batch. After the fix passes local verification: commit, push,
update CHANGES.md. No DB migrations.

After CLI finishes the file edits, run the dev-server restart pattern
per CLAUDE.md ("Dev Server Restart Pattern"):
```
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## Step 1 — Drop the one-shot gate in `ResidentialAddressStep.tsx`

**File**: [`src/components/kyc/steps/ResidentialAddressStep.tsx:120-165`](src/components/kyc/steps/ResidentialAddressStep.tsx:120)

Current pattern:

```ts
const [bannerState, setBannerState] = useState<PrefillBannerState>("idle");
const prefillFiredRef = useRef(false);

useEffect(() => {
  if (prefillFiredRef.current) return;
  prefillFiredRef.current = true;

  if (!addressDoc) { setBannerState("no-source"); return; }
  if (prefillable.length === 0) {
    setBannerState(availableExtracts.length > 0 ? "success" : "error");
    return;
  }
  if (!effectiveKycRecordId) { setBannerState("error"); return; }

  void (async () => {
    setBannerState("running");
    // ... PATCH /api/profiles/kyc/save with `prefillable` payload
    // ... setBannerState("success" | "error")
  })();
}, []);
```

Replace with:

```ts
const [bannerState, setBannerState] = useState<PrefillBannerState>("idle");
// Track which doc.id we've already PATCHed for, so navigating away and
// back to this sub-step doesn't re-fire the save against an unchanged doc.
const prefilledFromDocIdRef = useRef<string | null>(null);

useEffect(() => {
  // 1. No POA uploaded yet → gentle "no-source" banner.
  if (!addressDoc) {
    setBannerState("no-source");
    prefilledFromDocIdRef.current = null;
    return;
  }

  // 2. POA exists but the AI didn't return any address-relevant value.
  if (availableExtracts.length === 0) {
    setBannerState("error");
    return;
  }

  // 3. POA exists and AI returned values, but every form field is
  //    already populated (likely the outer flow patched them, or the
  //    user typed them, or this is a re-mount after a prior PATCH).
  if (prefillable.length === 0) {
    setBannerState("success");
    return;
  }

  // 4. New extracts available — PATCH the empty fields once per doc.
  if (!effectiveKycRecordId) {
    setBannerState("error");
    return;
  }
  if (prefilledFromDocIdRef.current === addressDoc.id) {
    // We've already saved for this doc; don't re-PATCH on every render.
    return;
  }

  prefilledFromDocIdRef.current = addressDoc.id;
  void (async () => {
    setBannerState("running");
    try {
      const payload: Record<string, string> = {};
      for (const row of prefillable) payload[row.target] = row.value;
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
    } catch {
      setBannerState("error");
    }
  })();
}, [addressDoc?.id, addressDoc?.verification_result, prefillable.length, availableExtracts.length, effectiveKycRecordId]);
```

What this gives you:

- Page loads with no POA → banner = `no-source`.
- User uploads POA via the outer card → `addressDoc` becomes truthy →
  effect re-runs → either `success` (PATCH fires, fields populate) or
  `error` (AI returned nothing useful for address) — **no longer a
  one-shot**.
- User navigates away to another sub-step and comes back →
  `prefilledFromDocIdRef.current === addressDoc.id` → no duplicate
  PATCH, but banner stays at the right state.
- User replaces the POA → new `addressDoc.id` → effect re-runs → fresh
  PATCH against the new extraction.

## Step 2 — Same fix in `IdentityStep.tsx`

**File**: [`src/components/kyc/steps/IdentityStep.tsx:208`](src/components/kyc/steps/IdentityStep.tsx:208)

Same pattern, same fix. The component is structurally identical:
- `prefillFiredRef` → replace with `prefilledFromDocIdRef`
- Empty `useEffect` deps `[]` → replace with the relevant dep array
  (`passportDoc?.id`, `passportDoc?.verification_result`,
  `prefillable.length`, `availableExtracts.length`,
  `effectiveKycRecordId`)
- Use the same flow logic from Step 1

Read the file's current useEffect carefully and translate the same
pattern. The "passport" semantics replace "POA" but the structure is
identical.

## Step 3 — Drop the outer "Pre-filled" success banner

**File**: [`src/components/client/PerPersonReviewWizard.tsx:1700-1747`](src/components/client/PerPersonReviewWizard.tsx:1700) (the `PrefillUploadCard` component)

Currently:

```tsx
if (filled) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
      <p className="text-sm text-emerald-800">
        Pre-filled from your {docLabel}. Please review the values below.
      </p>
    </div>
  );
}
return (
  <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/40 p-4">
    {/* Upload prompt */}
  </div>
);
```

Change to:

```tsx
// After a successful upload, the inner step (IdentityStep /
// ResidentialAddressStep) is the single source of truth for prefill
// feedback. Replace the success card with a quieter "Replace" affordance
// so users can re-upload if the extraction was wrong.
if (filled) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50/50 px-4 py-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm text-gray-700">
        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>{docLabel.charAt(0).toUpperCase() + docLabel.slice(1)} uploaded.</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onTrigger}
        disabled={uploading}
        className="h-8 text-xs"
      >
        Replace
      </Button>
    </div>
  );
}
return (/* unchanged upload prompt */);
```

The banner is now neutral ("uploaded") with a Replace action. The
"prefilled vs not" judgment is the inner step's job.

## Step 4 — Remove the redundant outer toast

While you're in [`PerPersonReviewWizard.tsx:926-929`](src/components/client/PerPersonReviewWizard.tsx:926):

```ts
toast.success(
  `Pre-filled ${rows.length} field${rows.length === 1 ? "" : "s"} from your ${kind === "passport" ? "passport" : "proof of address"}.`,
  { position: "top-right" }
);
```

Delete this. The inner step already sets a `success` banner; we don't
need a top-right toast on top of an inline banner. Keep the
`toast.error` calls in the same function — those still serve when the
upload itself fails (network, file too big, etc.).

## Step 5 — Update `prefillFilledKinds` to mean "uploaded", not "prefilled"

`prefillFilledKinds` is now the wrong name — after Step 3 it tracks
"the user has uploaded a doc of this kind," not "we successfully
prefilled from it." Rename to `prefillUploadedKinds`.

Find every reference:
```bash
grep -n "prefillFilledKinds" src/components/client/PerPersonReviewWizard.tsx
```

Rename in place. The state setter, the prop on `PrefillUploadCard`
(`filled` → `uploaded` — but that prop name already exists separately,
read carefully and keep them distinct), and the rendering logic.

If renaming touches more than ~10 sites and risks confusion, just
update the call sites and leave the variable name; less critical.

## Verification

1. **Restart dev server** (CLAUDE.md pattern):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Reproduce the original bug**: open a person's KYC at the Address
   sub-step. Confirm a gray "Upload your proof of address to auto-fill
   these fields" banner is showing.

3. **Upload a clean POA** (with a clear address visible). Expected:
   - During upload: outer card shows "Reading…" with spinner.
   - After AI returns address fields: inner banner flips to "success"
     (blue "Filled from uploaded document. Values extracted from your
     proof of address.") and form fields populate.
   - Outer card collapses to neutral "Proof of address uploaded.
     [Replace]".
   - **No green "Pre-filled from your proof of address" banner**, **no
     yellow "Couldn't auto-fill" banner** at the same time. Just the
     blue success banner.

4. **Upload a POA the AI can't read** (e.g., upload a passport image
   to the POA slot, or use a low-res document). Expected:
   - During upload: outer "Reading…".
   - After AI returns no address fields: outer collapses to "Proof of
     address uploaded. [Replace]". Inner banner shows yellow
     "Couldn't auto-fill from your document. Please enter values
     manually." Form stays empty (user must type).
   - **No contradictory green banner.**

5. **Navigate away and back**: leave the Address sub-step, come back.
   Banner should still reflect the same state as before navigation
   (success or error), and **no duplicate PATCH should fire** —
   verify by watching the Network tab; only one
   `/api/profiles/kyc/save` per upload.

6. **Replace the POA**: click "Replace" on the outer card, upload a
   different doc. Expected: effect re-runs against the new doc,
   banner updates, fields update.

7. **Same flow for IdentityStep**: repeat 2-6 with passport on the
   Identity sub-step.

8. **Run the suite**:
   ```
   npm run lint && npm run build && npm test
   ```
   All green.

## CHANGES.md

Single B-057 entry:

```markdown
### 2026-05-XX — B-057 — Prefill banner reacts to uploads (Claude Code)

Real-device QA found contradictory banners on the Address sub-step
(green "Pre-filled" + yellow "Couldn't auto-fill" rendering at the
same time). Root cause: two independent prefill systems looking at
different slices of the AI extraction.

- `ResidentialAddressStep.tsx` and `IdentityStep.tsx`: dropped the
  one-shot `prefillFiredRef` gate; the prefill `useEffect` now
  re-evaluates whenever the relevant doc id or its
  verification_result changes. New `prefilledFromDocIdRef` prevents
  duplicate PATCHes against an already-handled doc on remount.
- `PerPersonReviewWizard.tsx` (PrefillUploadCard): the outer green
  "Pre-filled from your <doc>" success banner is replaced with a
  neutral "<Doc> uploaded. [Replace]" card. The inner step is now
  the single source of truth for prefill success/failure feedback.
- Removed the redundant top-right toast that fired alongside the
  inline banner.

No DB changes. UI only.
```

## CLAUDE.md

If you find yourself adding more "single source of truth for X"
patterns, consider a "Component coordination" gotcha. Otherwise no
doc update.

## Things to flag to the user

- No DB migrations.
- Pure CSS/state edits in 3 files.
- After CLI is done, dev server cache restart is required (CLAUDE.md
  pattern).
- If during verification you find the AI prompt isn't asking for
  address fields at all, that's a separate issue — flag it and
  defer to a future batch (don't change the prompt as part of this
  batch).

## Rollback

`git revert` the single commit. No state changes.
