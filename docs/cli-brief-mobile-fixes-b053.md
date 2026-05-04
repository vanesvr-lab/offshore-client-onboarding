# B-053 — Mobile/desktop polish fixes (B-052 follow-up)

## Why

Two bugs surfaced after B-052 went live, found while QA-ing on real devices:

1. **`ServiceWizardNav` footer is misaligned on mobile.** The fixed nav bar uses `left-[260px]` to align with the desktop sidebar; B-052 Batch 4 fixed the same pattern in `KycStepWizard.tsx` but missed this file. On a 375px viewport the bar starts 260px from the left, leaving ~115px of usable space — the `← Back` and `Save & Close` buttons get crammed and visually overlap form content above.
2. **`DocumentStatusLegend` overflows the KYC progress strip on desktop.** The inner div at `PerPersonReviewWizard.tsx:1209` is `flex items-center gap-4` with no `flex-wrap`. Category badges + the legend share the same row; when their combined width exceeds the strip, the legend gets pushed into a narrow column and stacks vertically outside the card border.

Both are 1–2 line fixes. Single batch, no need to split.

## Scope

- **In**: the two specific files below.
- **Out**: anything else. Don't go fishing for other `left-[Npx]` patterns — those have already been audited; if they exist, they belong in a future batch.

## Working agreement

Single batch. After the fixes pass local verification: commit, push,
update CHANGES.md.

---

## Fix 1 — `src/components/client/ServiceWizardNav.tsx` line 60

Current:

```tsx
<div className="fixed bottom-6 left-[260px] right-0 bg-white border-t border-x rounded-t-lg px-6 py-3 flex items-center justify-center gap-3 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
```

Replace with:

```tsx
<div className="fixed bottom-0 md:bottom-6 left-0 md:left-[260px] right-0 bg-white border-t md:border-x md:rounded-t-lg px-4 md:px-6 py-3 flex items-center justify-center gap-2 md:gap-3 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)] flex-wrap">
```

Changes (one diff):
- `bottom-6` → `bottom-0 md:bottom-6` (sit flush to viewport bottom on mobile so the bar doesn't float oddly)
- `left-[260px]` → `left-0 md:left-[260px]` (full-width on mobile, sidebar-offset on desktop)
- `border-x` → `md:border-x` (no side borders on mobile because the bar reaches the edges)
- `rounded-t-lg` → `md:rounded-t-lg` (no rounded corners on mobile for the same reason)
- `px-6` → `px-4 md:px-6` (tighter padding at narrow widths)
- `gap-3` → `gap-2 md:gap-3` (tighter button spacing on mobile)
- Add `flex-wrap` so a 3-button row (Back / Save & Close / Next) wraps onto a second row at very narrow widths instead of clipping

After this change, also check the consumer of `ServiceWizardNav` to make sure the wizard's main scrollable content has enough bottom padding so it doesn't sit under the now-flush mobile nav bar. The most likely consumer is `src/components/client/ServiceWizard.tsx`. Ensure the main content area has `pb-32 md:pb-24` (or similar — match what KYC uses post-B-052).

If `ServiceWizard.tsx` already has bottom padding that accounts for the bar, leave it. Don't speculatively pad if it's already correct.

## Fix 2 — `src/components/client/PerPersonReviewWizard.tsx` line 1209

Current:

```tsx
<div className="flex items-center gap-4 text-xs text-gray-600">
  {personCategories.map((cat) => { ... })}
  <DocumentStatusLegend />
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-x-4 gap-y-2 text-xs text-gray-600 flex-wrap">
  {personCategories.map((cat) => { ... })}
  <DocumentStatusLegend />
</div>
```

Changes:
- `gap-4` → `gap-x-4 gap-y-2` (decouple horizontal from vertical so wrapped rows have tighter vertical spacing)
- Add `flex-wrap` so the legend drops to its own row at narrow widths instead of overflowing

This keeps the original "categories + legend on one line at wide widths" layout, but lets the legend wrap cleanly when space runs out.

If after this change the legend still feels visually crowded on a 1024-1200px viewport (where the parent strip is wider but not desktop-wide), the next-best option is to move the legend out of the inner row entirely and render it on its own row below the strip. **Don't do that pre-emptively** — verify the wrap behavior first. If it looks fine at 1024 / 1280 / 1440 / 1920, the fix is done.

## Verification

After both edits:

1. **Restart dev server** (layout-touching changes can corrupt the .next cache):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Mobile (375 × 667)** — open `/apply/[templateId]/details` (any template):
   - Footer bar runs edge-to-edge, sits flush with the bottom of the viewport
   - `← Back` and `Save & Close` buttons are visible, not clipped, not floating in mid-air
   - On the last step, `Submit` button replaces `Next` and still fits

3. **Tablet (768 × 1024)** — same page:
   - Footer bar reverts to floating-card style with `bottom-6` offset and `left-[260px]` alignment

4. **Desktop (1280 × 800)** — open `/apply/[templateId]/[any wizard step]` for a person at KYC step 4 (the screenshot the user reported the legend bug on):
   - KYC Documents progress strip: title on the left, category badges + legend on the right
   - Legend stays inside the card border; no items hang outside
   - At 1280px wide, everything fits on one row; at 1024px the legend may wrap to a second row inside the strip — that's fine

5. **Run the test suite** — both fixes are CSS-only so no test changes needed, but confirm nothing breaks:
   ```
   npm test
   npm run build
   ```

## CHANGES.md entry

Single entry under "Recent Changes":

```markdown
### 2026-05-04 — B-053 — Mobile/desktop polish fixes (Claude Code)

Two B-052 follow-up fixes from real-device QA.

- `ServiceWizardNav` (`src/components/client/ServiceWizardNav.tsx`): fixed
  footer bar was hardcoded to `left-[260px] bottom-6`, which on mobile
  pushed the bar 260px past the screen edge. Now `left-0 md:left-[260px]`
  and `bottom-0 md:bottom-6`, with edge-to-edge layout (`md:border-x`,
  `md:rounded-t-lg`) and `flex-wrap` so 3 buttons gracefully wrap on
  narrow viewports. Same family of fix as the B-052 §4 KycStepWizard
  change — this file was missed.
- `PerPersonReviewWizard` (`src/components/client/PerPersonReviewWizard.tsx`
  line 1209): KYC progress strip's inner row had no `flex-wrap`, causing
  the `DocumentStatusLegend` to overflow the card boundary at desktop
  widths and stack vertically outside the right edge. Added `flex-wrap`
  and split the gap into `gap-x-4 gap-y-2` so wrapped rows look
  intentional.
```

## Things to flag to the user

- No DB changes, no migrations.
- No new dependencies.
- Pure CSS edits.

## Rollback

`git revert` the single commit. No state to undo.
