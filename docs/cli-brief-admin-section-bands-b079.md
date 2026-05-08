# CLI Brief — B-079 Admin Section Bands + Compact Headers

**Status:** Ready for CLI
**Estimated batches:** 2
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-076 (vertical containment), B-077 (per-section structure), B-078 (Save bar + edit rights)

---

## Why this batch exists

Vanessa's review of `/admin/services/[id]` after B-078 surfaced two visual issues:

1. **Section structure is hard to scan.** Top-level steps (Company Setup / Financial / Banking / People & KYC / Documents) and the per-profile expansions inside People & KYC currently use the same gray header treatment, so the hierarchy doesn't read at a glance. Vanessa pointed at PsycNET's advanced-search UI as the reference — solid colored bands per section with explicit Hide / Show affordances.
2. **Vertical spacing on top-level section headers is too loose** vs the compact stepper at the top of the page.

Pure visual pass — no behavior changes, no DB writes, no API touches. Two batches: bands + compact spacing in Batch 1, smoke test + cleanup in Batch 2.

After this brief: the admin services page reads as a clear two-level hierarchy (navy top-level steps → light-blue profile expansions inside People & KYC), each band has an explicit `Hide ▾` / `Show ▸` toggle, and the page feels tighter overall.

---

## Hard rules

1. Complete both batches autonomously. Commit + push + update CHANGES.md after each batch. Don't stop unless blocked.
2. **Strictly visual.** No state changes, no API changes, no DB changes, no behavior changes (toggle behavior already exists from B-076/7 — reuse it).
3. **Out of scope, leave alone:**
   - KYC subsection headers inside the per-profile expanded view (Identity / Financial / Declarations / Documents) — keep current `bg-gray-50` styling. Vanessa wants to revisit these as a lighter variant later, not now.
   - The right-column cards (Audit Trail, Workflow Milestones, etc.) — different styling system.
   - The existing Save bar from B-078, the Review button, the InlineReviewBadge / Pill, status dots, progress bars — preserve all functionality, just adapt their colors so they remain legible on the new band backgrounds.
   - The bottom Documents block (B-077/2) inside the per-profile container — its header is already inside the per-profile container, so it counts as part of the profile-level visual scope. Keep its existing collapsible behavior; only restyle the header to fit the new color hierarchy (treat it as a profile-level subsection — see Batch 1 for exact treatment).
4. **Reuse existing chevron-toggle pattern from B-076/7** — full-row click target, chevron rotates on open. Just add the explicit `Hide ▾` / `Show ▸` text label next to the chevron.
5. **No new colors beyond the two HEX codes Vanessa specified:**
   - Top-level step band: `#06629c`
   - Profile-level band: `#7dbbe3`
   - Profile-level vertical containment line (was `border-gray-200`): also `#7dbbe3`
   - Top-level step container border: `border-gray-900` (or `#000000` if `border-gray-900` looks too soft — pick whichever reads cleaner on screen)
6. `npm run build` must pass before declaring any batch done.

---

## Files in scope

Likely the only file you need to touch:
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — top-level step section components, per-profile expanded container, profile section header, KycLongFormSection (DO NOT touch — out of scope), Documents block header inside per-profile container

Possibly:
- Tailwind config (`tailwind.config.ts` or similar) — if you want to register the two HEX codes as named colors (`bg-step-band`, `bg-profile-band`) instead of using arbitrary `bg-[#06629c]` syntax. Either is fine; named is slightly cleaner if these colors get reused. Pick whichever you'd rather maintain.

NOT in scope:
- `src/components/kyc/*` — these are the inner KYC subsection components, leave them alone

---

## Batch 1 — Apply bands + compact headers + black border

### 1a — Top-level step section bands (`#06629c`)

For every top-level step section header on `/admin/services/[id]` (Company Setup, Financial, Banking, People & KYC, Documents):

