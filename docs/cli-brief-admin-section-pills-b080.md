# CLI Brief — B-080 Admin Section Pills + KYC % Inline + Thinner Border

**Status:** Ready for CLI
**Estimated batches:** 2
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-079 (color bands + compact headers)

---

## Why this batch exists

B-079 made the admin services page section headers solid full-width colored bands. After review, Vanessa wants a lighter visual treatment:

- The full-width navy / light-blue bands feel too heavy and dominate the page
- The colored band should wrap **only the section title text**, like a pill, with the rest of the row reverting to its pre-B-079 background
- On profile rows, `KYC: 0%` should move up to sit on the same line as the profile name (currently on a second line, wastes vertical space)
- The black outer border around top-level step containers came in too thick in B-079 — drop it to match the standard 1px card border used elsewhere on the page

Pure visual pass. No DB, no API, no behavior changes.

After this brief: each section header has a tight color pill around just the title, the rest of the row reads as a normal gray-50 / white card row, profile names + KYC % share one line, and outer borders match the rest of the page's stroke weight.

---

## Hard rules

1. Complete both batches autonomously. Commit + push + update CHANGES.md after each batch. Don't stop unless blocked.
2. **Strictly visual + one layout move (KYC % inline).** No state changes, no API changes, no DB changes, no behavior changes.
3. **Preserve B-076/7 toggle behavior:** full-row click target still expands/collapses the section. Pill is part of the row, so clicking the pill also toggles. Review button still stops propagation.
4. **Reuse the same two HEX codes from B-079:** `#06629c` (top-level), `#7dbbe3` (profile-level). If B-079 registered them as named Tailwind colors, reuse those names.
5. **Out of scope, leave alone:**
   - KYC subsection headers (Identity / Financial / Declarations / Documents) inside the per-profile expanded view — still gray-50, no pill
   - Right-column cards (Audit Trail, Workflow Milestones, etc.)
   - The stepper at the top of the page
   - The Save bar from B-078
   - The Documents block (B-077/2) header inside the per-profile container — its current treatment after B-079 stays
   - Pre-B-079 profile-row body content layout (Portal access / Request KYC buttons, contact info, etc.) — only the *header* line changes
6. `npm run build` must pass before declaring any batch done.

---

## Files in scope

- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — top-level step section headers, per-profile expanded container header

