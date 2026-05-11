# CLI Brief — B-089 Section Card: Snug Padding Around the Pill (Step Variant)

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** revert of B-088 (commit `0b5ceb8`)

---

## Why this batch exists

On `/admin/services/[id]`, each step section card (Company Setup, Financial, Banking, People & KYC, Documents) wraps the blue header pill with **20 px horizontal + 16 px vertical** outer padding — the pill looks floaty inside the card. Vanessa wants the card to **hug the pill more tightly** so the two read as one visual block, while leaving the pill itself (width, height, internal padding, rounded corners) **unchanged**.

After this brief: the step-variant card's outer padding shrinks from `px-5 py-4` (20 / 16 px) to `px-2 py-2` (8 / 8 px). Nothing else changes — pill width, pill height, pill radius, badge + Review position, gap between cards, body content padding all stay as-is.

This is option (A) "Snug" from the open-question round: minimal visible breathing room between pill and card border.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main`) + update CHANGES.md.
2. **Only the `variant="step"` branch.** Default-variant rows (Internal Notes, Risk Assessment, Milestones, Audit Trail) keep their current `px-5 py-4` row padding — they're not in scope.
3. **No other changes.** Do not touch:
   - Pill internal padding (`px-3 py-1` stays).
   - Pill rounded-md (`rounded-md` stays).
   - SectionReviewControls position (stays inside the row, as sibling to the button).
   - Card border / shadow / outer color.
   - `space-y-4` gap between section cards on the page.
   - `CardContent` body padding when expanded (`pt-3 pb-4 px-5` stays).
4. **No prop API change.** `ServiceCollapsibleSection`'s callers in `ServiceDetailClient.tsx` need zero edits.
5. `npm run build` must pass clean.

---

## Step 1 — Make the row padding conditional on `isStep`

File: [`src/components/admin/ServiceCollapsibleSection.tsx`](src/components/admin/ServiceCollapsibleSection.tsx)

Today the row at line ~86 is shared between both variants:

```tsx
<div className="flex items-center px-5 py-4 gap-2">
```

Replace with:

```tsx
<div className={`flex items-center gap-2 ${isStep ? "px-2 py-2" : "px-5 py-4"}`}>
```

That's the entire functional change. Everything else inside the row (the button, the pill, SectionReviewControls) keeps working exactly as before.

## Step 2 — Smoke test (manual; document in CHANGES.md)

1. `/admin/services/[id]` — desktop view: each step section card now hugs the pill tightly with ~8 px gutter on each side and ~8 px above/below. Pill width, pill height, pill rounded corners all visually identical to the pre-B-088 state.
2. **Badge + Review button** still render inside the card row, immediately right of the pill. No squish — they have their natural width within the shrunken row.
3. **Default-variant rows** (Internal Notes, Risk Assessment, Milestones, Audit Trail) on the same page — outer padding **unchanged** (`px-5 py-4`). These rows look identical to before.
4. **Mobile 375 px:** card padding still `px-2 py-2`; pill content still fits (only title + Show▾ visible at this width). No horizontal overflow.
5. **Expand a section** — body content (`CardContent`) padding is `pt-3 pb-4 px-5` — body starts with 20 px horizontal padding even though the header row above is now 8 px. That's intentional: header is tight, body still has comfortable form padding.
6. `npm run build` clean.

If 1–4 look right but 5 looks awkward (the body padding visibly steps out wider than the header), flag in CHANGES.md — Vanessa can decide in a follow-up whether body padding should match. Don't change it in this brief.

---

## CHANGES.md format

Append after the existing revert entry (or the B-087 entry, whichever is the most recent):

```md
### YYYY-MM-DD — B-089 — Step-variant section card hugs pill tightly (Claude Code)

Step-variant section cards on `/admin/services/[id]` (Company Setup, Financial, Banking, People & KYC, Documents) now use `px-2 py-2` outer row padding (8 / 8 px) instead of `px-5 py-4` (20 / 16 px) — the card hugs the pill with minimal breathing room. Pill width, pill height, pill rounded corners, SectionReviewControls position, and the gap between cards are all unchanged. Default-variant rows (Internal Notes, Risk Assessment, Milestones, Audit Trail) keep their original `px-5 py-4` padding.

- `ServiceCollapsibleSection.tsx`: row className becomes `flex items-center gap-2 ${isStep ? "px-2 py-2" : "px-5 py-4"}`. No other edits.

Smoke test: <pass/fail>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT touch the pill itself (`px-3 py-1`, `rounded-md`, `bg-[#06629c]` all stay).
- Do NOT move SectionReviewControls outside the card row — that was B-088 and got reverted.
- Do NOT change the gap between section cards (`space-y-4` on the parent column stays).
- Do NOT change `CardContent` body padding even if it now looks slightly stepped relative to the tighter header — flag for follow-up, don't fix in this brief.
- Do NOT touch the default-variant branch — its `px-5 py-4` stays.
- Do NOT introduce a new prop / variant — the `isStep` check already exists in the function.
- Do NOT restart the dev server yourself.