- **Background:** solid `#06629c`
- **Text color:** white (`text-white`)
- **Padding:** `px-4 py-2` (down from current `py-3` / `py-4` — match the stepper's compactness; eyeball it against the top stepper, should feel like the same vertical rhythm)
- **Border around the step container** (the outer wrapper of each top-level step card): `border-gray-900` instead of current light gray
- **Right-side affordance:** explicit text label next to the chevron
  - When expanded: `Hide ▾` (text + ChevronDown rotated 180°)
  - When collapsed: `Show ▸` (text + ChevronDown at 0°)
  - Text size: `text-xs`, color: `text-white/80` (slight dimming so the section title stays the dominant element)
  - Spacing: `gap-1.5` between text and chevron
- **Existing affordances on the band must stay legible:**
  - Status dot (currently green/amber/red bg) → keep the same colors but ensure they read on navy (they will — those are saturated colors)
  - Section title (currently `text-brand-navy`) → switch to `text-white`
  - "Not reviewed" / "Reviewed" pills → use a translucent white background variant so they remain visible on navy (e.g. `bg-white/15 text-white border border-white/30`); existing styling on gray-50 won't read on navy
  - Progress bar track (`bg-gray-200`) → switch to `bg-white/20` so the navy doesn't bleed through; progress fill keeps its existing colors
  - Percentage text (`text-gray-500`) → `text-white/80`
  - Review button (if present at this level) → use `variant="outline"` with `border-white/40 text-white hover:bg-white/10` so it reads as a band-level affordance instead of the current dark outline
- **Click target:** the entire band toggles open/close (already in B-076/7, no change). Review button + any other interactive elements on the band keep their `e.stopPropagation()` from B-076/7.

### 1b — Profile-level bands inside People & KYC (`#7dbbe3`)

For every profile header inside the People & KYC step's expanded view (one per profile — Vanessa, John, etc.):

- **Background:** solid `#7dbbe3`
- **Text color:** dark (`text-gray-900` or `text-brand-navy`) — the lighter blue is high enough lightness that white text would be illegible. Use dark text.
- **Padding:** `px-4 py-2` (same compactness as top-level)
- **Right-side affordance:** same `Hide ▾` / `Show ▸` pattern as 1a, but with dark text colors (`text-gray-900/80`)
- **Existing affordances stay legible on light blue:**
  - Status dot — keep existing colors
  - Profile name (currently dark) — keep dark
  - "Not reviewed" pills — existing gray styling probably reads OK on light blue; if it looks washed out, bump contrast (e.g. `bg-white text-gray-700 border-gray-300`)
  - Progress bar — keep existing
  - Review button (B-077/5) — keep existing
- **Click target:** entire band toggles (existing behavior from B-076/7).

### 1c — Vertical containment line per profile

The `border-l-4 border-gray-200 pl-4` container that wraps each profile's expanded content (from B-076/6 + B-077/1):

- Change `border-gray-200` → `border-[#7dbbe3]` (or use a Tailwind named color if you registered one in 1a)
- Keep `border-l-4 pl-4` width / padding unchanged

This visually connects the profile band at the top to the line running down the side of the expanded content — they read as one container.

### 1d — Documents block header inside the per-profile container

The collapsible Documents block at the bottom of each profile (added in B-077/2) lives *inside* the per-profile container, so it's at the profile-subsection level. Treatment:

- Keep current `bg-gray-50` header styling — do NOT make it a colored band. (Same reason KYC subsection headers stay as-is: avoids three nested colored bands.)
- No change to its toggle behavior.

If keeping it gray creates a weird visual gap inside the light-blue containment, add `border-l border-[#7dbbe3]` on its inner content area so the vertical line continues unbroken through it. Otherwise leave it alone.

### Acceptance

- Page renders with clear two-level color hierarchy: navy top-level bands → light-blue profile bands inside People & KYC
- Top-level step containers have a black outer border
- Top-level step header padding is visibly tighter (matches the stepper at the top of the page)
- Every band has explicit `Hide ▾` / `Show ▸` text + chevron on the right
- Status dots, pills, progress bars, Review buttons are all legible on their new band backgrounds
- KYC subsection headers (Identity / Financial / etc.) inside profiles are visually unchanged (still gray-50)
- Vertical line down each profile is now `#7dbbe3`, ties the band + container together
- Toggle behavior unchanged: full-row click expands/collapses, Review button still stops propagation
- `npm run build` passes

---

## Batch 2 — Smoke test + cleanup

### Smoke test (manual)

Walk through `/admin/services/[id]` for a service with at least one profile that has both uploaded docs and unfilled fields:

1. Top-level steps: each renders with navy band, black border, white text, `Hide ▾` toggle on the right
2. Click `Hide ▾` on a top-level step → collapses, label flips to `Show ▸`
3. Expand People & KYC → profile bands inside render with `#7dbbe3`, dark text, same Hide/Show affordance
4. Each profile's expanded content shows the `#7dbbe3` vertical line on the left
5. Status dots, "Not reviewed" pills, progress bars, percentages, Review buttons — all readable on both navy and light-blue bands
6. KYC subsection headers (Identity / Financial / Declarations / Documents) inside profiles — still gray-50, unchanged
7. Documents block at the bottom of each profile — still gray-50 header, unchanged collapsible behavior
8. Top-level step header padding feels visually tight, matches the stepper at the top of the page
9. Save bar from B-078 still appears at the bottom when fields are dirty, no visual collision with the new bands
10. Stepper at the very top of the page is unchanged

Document smoke test result in CHANGES.md (pass/fail per step). If any step fails, fix before commit.

### Cleanup

- Remove any leftover `console.log` or commented-out experiments from Batch 1
- If you registered named Tailwind colors for the two HEX codes, ensure the names are descriptive (`step-band` / `profile-band` rather than something abstract like `blue-1` / `blue-2`)
- Confirm no shared component (`KycRolesPicker`, `KycDocsByCategory`, `AiPrefillBanner`, `KycDocRow`) was inadvertently restyled — those should look identical to before B-079

### Acceptance

- All 10 smoke test steps pass
- No console output in production code
- `npm run build` passes
- Both batches committed + pushed
- CHANGES.md has 2 batch entries + a B-079 close-out

---

## CHANGES.md format

After each batch:

```md
### YYYY-MM-DD — B-079 Batch N — <one-line title> (Claude Code)

<2-3 sentence description of what landed and where>

- Bullet detail
- Bullet detail
```

After Batch 2, add a close-out:

```md
### YYYY-MM-DD — B-079 close-out — Admin section bands + compact headers (Claude Code)

End of B-079. `/admin/services/[id]` now reads as a clear two-level color hierarchy: navy `#06629c` bands for top-level steps (Company Setup / Financial / Banking / People & KYC / Documents) with black outer border + tighter padding to match the top stepper, light-blue `#7dbbe3` bands for profile expansions inside People & KYC with matching vertical containment line. Every band has an explicit `Hide ▾` / `Show ▸` affordance. KYC subsection headers and the right-column cards intentionally unchanged — Vanessa wants to revisit subsection styling as a lighter variant in a later pass.
```

---

## What NOT to do

- Do NOT add a third color for KYC subsection headers — they stay as-is
- Do NOT change toggle behavior (collapse/expand, click-to-toggle, chevron rotation already work from B-076/7)
- Do NOT touch the right-column cards (Audit Trail, Workflow Milestones)
- Do NOT touch the stepper at the top of the page
- Do NOT touch the existing Save bar from B-078
- Do NOT migrate or modify any database schema
- Do NOT touch any API route
- Do NOT introduce gradients or shadows on the bands — solid colors only
- Do NOT change the per-profile expanded container's `border-l-4 pl-4` width / padding, only its color
