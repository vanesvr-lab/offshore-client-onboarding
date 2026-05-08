# CLI Brief — B-083 Admin Section Pills: Full Width + Justify-Between Layout

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-082 (pill content-width)

---

## Why this batch exists

Vanessa wants the section pill to behave like a full-width band again (B-079 era layout) but with three differences:

1. The pill ends **right before the right-side affordances** (Approved/Flagged pill + Review button on top-level; Review button on profile-level), not edge-to-edge
2. **Layout inside the pill is `justify-between`:** section title on the left, all status affordances clustered on the right
3. **Order in the right cluster:** progress → percentage → `● Complete` → Show/Hide (Complete sits *before* Show/Hide — opposite of what B-082 landed)

After B-082 the pill collapsed to content-width with everything packed tightly. That's not what Vanessa wants. The pill should fill the available width, push the title to the left edge and the controls to the right edge, with empty navy space between them.

Single change, single batch. No DB, no API, no behavior changes.

---

## Hard rules

1. **One batch only.** Commit + push + update CHANGES.md when done.
2. **Visual + reorder Complete on top-level rows.** No state, no API, no DB, no behavior changes.
3. Reuse existing HEX codes: `#06629c` (top-level), `#7dbbe3` (profile-level).
4. **Out of scope, leave alone:** KYC subsection headers, right-column cards, the stepper, the Save bar, Documents block header inside profiles, KYC % inline placement, border thickness.
5. **Don't add anything not in this brief.**
6. `npm run build` must pass.

---

## Change

### Top-level step pill (`#06629c`)

**Today (after B-082):**
```
[Company Setup ████ 100% Show ▾ ● Complete]    [Approved]  [Review]
└──── content-width pill, packed tight ─┘
```

**Change to:**
```
┌── pill ──────────────────────────────────────────────────┐
│ Company Setup            ████ 100% ● Complete Show ▾    │   [Approved]  [Review]
└──────────────────────────────────────────────────────────┘   └─ outside pill on regular bg ─┘
   ↑ left-aligned          ↑ right cluster (right-aligned)
   ↑ big empty navy space between them — flex justify-between
```

**Pill width:** extends from the left edge of the card to a point right before the Approved/Flagged review pill. The right edge of the pill sits with a small gap (e.g. `mr-3` or whatever spacing already exists between sections of the row) before the right-side affordances start.

**Inside the pill — flex justify-between:**

- Left side (left-aligned):
  - Section title (`Company Setup` / `Financial` / etc.)
- Right side (right-aligned, all clustered together with `gap-2` or similar):
  - Progress bar
  - Percentage (`100%`)
  - `● Complete` / `● Not reviewed` (status dot + text)
  - Show / Hide toggle (chevron + `Show ▾` / `Hide ▸` text)

**Order inside the right cluster (left to right):**
```
progress bar  →  100%  →  ● Complete  →  Show ▾
```

This is a swap from B-082, which had Show ▾ → ● Complete. Now Complete sits *before* Show ▾.

**What stays outside the pill on the right (regular row background):**
- Approved / Flagged / Not reviewed review pill
- Review button

### Profile-level pill (`#7dbbe3`)

**Today (after B-082):** profile pill wraps icon + name + role + KYC % + Show/Hide, content-width.

**Change to:**
```
┌── pill ──────────────────────────────────────────────────┐
│ 🏢 Elarix LLC [Director]  KYC: 0%       Show ▾          │   [Review]
└──────────────────────────────────────────────────────────┘   └ outside pill ─┘
   ↑ left-aligned                          ↑ Show/Hide right-aligned
```

**Pill width:** extends from left edge of the card to right before the Review button.

**Inside the pill — flex justify-between:**

- Left side (left-aligned, all clustered with normal spacing):
  - Profile-type icon (🏢 / 👤)
  - Profile name
  - Role badge ([Director] / [Shareholder] / [UBO])
  - `KYC: <pct>%` text
- Right side (right-aligned):
  - Show / Hide toggle (chevron + `Show ▾` / `Hide ▸` text)

**Outside the pill:** Review button on regular row background.

### Affordance styling on the wider pill

All affordances inside the pill use white-on-navy / dark-on-light variants (B-079 patterns):

**Top-level (navy):**
- Progress bar track: `bg-white/20`, fill: keeps existing colors
- Percentage: `text-white`
- Status dot: keep existing color; status text: `text-white` or `text-white/90`
- Show / Hide text + chevron: `text-white` / `text-white/80`

**Profile-level (light blue):**
- Title text: `text-gray-900` or `text-brand-navy`
- Role badge: keep current styling, just verify it reads on light blue
- KYC % text: keep current color logic (red at 0%, amber, green at 100%)
- Show / Hide text + chevron: dark (`text-gray-900` or similar)

### Pill shape

- Keep `rounded-md` from B-080
- Keep `px-3 py-1` padding (or whatever vertical padding already in use)
- Pill is a flex container with `justify-between` and `items-center`

### Click target

- Full row click (or full pill click) toggles open/close (B-076/7 behavior preserved)
- Review button + any outside-pill interactive elements still call `e.stopPropagation()`

---

## Smoke test

1. `/admin/services/[id]` — top-level rows: navy pill spans from left edge to right before Approved/Flagged. Title sits at the left edge of the pill; progress + 100% + ● Complete + Show ▾ cluster at the right edge of the pill. Empty navy space between.
2. Order in the right cluster (top-level): progress → 100% → ● Complete → Show ▾.
3. Approved/Flagged + Review buttons on regular gray-50 / white background, outside the pill, on the right edge of the card.
4. Click any top-level row → expands. Pill width unchanged when expanded; chevron rotates and Show / Hide label flips.
5. Profile rows inside People & KYC: light-blue pill spans from left edge to right before Review button. Icon + name + role + KYC % cluster on the left; Show / Hide on the right of the pill. Empty light-blue space between.
6. Profile-row Review button on regular bg, outside the pill, on the right edge.
7. KYC subsections inside profiles unchanged.
8. `npm run build` passes.

Document smoke test in CHANGES.md.

---

## CHANGES.md format

```md
### YYYY-MM-DD — B-083 — Section pills full-width with justify-between layout (Claude Code)

Top-level + profile-level pills on `/admin/services/[id]` now span the full row width up to the right-side affordances (Approved/Flagged + Review on top-level; Review on profile). Inside, flex `justify-between` pushes the title to the left edge and the controls cluster to the right edge with empty space between. Top-level right-cluster order: progress → 100% → ● Complete → Show ▾ (swapped Complete back before Show from B-082).
```
