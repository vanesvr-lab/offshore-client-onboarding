# B-141 — Center the unsaved-changes bar content (B-139 follow-up)

## Why

B-139 wrapped the unsaved-changes bar in a `max-w-7xl mx-auto` container and added a `lg:mr-20` button-group margin. The chat-bubble collision is fixed, but the bar still uses `justify-between`, which keeps the "You have unsaved changes" text on the left and pushes Cancel + Save to the right edge of the 1280px content column. On a typical 1920px monitor that still feels right-aligned, not centered.

Vanessa's actual ask was "move it towards the middle of the screen." This brief switches the bar from left-text + right-buttons to **one centered group of (text + buttons)** so the whole control cluster sits at the horizontal middle of the viewport.

## Out of scope (do NOT do in B-141)

- **Bar copy + button labels** — unchanged.
- **Bar position (top vs bottom)** — stays fixed at bottom.
- **Chat-bubble collision logic** — already fixed by B-139's `max-w-7xl` + `lg:mr-20`. Keep the safety guard; just change the layout direction.
- **Touch other sticky / floating UI** — only this one bar.

---

## Batch 1 — Layout tweak

### Locate the bar

In `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`, the unsaved-changes bar lives around lines 7012-7036 (currently). It looks like:

```tsx
{!reviewMode && pendingChanges && (
  <div className="fixed bottom-6 left-[260px] right-0 bg-white border-t border-x rounded-t-lg py-3 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
    <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
      <p className="text-sm text-amber-600 font-medium">You have unsaved changes</p>
      <div className="flex items-center gap-2 mr-0 lg:mr-20">
        <Button … >Cancel</Button>
        <Button … >Save changes</Button>
      </div>
    </div>
  </div>
)}
```

### The fix

Replace the inner content layout (everything between the outer fixed `<div>` and the closing `</div>`s) with:

```tsx
<div className="max-w-7xl mx-auto px-6 flex items-center justify-center gap-6 lg:mr-20">
  <p className="text-sm text-amber-600 font-medium">You have unsaved changes</p>
  <div className="flex items-center gap-2">
    <Button
      size="sm"
      variant="outline"
      onClick={handleCancel}
      className={`h-8 text-xs ${BTN_OUTLINE}`}
    >
      Cancel
    </Button>
    <Button
      size="sm"
      onClick={() => void handleSave()}
      disabled={saving}
      className={`h-8 text-xs ${BTN_PRIMARY}`}
    >
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
      Save changes
    </Button>
  </div>
</div>
```

Three changes:
1. `justify-between` → `justify-center` — content cluster sits in the middle instead of edge-to-edge.
2. `gap-6` on the outer flex so the message + buttons have breathing room within the centered group.
3. The `lg:mr-20` safety guard moves UP from the button group to the outer flex container, so on `lg:` and above the WHOLE centered cluster shifts left by 80px to ensure it never touches the chat bubble even on narrow viewports. The cluster is still visually centered to the eye because the offset is the same on both sides relative to the unused right area (the viewport's right margin is effectively 80px wider than its left, due to the bubble). For symmetry on smaller screens (where the bubble takes proportionally more space), the cluster is just plain centered.

### Verification (Batch 1)

Manual:
1. On a service detail page, edit any field to trigger the unsaved-changes bar.
2. The bar's content cluster (text + Cancel + Save) should be roughly centered horizontally on screen — NOT pushed against the right edge.
3. The cluster should clear the chat bubble (B-128) on every viewport width from 1280px to 1920px.
4. Cancel and Save still work identically (no behavior change).
5. The cluster stays inside the page's content column (doesn't push left of the sidebar at `left-[260px]`).

### Commit message (Batch 1)

```
fix: center unsaved-changes bar content (B-141)

B-139 fixed the chat-bubble collision but kept justify-between,
which leaves Cancel + Save flush against the right edge of the
1280px content column — still feels right-aligned on big screens.
Switch to justify-center and group "You have unsaved changes" +
the button cluster together so the whole control sits in the
horizontal middle of the viewport. The lg:mr-20 safety guard
moves up to the outer flex to keep the cluster clear of the
chat bubble.
```

---

## Batch 2 — CHANGES.md

### CHANGES.md

Top-of-file entry under `## B-141 — Center the unsaved-changes bar (done YYYY-MM-DD)`. One-liner since this is a B-139 follow-up.

### Tech debt log

No new entries needed.

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

- No copy / button label changes.
- No other sticky-UI audits.
- No touching the AssignedOfficerCard / chat widget / other right-rail content.
