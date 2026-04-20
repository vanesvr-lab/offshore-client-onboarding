# B-037 — Image compression, country dropdown color, required-field highlight

**Scope:** Client-side only. Three independent fixes bundled in one batch. Execute all three, commit + push + update CHANGES.md after each logical chunk, do not stop between them.

---

## Fix 1 — Browser-side image compression before upload

**Problem:** Vercel serverless body limit is 4.5 MB. Phone photos of passports/utility bills often exceed this, producing a 413 response. B-036 added a client-side guard that rejects large files with a clear message — this batch adds the actual fix: compress images before upload so most real-world KYC photos fit.

**Approach:**
- Install `browser-image-compression` (small, well-maintained, ~10 KB).
- Add `src/lib/imageCompression.ts` helper with `compressIfImage(file: File): Promise<File>`.
  - If `file.type` starts with `image/` → compress to max 2 MB target, preserve format when possible, fall back to JPEG.
  - Options: `{ maxSizeMB: 2, maxWidthOrHeight: 2400, useWebWorker: true, fileType: 'image/jpeg' as needed }`.
  - For PDFs and other non-image types → return the file as-is.
  - If compression fails for any reason → return the original file (fail open).
- Apply at every real upload site that sends a file to `/api/services/[id]/documents/upload`:
  - `src/components/client/ServiceWizardPeopleStep.tsx` — `handleUpload`
  - `src/components/shared/DocumentDetailDialog.tsx` — `handleReplace`
  - `src/components/client/ServiceWizardDocumentsStep.tsx` — the FormData upload site (~ line 51)
- While compressing, show a brief toast or inline spinner: `"Optimising image…"`.
- After compression, keep the existing 4.5 MB client-side guard as a safety net for edge cases (e.g. a 15 MB image that still can't get under 4.5 MB after compression).

**Verify:**
- Upload a 6–8 MB JPEG → lands successfully, file stored is ~1–2 MB.
- Upload a small 200 KB PNG → compression is skipped or near-instant; file uploads normally.
- Upload a 2 MB PDF → passes through untouched.
- Upload a 20 MB JPEG → compresses to 2–3 MB, then uploads.
- Upload a 50 MB PDF → client-side 4.5 MB guard kicks in with a clear "File is too large" toast (no silent failure).

**Commit:** `feat: B-037 — client-side image compression before upload`

Update CHANGES.md.

---

## Fix 2 — Country search dropdown uses `text-gray-400`

**Problem:** In the company / organisation KYC wizard, the country search dropdown inputs still use `text-gray-400` for the placeholder or search field. Users think it's disabled. Per the palette rule set in B-034, `text-gray-400` is reserved for genuinely disabled / informational UI only. Interactive controls should use `text-gray-500` for placeholder text and `text-gray-600` for chevrons / affordances.

**Files to audit and fix:**
- `src/components/shared/CountrySelect.tsx` — verify any remaining `text-gray-400` on active search input / chevron / clear button. Should have been fixed in B-034 but check again.
- `src/components/shared/MultiSelectCountry.tsx` — same audit; this is the multi-select variant used on e.g. `geographical_area`. Likely still uses `text-gray-400` in its search input, chevron, and chip remove button.
- Any other `<CountrySelect>` / `<MultiSelectCountry>` usage where the surrounding context wraps them in light grey.

**Rules to apply:**
- Placeholder text in the input: `text-gray-500`
- Chevron / dropdown indicator on the trigger: `text-gray-600`
- Search input icon (magnifier): `text-gray-600`
- Chip "×" remove button on multi-select: `text-gray-600 hover:text-red-600`
- Disabled / read-only state: keep `text-gray-400` (this is the one legitimate use)

**Verify:** Open the organisation KYC wizard (client side). Country dropdown and any multi-select country field should visibly look interactive — not ghost-grey.

**Commit:** `fix: B-037 — country dropdown palette tightened`

Update CHANGES.md.

---

## Fix 3 — Required-field red highlight shows on page load, not only after focus

**Problem:** In both the KYC wizard and the service application wizard, required fields only turn red after the user clicks into them and then leaves (touch-based validation). This means a client landing on step 1 sees a neutral form with no indication of what's mandatory; they realise only after interacting.

The user wants required fields to be visually obvious from the moment the page renders. Empty required fields should show:
- Label in red (`text-red-600`)
- Asterisk in red
- Field border in red (subtle — `border-red-300` or equivalent)
- "This field is required" helper text below the field

…without needing the user to click first.

**Root cause:** `src/hooks/useFieldValidation.ts` — `getFieldState()` returns `"error"` only when `touched.has(fieldKey)` is true. The `touched` set starts empty.

**Approach:**

Add a new mode to `useFieldValidation` that marks empty required fields as `error` immediately, without requiring touch.

Option A (preferred): add a parameter to `useFieldValidation` — `{ showErrorsImmediately?: boolean }`. When true, `getFieldState()` treats every empty required field as `error` on first render. Default remains false (current behaviour) for backwards compatibility.

```ts
export function useFieldValidation(options?: { showErrorsImmediately?: boolean }) {
  const showImmediately = options?.showErrorsImmediately ?? false;
  const [touched, setTouched] = useState<Set<string>>(new Set());
  // ...
  function getFieldState(fieldKey: string, value: unknown, required?: boolean): FieldState {
    const isFilled = value !== null && value !== undefined && String(value).trim() !== "" && value !== false;
    if (isFilled) return "filled";
    if (required && (showImmediately || touched.has(fieldKey))) return "error";
    return "normal";
  }
  return { markTouched, markAllTouched, getFieldState };
}
```

**Where to enable `showErrorsImmediately: true`:** every wizard step component that today calls `useFieldValidation()`. This includes but is not limited to:
- `src/components/kyc/steps/IdentityStep.tsx`
- `src/components/kyc/steps/FinancialStep.tsx`
- `src/components/kyc/steps/DeclarationsStep.tsx`
- `src/components/kyc/KycStepWizard.tsx` (CompanyDetailsStep, CorporateTaxStep, OrgReviewStep internal helpers if they use `useFieldValidation`)
- Any step component inside the service application wizard: search `useFieldValidation` across `src/components/client/` to find every call site.

Grep: `rg "useFieldValidation\(\)" src/` — flip each call to `useFieldValidation({ showErrorsImmediately: true })`.

**Do NOT flip** to `showErrorsImmediately` in contexts where showing "required" errors on load would be confusing (e.g. admin-side edit forms where the admin is inspecting, not filling in). Stick to client-facing wizards.

**Verify:**
- Land on the KYC wizard fresh — every required empty field shows red label + red asterisk + red border + "This field is required" underneath.
- Fill a field → label turns neutral, green check appears.
- Clear the field again → goes back to red immediately.
- Admin-side KYC edit on `/admin/services/[id]` — confirm any admin inputs do NOT have red errors on load (unless they were already using `useFieldValidation()` with intent).

**Commit:** `feat: B-037 — required-field errors visible on load`

Update CHANGES.md.

---

## Final batch-level verification

- `npm run build` clean after each commit
- All three fixes pushed to `origin/main`
- CHANGES.md has three distinct B-037 entries (or one consolidated entry listing all three — either is fine)

## Instructions to CLI

1. Run `git pull origin main` first.
2. Read this brief in full.
3. Execute all three fixes without pausing between them. Commit + push after each fix.
4. If a blocker appears, document it in CHANGES.md under a "B-037 blocker" heading and stop.
5. Do not restart the dev server yourself. The user will restart after you're done.
