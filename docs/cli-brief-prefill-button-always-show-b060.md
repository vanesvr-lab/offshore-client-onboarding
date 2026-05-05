# B-060 — "Pre-fill from uploaded document" button always shows when a doc is uploaded

## Why

B-058 §4 added a manual "Pre-fill from uploaded document" button on
the Address and Identity sub-step banners. The render gate is too
strict: `addressDoc && availableExtracts.length > 0`. When the AI
returned no extracted fields relevant to the sub-step (e.g., a POA
upload where Claude couldn't read the address), `availableExtracts`
is empty, so the button is hidden and the user has no way to retry.

The user explicitly wants the button to appear whenever a doc has
been uploaded — regardless of whether the extraction has anything
useful for the current sub-step. The handler already toasts a clear
message ("This document didn't include address details. Please
enter them below.") when `availableExtracts.length === 0`, so
relaxing the gate doesn't lose information.

## Scope

- **In**: render gates in `ResidentialAddressStep.tsx` and
  `IdentityStep.tsx`. Two condition changes per file.
- **Out**: the handler logic itself (already correct), the AI prompt,
  any DB changes.

## Working agreement

Single-file scope per step, two files total. No DB changes.
Commit, push, update CHANGES.md. Restart dev server per CLAUDE.md
since these are layout-touching renders.

---

## Step 1 — Loosen the gate in `ResidentialAddressStep.tsx`

**File**: [`src/components/kyc/steps/ResidentialAddressStep.tsx:260`](src/components/kyc/steps/ResidentialAddressStep.tsx:260)

Current:

```tsx
{addressDoc && availableExtracts.length > 0 && (
  <Button … onClick={() => void handleManualPrefill()} … >
    {manualPrefilling ? "Filling…" : "Pre-fill from uploaded document"}
  </Button>
)}
```

Replace `addressDoc && availableExtracts.length > 0` with just
`addressDoc?.verification_result` at BOTH gate sites (line 260 and
line 285).

The new gate says "show the button as soon as the AI has finished
processing the document." It doesn't matter whether anything useful
was extracted for THIS sub-step — clicking the button either fills
fields (success) or shows a toast saying nothing was found (clear
explanation). Either way, the user has agency.

Also remove the `availableExtracts.length === 0` early-return inside
`handleManualPrefill` from a "silent" return to a toast-and-return
(it's likely already a toast — verify):

```ts
if (availableExtracts.length === 0) {
  toast.info("This document didn't include address details. Please enter them below.");
  return;
}
```

That copy is already correct. Just confirm it's in place.

## Step 2 — Same in `IdentityStep.tsx`

**File**: [`src/components/kyc/steps/IdentityStep.tsx`](src/components/kyc/steps/IdentityStep.tsx)

Mirror the change. Find the equivalent render sites (search for
`availableExtracts.length > 0` and the doc reference like
`passportDoc`). Replace with just the doc-exists check.

The toast copy on the empty-extracts path should reference "passport"
instead of "address" if it doesn't already.

---

## Step 3 — Verification

1. **Restart dev server** (CLAUDE.md):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Doc uploaded, no useful extracts** — open a person's KYC at
   the Address sub-step where a POA was uploaded but the AI returned
   no address fields (the current "PANIKEN VANESSA → Vanessa
   Rangasamy" / GBC-0002 setup matches this). Expected:
   - Yellow "Couldn't auto-fill from your document" banner is
     visible.
   - **Pre-fill from uploaded document** button is now visible
     alongside the message.
   - Click the button → toast appears: "This document didn't
     include address details. Please enter them below."
   - No fields populate (correct — there was nothing to fill).
   - Form remains in the same state for manual entry.

3. **Doc uploaded with useful extracts** — upload a clean POA
   where the AI extracts at least one address field. Expected:
   - Auto-prefill fires on upload, fields populate.
   - Banner is blue "Filled from uploaded document" with
     "Re-apply" button visible.
   - Clicking "Re-apply" overwrites form values with doc values
     (no-op visually if user hadn't edited them).

4. **No doc uploaded** — fresh page, no POA uploaded. Expected:
   - Gray "Upload your proof of address to auto-fill these
     fields" banner is visible.
   - **Button is NOT shown** — there's no doc to pre-fill from.
     This is correct.

5. **Same flows on Identity sub-step** with passport uploads.

6. **`npm run lint && npm run build && npm test`** — all green.

---

## CHANGES.md

```markdown
### 2026-05-XX — B-060 — Always show "Pre-fill from uploaded document" button when a doc exists (Claude Code)

B-058 §4 introduced a manual prefill button gated on
`availableExtracts.length > 0` after filtering to the sub-step's
relevant fields. When the AI returned no extracts relevant to the
sub-step (e.g., a POA where Claude couldn't read the address), the
button was hidden and users had no retry path. Loosened the render
gate to `addressDoc?.verification_result` (or equivalent on
Identity) — show the button as soon as the AI has finished
processing the doc. The existing handler already shows a clear
toast when no relevant fields are extracted, so the user gets an
explanation either way.

UI only. No DB changes.
```

---

## Rollback

`git revert` the single commit. UI-only change.
