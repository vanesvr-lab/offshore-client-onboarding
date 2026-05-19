# B-139 — Unsaved-changes bar collides with chatbot bubble

## Why

The sticky "You have unsaved changes" bar at the bottom of the service detail page renders its action buttons (Cancel / Save changes) flush against the right edge of the viewport. The B-128 chat assistant widget also lives at bottom-right. They overlap — the "Save changes" button is partially obscured by the chat bubble (Vanessa's screenshot shows "Save (..." truncated).

Two distinct fix paths, plus a third combined option:

| Option | What | Tradeoff |
|---|---|---|
| **A** | Add right padding to the bar so its buttons clear the chat widget (typically ~80px) | Keeps the bar's current look-and-feel; smallest diff |
| **B** | Move the bar's right-edge content INWARD using a max-width / mx-auto container so buttons sit closer to the page's content column (around the right edge of the form, not the viewport) | Buttons land at a natural "end of content" position; doesn't depend on chat-widget size |
| **C** | Combine: max-width container + a chat-widget-aware right padding so the buttons never clip on any screen size | Most robust |

This brief goes with **B + a guard**: align the buttons with the form's right edge instead of the viewport's right edge. Cleaner UX (buttons land where the eye expects them, by the content column) and naturally avoids the chat widget.

## Out of scope (do NOT do in B-139)

- **Repositioning the chat widget** — it stays at the bottom-right of the viewport. Standard convention; users expect it there.
- **Redesigning the bar** — copy ("You have unsaved changes") + the Cancel / Save buttons stay. This is layout only.
- **Other sticky bars** — there are other floating UI elements (toasts, banners). They don't currently collide with the chat widget. Don't touch.

---

## Batch 1 — Layout fix

### Locate the unsaved-changes bar

CLI: grep for `"You have unsaved changes"` in `src/` to find the component. Likely in `ServiceDetailClient.tsx` or a shared `UnsavedChangesBar.tsx` component.

### The fix

Wrap the bar's content in a max-width container matching the page's content column, with `mx-auto` to center it within the viewport. Cancel + Save buttons then sit at the right edge of the CONTENT, not the viewport.

```tsx
// Before (example — actual code may differ in detail):
<div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg px-6 py-3 flex items-center justify-between z-40">
  <span className="text-amber-700">You have unsaved changes</span>
  <div className="flex gap-2">
    <Button variant="outline" onClick={onCancel}>Cancel</Button>
    <Button onClick={onSave}>Save changes</Button>
  </div>
</div>

// After:
<div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg py-3 z-40">
  <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
    <span className="text-amber-700">You have unsaved changes</span>
    <div className="flex gap-2">
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button onClick={onSave}>Save changes</Button>
    </div>
  </div>
</div>
```

The exact `max-w-*` value should match the page's main content column. CLI: check the surrounding page layout for the existing max-width — likely `max-w-7xl` (1280px) but could be `max-w-6xl` (1152px) depending on the service detail page's container. Match whatever the main form uses so the bar visually aligns.

### Safety guard: never let buttons clip the chat widget

Even after the max-width fix, add a minimum right margin on the button group so it can't ever sit closer than ~80px to the viewport edge (in case a future page has wider content):

```tsx
<div className="flex gap-2 mr-0 lg:mr-20">  {/* clears the chat bubble on lg+ */}
```

This is a belt-and-suspenders guard. The chat bubble is ~56px wide; 80px gives clear separation.

### Verification (Batch 1)

Manual:
1. On a service detail page, edit any field (e.g. Year 2 turnover) to trigger the unsaved-changes bar.
2. Confirm "Save changes" button is fully visible — not obscured by the chat bubble.
3. Resize the viewport from 1920px wide down to 1024px. At every width, the button should remain visible and the chat bubble shouldn't overlap.
4. The Cancel / Save buttons should now visually align with the right edge of the form fields above them (the page's content column).

### Commit message (Batch 1)

```
fix: unsaved-changes bar aligns with content column, clears chat bubble (B-139)

The sticky "You have unsaved changes" bar rendered Cancel + Save
buttons flush against the viewport's right edge, partially
obscured by the B-128 chat assistant bubble at bottom-right. Wraps
the bar's content in a max-w-7xl mx-auto container so the buttons
land at the right edge of the page's content column instead, plus
a lg:mr-20 safety guard on the button group so it never sits within
80px of the viewport edge.
```

---

## Batch 2 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-139 — Unsaved-changes bar collides with chat bubble (done YYYY-MM-DD)`. Single line, no sub-batches needed.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Audit other floating / sticky UI for chat-bubble collisions — B-139 fixed the unsaved-changes bar. If toast notifications, banners, or floating action buttons start clipping the chat bubble too, apply the same pattern (max-width container + safety margin)."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure layout change.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- Chat widget position stays bottom-right.
- Bar copy + buttons + behavior unchanged.
- No other sticky-element audits in this brief.