Possibly:
- Any KYC profile row component if it lives in a separate file (check `src/components/kyc/` or wherever the per-profile header is rendered — most likely it's still inline in `ServiceDetailClient.tsx`)

NOT in scope:
- `src/components/kyc/*` — leave alone
- Tailwind config — only update if B-079 registered named colors and you need to add a `rounded-md` variant or similar (almost certainly not needed)

---

## Batch 1 — Restyle to pills + KYC % inline + thinner border

### 1a — Top-level step pill (`#06629c`)

**Today (after B-079):** the entire row is `bg-[#06629c]` with white text and adjusted-for-navy variants on the progress bar, status pill, Review button, etc.

**Change to:**

- Row background reverts to its **pre-B-079 styling** — `bg-gray-50 hover:bg-gray-100` (or whatever the original was — check git for the B-076/7 era styling). All affordances revert with it: progress bar back to `bg-gray-200` track, status pill back to its original light styling, "Show ▾" / "Hide ▾" text back to gray, Review button back to its original outline.
- Wrap **only the section title text** in a pill:
  ```tsx
  <span className="inline-flex items-center px-3 py-1 rounded-md bg-[#06629c] text-white text-sm font-medium">
    {section.title}
  </span>
  ```
  - Background: `#06629c`
  - Text: white
  - Padding: `px-3 py-1` (text breathes inside the pill but doesn't feel oversized)
  - Corners: `rounded-md` (subtle, not full-pill)
  - Font weight: keep current title weight
- The status dot (●) that lives next to the title — keep it OUTSIDE the pill, to the left of the pill, on the row's regular background
- "Not reviewed" / "Reviewed" status pills, progress bar, percentage, "Show ▾" / "Hide ▾" affordance, Review button — all stay on the row's regular background, NOT inside the pill
- Click target stays the entire row (existing B-076/7 behavior)

### 1b — Profile-level pill (`#7dbbe3`)

**Today (after B-079):** the entire profile header row is `bg-[#7dbbe3]` with dark text.

**Change to:**

- Row background reverts to its **pre-B-079 styling** — most likely `bg-gray-50` or white with a `border` separator. Check git for the B-076/B-077 era styling.
- Wrap **only the profile name text** in a pill:
  ```tsx
  <span className="inline-flex items-center px-3 py-1 rounded-md bg-[#7dbbe3] text-gray-900 text-sm font-medium">
    {profile.full_name}
  </span>
  ```
  - Background: `#7dbbe3`
  - Text: dark (`text-gray-900` or `text-brand-navy`)
  - Padding: `px-3 py-1`
  - Corners: `rounded-md`
- Profile-type icon (🏢 building / 👤 person) → keep OUTSIDE the pill, to the left
- `[Director]` / `[Shareholder]` / `[UBO]` role badges → keep OUTSIDE the pill, to the right of it
- Vertical containment line per profile (B-076/6 + B-077/1): currently `border-l-4 border-[#7dbbe3]` from B-079. **Keep it as `#7dbbe3`** — visually ties the profile pill at the top to the line running down the side of the expanded content.

### 1c — Move `KYC: %` to the profile name line

**Today:** layout is

```
🏢 Profile Name [Director]                              Show ▾
KYC: 0%
[Portal access] [Request KYC]
```

**Change to:**

```
🏢 [Profile Name] [Director]   KYC: 0%                  Show ▾
[Portal access] [Request KYC]
```

- The `KYC: <pct>%` text moves from its own line to inline on the same line as the profile name, after the role badge(s), with a left margin (e.g. `ml-3`) for breathing room
- Color: keep current red-ish color (`text-red-500` or whatever it is today) — visual cue that 0% needs attention. If KYC is 100%, switch to a green/success color. If between 0 and 100, amber. (Use the same logic the existing progress dot already uses elsewhere on the page if there's a helper; otherwise keep it red.)
- Font size: `text-xs` so it doesn't compete visually with the profile name pill
- Right side of the row keeps `Show ▾` / `Hide ▾` toggle; if there's a Review button or other right-aligned affordance for the profile-level row, keep it as-is
- The original second line (with KYC %) is removed entirely — the row becomes one tighter line for header info, then the body underneath (Portal access / Request KYC buttons) stays on its own line as before

### 1d — Thinner border on top-level step containers

**Today (after B-079):** outer border on top-level step containers is `border-gray-900` with whatever thickness B-079 applied (likely `border-2` or thicker).

**Change to:** `border` (1px, Tailwind default) — keep the dark color, just drop the thickness to match standard card borders elsewhere on the page (e.g. compare to the Admin Actions / Substance Review card visible in Vanessa's screenshot — same thickness).

If B-079 used `border-gray-900`, keep that color. If pure black `border-black` was used, keep that.

### Acceptance

- Top-level step rows: row background back to gray-50, only section title is in a navy pill (`px-3 py-1`, `rounded-md`, white text)
- Top-level step container border: 1px, dark color (matches the standard card stroke seen in Admin Actions and elsewhere)
- Profile rows: row background back to its pre-B-079 styling, only profile name is in a light-blue pill (same shape, dark text)
- Profile vertical line on the left: still `#7dbbe3`
- `KYC: <pct>%` is on the same line as the profile name + role badge (after the role badge), no longer on a separate line below
- Status dots, progress bars, status pills ("Not reviewed" / "Approved" / "Flagged"), Show / Hide toggle, Review button — all back to their pre-B-079 light-background styling
- Toggle behavior unchanged: full-row click expands/collapses, Review button still stops propagation
- KYC subsection headers inside profiles unchanged
- Documents block header inside profiles unchanged
- `npm run build` passes

---

## Batch 2 — Smoke test + cleanup

### Smoke test (manual)

Walk through `/admin/services/[id]` for a service with at least one profile that has both completed and incomplete sections:

1. Top-level steps: each renders with a gray-50 row background, only the section title sits inside a small navy pill (`#06629c`, white text, subtle rounded corners)
2. Top-level step container outer border is thin (~1px) and dark — visually matches the Admin Actions card border
3. Status dots, progress bars, status pills, Show / Hide toggles, Review buttons all read normally on the gray-50 row (no white-on-navy artifacts)
4. Click any top-level step row → still expands/collapses (B-076/7 behavior preserved)
5. Expand People & KYC → profile rows render with light-blue pill (`#7dbbe3`) around just the profile name, dark text, subtle rounded corners
6. Profile name + role badge + `KYC: <pct>%` all sit on the same line; no orphaned KYC line below
7. KYC % color reflects status (red at 0%, green at 100%, amber in between — or whatever logic was decided)
8. Profile-row body buttons (Portal access / Request KYC, contact info, etc.) sit underneath on their own line as before
9. Vertical containment line on the left of each profile is still `#7dbbe3`, ties pill to expanded content
10. KYC subsections inside profiles (Identity / Financial / Declarations / Documents) — still gray-50 headers, unchanged
11. Documents block header inside profiles — unchanged from B-079
12. Save bar from B-078 still appears at the bottom when fields are dirty, no visual collision

Document smoke test result in CHANGES.md (pass/fail per step). If any step fails, fix before commit.

### Cleanup

- Remove any leftover `console.log` or commented-out experiments from Batch 1
- Confirm no shared component (`KycRolesPicker`, `KycDocsByCategory`, `AiPrefillBanner`, `KycDocRow`) was inadvertently restyled
- If you added new utility classes inline (`bg-[#06629c]`, etc.) in multiple places, consider extracting a small `<SectionTitlePill />` and `<ProfileNamePill />` component if it improves readability — but only if the pill is rendered in 2+ places. Don't over-abstract for a single use.

### Acceptance

- All 12 smoke test steps pass
- No console output in production code
- `npm run build` passes
- Both batches committed + pushed
- CHANGES.md has 2 batch entries + a B-080 close-out

---

## CHANGES.md format

After each batch:

```md
### YYYY-MM-DD — B-080 Batch N — <one-line title> (Claude Code)

<2-3 sentence description of what landed and where>

- Bullet detail
- Bullet detail
```

After Batch 2, add a close-out:

```md
### YYYY-MM-DD — B-080 close-out — Admin section pills + KYC % inline + thinner border (Claude Code)

End of B-080. `/admin/services/[id]` section headers downgraded from full-width colored bands (B-079) to tight pills around just the title text — `#06629c` for top-level steps, `#7dbbe3` for profile rows, both `rounded-md` with `px-3 py-1`. The rest of each row reverts to its pre-B-079 gray-50 styling, restoring legibility for status pills, progress bars, and Review buttons. Profile rows now show `KYC: <pct>%` inline next to the profile name + role badge instead of on its own line. Top-level step container borders thinned from B-079's heavy stroke to standard `border` (1px) to match the rest of the page.
```

---

## What NOT to do

- Do NOT keep the full-width band — pill only
- Do NOT change toggle behavior (collapse/expand still works from B-076/7)
- Do NOT touch the right-column cards
- Do NOT touch the stepper at the top of the page
- Do NOT touch the Save bar from B-078
- Do NOT touch KYC subsection headers (Identity / Financial / Declarations / Documents) inside profiles
- Do NOT touch the Documents block header inside profiles
- Do NOT migrate or modify any database schema
- Do NOT touch any API route
- Do NOT introduce gradients, shadows, or borders on the pills — solid color, rounded corners only
