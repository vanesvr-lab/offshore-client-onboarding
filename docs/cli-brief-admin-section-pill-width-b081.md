# CLI Brief — B-081 Extend Admin Section Pills Width

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-080 (title pills)

---

## Why this batch exists

B-080 wrapped section titles in tight pills. Vanessa wants the pills to be wider — they should extend rightward to wrap more of the row, stopping just before the affordances on the far right.

Single change, single batch.

After this brief: top-level step pills extend through the status text, profile-level pills extend through the Show/Hide toggle. Affordances to the right of those points stay on the row's regular background.

---

## Hard rules

1. **One batch only.** Commit + push + update CHANGES.md when done.
2. **Visual only.** No state, no API, no DB, no behavior changes.
3. Reuse the same HEX codes from B-079/B-080: `#06629c` (top-level), `#7dbbe3` (profile-level).
4. **Out of scope, leave alone:** KYC subsection headers, right-column cards, the stepper, the Save bar, the Documents block header inside profiles, KYC % inline placement (already shipped in B-080), border thinness (already shipped in B-080).
5. `npm run build` must pass.

---

## Change

### Top-level step pill (`#06629c`)

**Today:** pill wraps the section title text only (`Company Setup`, `Financial`, etc.).

**Change to:** pill extends rightward to wrap **everything up to and including the status text** (`● Complete`, `● Not reviewed`, etc.).

What lands inside the pill (left to right):
- Section title
- Progress bar
- Percentage
- Status dot + Complete / Not reviewed text

What stays outside the pill (right side, on regular row background):
- Show / Hide toggle (`▾` / `▸`)
- Approved / Flagged / Not reviewed status pill
- Review button

Affordances inside the pill use white-on-navy variants (mirror what B-079 had: progress bar track `bg-white/20`, percentage + status text `text-white`/`text-white/80`).

### Profile-level pill (`#7dbbe3`)

**Today:** pill wraps the profile name only.

**Change to:** pill extends rightward to wrap **everything up to and including the Show/Hide toggle**.

What lands inside the pill (left to right):
- Profile-type icon (🏢 / 👤)
- Profile name
- Role badge ([Director] / [Shareholder] / [UBO])
- KYC % text (already inline from B-080)
- Show / Hide toggle

What stays outside the pill:
- Review button (right edge, on regular background)

Pill uses dark text on light blue (already established in B-080).

### Pill shape

- Keep `rounded-md` from B-080
- Padding: `px-3 py-1` from B-080 — keep
- Pill is now wider but not full row width — it ends where the spec above says

### Click target

- Full row click toggles open/close (B-076/7 behavior preserved)
- Pill is part of the row, so clicking the pill also toggles
- Review button + any other right-side interactive elements still call `e.stopPropagation()`

---

## Smoke test

1. `/admin/services/[id]` — top-level step rows: navy pill extends through `● Complete`. Show toggle, status pill, Review button sit on regular gray-50 background to the right.
2. Click any top-level row → expands. Pill stays the same shape when expanded.
3. Profile rows inside People & KYC: light-blue pill extends through Show/Hide toggle. Review button sits on regular bg.
4. Click profile row → expands. Pill width unchanged.
5. KYC subsection headers (Identity / Financial / Declarations / Documents) inside profiles — unchanged.
6. `npm run build` passes.

Document smoke test in CHANGES.md.

---

## CHANGES.md format

```md
### YYYY-MM-DD — B-081 — Extend admin section pills width (Claude Code)

Top-level step pills on `/admin/services/[id]` now extend through the status text (`● Complete` / `● Not reviewed`); profile-level pills extend through the Show/Hide toggle. Affordances to the right of those points (Show toggle on top-level, status pill, Review button) stay on the row's regular background.
```
