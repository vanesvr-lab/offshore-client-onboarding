# CLI Brief — B-082 Admin Section Pills Fill Row Up to Right-Side Affordances

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-081 (pill width)

---

## Why this batch exists

After B-081 the top-level pill ended just after the status text, but it pulled `● Complete` inward (between the percentage and the chevron) and left the chevron + Approved/Flagged + Review on regular background to the right.

Vanessa wants:

- The pill to extend **all the way until right before the Approved/Flagged review pill** — so the chevron AND `● Complete` are both inside the pill
- **`● Complete` to sit back on the right side of the row** (right after the Show/Hide chevron, not before it like B-081 placed it)
- The Approved/Flagged review pill + Review button stay on the row's regular background — no change to those

For profile rows: pill extends through the Show/Hide toggle (already specified in B-081 — confirm it's correct after this brief, no re-work if it is).

Single change, single batch. No DB, no API, no behavior changes.

---

## Hard rules

1. **One batch only.** Commit + push + update CHANGES.md when done.
2. **Visual + reorder one element on top-level rows.** No state, no API, no DB, no behavior changes.
3. Reuse existing HEX codes: `#06629c` (top-level), `#7dbbe3` (profile-level).
4. **Out of scope, leave alone:** KYC subsection headers, right-column cards, the stepper, the Save bar, Documents block header inside profiles, KYC % inline placement, border thickness, profile-level pill width (B-081 already extends it through Show/Hide — leave it).
5. **Don't add anything not in this brief.**
6. `npm run build` must pass.

---

## Change

### Top-level step pill (`#06629c`)

**Today (after B-081):**

```
[Company Setup  ████ 100%  ● Complete]  ▾   [Approved]  [Review]
└──────────── pill ────────────────┘  └ outside pill ─────────┘
                                       ↑ chevron, status pill, Review
```

**Change to:**

```
[Company Setup  ████ 100%  Show ▾  ● Complete]   [Approved]  [Review]
└────────────────── pill ─────────────────────┘   └ outside pill ─┘
                                                   ↑ Approved/Flagged + Review only
```

What lands inside the pill (left to right, in this order):
1. Section title
2. Progress bar
3. Percentage
4. Show / Hide toggle (chevron + `Show ▾` / `Hide ▸` text)
5. `● Complete` / `● Not reviewed` status (dot + text)

What stays **outside** the pill on the right (regular row background):
- Approved / Flagged / Not reviewed review pill
- Review button

### Element ordering — reorder needed

Currently (after B-081), the order inside the row is:
```
title → progress → % → ● Complete → chevron → Approved/Flagged → Review
```

Change to:
```
title → progress → % → Show ▾ chevron → ● Complete → | → Approved/Flagged → Review
                                                     ↑ pill ends here
```

Move `● Complete` from its current position (between % and chevron) to be **after** the chevron / Show ▾ toggle.

### Affordance styling on the wider pill

All affordances inside the pill use white-on-navy variants:
- Progress bar track: `bg-white/20`, fill: keeps existing colors (green / amber / red)
- Percentage: `text-white`
- Show / Hide text + chevron: `text-white` / `text-white/80`
- Status dot: keep its existing color (green / amber / red); status text: `text-white`

### Profile-level pill (`#7dbbe3`)

**No change in this brief.** B-081 already extended it through the Show/Hide toggle, with Review button outside. If during smoke test you confirm it matches that spec, leave it. If somehow it landed differently, fix it to match: pill wraps icon + name + role badge + KYC % + Show/Hide toggle; Review button stays outside on regular bg.

### Pill shape

- Keep `rounded-md` from B-080
- Keep `px-3 py-1` padding
- Pill is now wider — extends to the natural break before the Approved/Flagged pill

### Click target

- Full row click toggles open/close (B-076/7 behavior preserved)
- Review button still calls `e.stopPropagation()`

---

## Smoke test

1. `/admin/services/[id]` — top-level rows: navy pill wraps title, progress, %, Show ▾ chevron, and `● Complete` status. Approved/Flagged pill + Review button on regular bg to the right of the pill.
2. Order of elements inside the pill is: title → progress → % → Show ▾ → ● Complete (not the B-081 order which had ● Complete before the chevron).
3. Click any top-level row → expands. Pill width unchanged when expanded; chevron rotates from ▾ to ▸ (or whatever the existing rotation is); label flips Show / Hide.
4. White text + adjusted variants render legibly on navy.
5. Profile rows inside People & KYC: pill matches B-081 spec (wraps icon + name + role + KYC % + Show/Hide; Review outside). No re-work needed if it already matches.
6. KYC subsections inside profiles: unchanged.
7. `npm run build` passes.

Document smoke test in CHANGES.md.

---

## CHANGES.md format

```md
### YYYY-MM-DD — B-082 — Extend top-level pill to right-side affordances + reorder Complete (Claude Code)

Top-level step pills on `/admin/services/[id]` now extend through the Show/Hide chevron and `● Complete` status, ending right before the Approved/Flagged review pill. `● Complete` moved from between the percentage and the chevron (B-081) to after the chevron, restoring its pre-B-081 right-side position. Approved/Flagged pill + Review button stay on the row's regular background. Profile pills unchanged.
```
