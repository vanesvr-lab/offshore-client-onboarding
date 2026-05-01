# B-048 — Client wizard layout polish (comprehensive)

**Goal:** Make every client-facing form feel centered, focused, and scannable. Fix the systemic layout issues B-047 didn't catch: containers too wide, fields edge-pinned, role chips reading as badges instead of buttons. Comprehensive sweep across every client wizard page so the user doesn't have to come back screen-by-screen.

**Why this brief exists:** B-047 applied form patterns inside components but didn't constrain the page **container** width. Result: even with content-aware field widths, the overall layout still spreads edge-to-edge on desktop, drifting content into peripheral vision (`container-width` violation, ui-ux-pro-max §5).

**Out of scope:** Admin-side UI. Don't touch admin layouts unless gating shared components by `viewer: 'client' | 'admin'` so admin behavior is preserved.

**Important:** Run `git pull origin main` first. This brief depends on B-046 and B-047 being merged.

---

## Reference — what to satisfy throughout

Apply `ui-ux-pro-max` rules:

- §5 `container-width` — consistent max-width on desktop; forms sit in narrower containers than data pages
- §5 `mobile-first` — every change must work at 375px width without horizontal scroll
- §5 `visual-hierarchy` — establish hierarchy via size + spacing, not color alone
- §6 `whitespace-balance` — group related items by proximity, not by edge-pinning
- §4 `state-clarity` — interactive states must be visually distinct
- §4 `primary-action` — one primary CTA per screen
- §1 `focus-states` — visible focus rings on every interactive element

---

## Batch 1 — Container max-width pass (global)

The single highest-impact fix. Apply a centered, narrower container to every client wizard page.

### 1.1 — Container token

Standardize on **`max-w-2xl` (672px)** centered for form-heavy wizards. Add as the page-level wrapper inside the wizard layout:

```tsx
<main className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-8">
  {children}
</main>
```

- Mobile: `px-4` (16px gutters)
- Tablet+: `px-6` (24px gutters)
- Mobile collapses naturally (max-w-2xl is 672px → won't trigger until ≥768px viewport)

### 1.2 — Where to apply

Find the layout / wrapper for each of these and apply the container:

- **Outer application wizard** — `WizardLayout.tsx` and any wrapper used by `/apply/[templateId]/details`, `/documents`, `/review`, etc.
- **Per-person KYC wizard** — wherever `KycStepWizard.tsx` is mounted (likely `PersonsManager.tsx` or a dedicated route)
- **Application detail / status page** — `/applications/[id]`
- **Service detail client page** — `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx`

If the existing wrapper is `max-w-7xl` or `max-w-6xl`, replace with `max-w-2xl`. Don't touch the dashboard or any data-heavy page.

### 1.3 — Sticky elements stay full-width

The top nav bar, sidebar, and any sticky footer keep their existing full-width layout. Only the **content column** narrows.

### 1.4 — Verify

- Open every client wizard step at 1440px desktop — content should sit centered with comfortable left/right margins.
- Open at 768px tablet — content fills width with `px-6` gutters.
- Open at 375px mobile — content fills width with `px-4` gutters, no horizontal scroll.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 2 — Role chips redesign (rectangular, lighter, clearer affordance)

**File:** the role-chip component on the Review-KYC top row (created in B-046, restyled in B-047). Likely inside `KycStepWizard.tsx` or a sub-component.

### 2.1 — Visual specs

Replace the current pill-style chip with a rectangular toggle button:

```
Inactive (role NOT attached):
┌─────────────────┐
│  ☐  UBO         │   bg-white border border-gray-300 text-gray-700
└─────────────────┘   hover: bg-gray-50

Active (role IS attached):
┌─────────────────┐
│  ☑  Director    │   bg-blue-50 border border-blue-200 text-blue-700
└─────────────────┘   hover: bg-blue-100
```

### 2.2 — Tailwind tokens

- **Shape:** `rounded-md` (6px) — rectangular, NOT `rounded-full`
- **Height:** `h-10` (40px) with hit-slop padding to meet ≥44pt touch
- **Padding:** `px-3 py-2`
- **Font:** `text-sm font-medium`
- **Border:** always 1px present (active or inactive — this is the key affordance signal)
- **Active fills (lighten the existing palette):**
  - Director: `bg-blue-50 border-blue-200 text-blue-700`
  - Shareholder: `bg-purple-50 border-purple-200 text-purple-700`
  - UBO: `bg-amber-50 border-amber-200 text-amber-700`
- **Inactive (any role):** `bg-white border-gray-300 text-gray-700`
- **Cursor:** `cursor-pointer`
- **Focus ring:** `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500`
- **Checkbox glyph:** Lucide `<CheckSquare />` for active, `<Square />` for inactive — `h-4 w-4 mr-2`

### 2.3 — Keep existing behavior

- `aria-pressed` reflects active state
- `aria-label="Toggle Director role"` / Shareholder / UBO
- Click toggles role attachment (B-046 logic untouched)
- UBO chip hidden when `record_type !== 'individual'` (B-046 rule)
- Last-role removal confirm dialog (B-046)
- Optimistic update + rollback on failure (B-046)

### 2.4 — Don't drop the multicolor palette

Director / Shareholder / UBO retain their distinct hues (just lightened). Per-role color is informationally useful for fast scanning. Don't unify them into shades of blue.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 3 — Stretch-row + name-roles layout

Audit every wizard page for `justify-between` rows that create edge-to-edge gaps. Two known offenders, plus a sweep:

### 3.1 — "Bruce Banner …………… Roles: [chips]" row

In the Review-KYC top row, **stack roles under the name** instead of pinning them right:

```
Bruce Banner
Roles:  [☑ Director]  [☑ Shareholder]  [☐ UBO]
```

- Use `flex flex-col gap-2` on the wrapper (drop `justify-between`)
- "Roles:" prefix label: `text-sm font-medium text-gray-600`, vertically aligned with chips
- Chip group: `flex items-center gap-2`
- 8px gap between chips (`gap-2`)

### 3.2 — "Reviewing person 1 of 4 — Bruce Banner …………… 3 remaining" banner

Combine into a single tight line:

```
Reviewing person 1 of 4 — Bruce Banner  ·  3 remaining
```

- `flex items-center gap-3`
- Middot `·` separator (`<span className="text-gray-400">·</span>`)
- All left-aligned inside the container

### 3.3 — Audit pass

Search the codebase for `justify-between` in client wizard / form components. For each match, ask: *does this create a wide visual gap on desktop now that the container is `max-w-2xl`?*

- If the gap is small (≤80px after Batch 1 narrows the container): keep it.
- If the gap is large or the right-pinned content is informational (counters, "X remaining", chip groups, etc.): convert to `gap-N` flex with content kept close together.

Likely candidates to check:
- `KycStepWizard.tsx` header rows
- `PersonsManager.tsx` person card header
- `ServiceWizardNav.tsx` step indicator
- Any "Step X of Y" labels paired with section titles
- Bottom-of-card metadata rows ("Last request sent on …" etc.)

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 4 — Field-width audit across every wizard page

Now that the container is narrow, walk every client wizard page and verify field widths. The B-047 system should already be in place; this batch verifies it took effect on every page.

### 4.1 — Field-width reference

Copied from B-047 §1.1 for ease — all values are caps inside the container:

| Content | Tailwind | px |
|---|---|---|
| Postal / zip | `w-24` | 96 |
| Phone | `w-48` | 192 |
| Date | `w-40` | 160 |
| Currency | `w-32` | 128 |
| Country / state dropdown | `w-52` to `w-60` | 208–240 |
| City | `w-64` | 256 |
| Tax ID / passport | `w-56` | 224 |
| **Email / regular text** | `w-full max-w-md` | up to **448** |
| Full name | `w-full max-w-md` | up to **448** |
| Address line 1 | `w-full` | container width |
| Long-form (notes, business activity) | `w-full min-h-[120px]` | container width |
| Country **multi-select** | `w-full max-w-md` | up to **448** |

### 4.2 — Pages to audit

Go page-by-page, fix anything off:

**Outer application wizard:**
- `/apply/[templateId]/details` (Company Setup) — known offenders:
  - "Proposed company names (3 options)" — three inputs stacked vertically, each `w-full max-w-md`
  - "Brief description of the proposed business activity" — textarea `w-full min-h-[120px]` (full container width is fine)
  - "Countries of operations" — multi-select `w-full max-w-md`
- `/apply/[templateId]/documents` — verify upload tiles don't go edge-to-edge inside narrowed container
- `/apply/[templateId]/review` — verify summary blocks aren't stretched

**Per-person KYC wizard sub-steps (B-046):**
- Identity docs — single block, fine; verify "Upload" buttons are right-aligned within the doc row, not pinned to far edge
- Financial docs — same
- Compliance docs — same
- Contact details — Email + Phone:
  ```tsx
  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_192px] gap-4">
    <FormField label="Email"><Input type="email" /></FormField>
    <FormField label="Phone"><Input type="tel" className="w-48" /></FormField>
  </div>
  ```
  Email expands to fill, Phone stays 192px.
- Identity form (`IdentityStep.tsx`) — verify each field per the table:
  - Full name `w-full max-w-md`
  - DOB `w-40`
  - Nationality dropdown `w-60`
  - Passport number `w-56`
  - Address line 1 `w-full`
  - City `w-64`, State `w-52`, Postal `w-24` in a row
- Financial form — verify amount fields are `w-32`, currency dropdown `w-32`, etc.
- Declarations (`DeclarationsStep.tsx`) — Tax ID `w-56`, Yes/No pills already correct from B-047
- Review step — read-only, just verify spacing

### 4.3 — Document each fix in CHANGES.md

For each page, note in CHANGES.md what was changed. This makes it easy to spot-check the audit was thorough.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 5 — Login / Register / Dashboard CTA polish

Apply the same container + spacing rules to the entry points.

### 5.1 — Login (`/login`) and Register (`/register`)

- Container: `max-w-sm` (384px) centered — these are tightly focused single-purpose forms
- All inputs `w-full` inside the narrow container
- Single primary "Sign in" / "Create account" button, full-width inside the container, `h-11` (44pt)
- Tertiary link below: "Already have an account?" / "Forgot password?" in `text-gray-600`
- Required asterisks per B-047 patterns
- `autocomplete=` attributes per B-047 (`email`, `current-password`, `new-password`)

### 5.2 — Dashboard (`/dashboard`)

- Container stays wider for the application list (`max-w-4xl`) — it's not a form
- The welcome message + "Review" CTA introduced in B-046 should sit naturally inside the container
- Verify "Review" button is `h-10` to `h-11`, brand-navy primary, NOT pinned to far right of its row — should be visually grouped with the application card it acts on

### 5.3 — Application detail page (`/applications/[id]`)

- Status panel + timeline area: `max-w-3xl` is fine (mixed content, not pure form)
- Action buttons (resume, withdraw, etc.) should be grouped, not edge-pinned

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 6 — Pre-delivery verification

### 6.1 — Visual checklist

Open each page in the browser at three widths (375 / 768 / 1440) and verify:

- [ ] Content sits in a narrow centered column on desktop, not stretched edge-to-edge
- [ ] No horizontal scroll at 375px
- [ ] No edge-pinned `justify-between` rows creating large gaps
- [ ] Role chips on Review-KYC: rectangular, lighter palette, clear active/inactive states, "Roles:" prefix
- [ ] Bruce-name row stacks roles below name, no big horizontal gap
- [ ] "Reviewing person … remaining" banner reads as a single tight line with middot separator
- [ ] Field widths match content (phone 192px, postal 96px, email up to 448px)
- [ ] Long inputs (Proposed company names, Brief description) sit at `max-w-md` for text or `w-full` only for textareas
- [ ] All buttons ≥44pt tall, focus rings visible
- [ ] One primary CTA per screen
- [ ] Login / Register: `max-w-sm`, single primary button
- [ ] Dashboard "Review" CTA visually grouped with its application card

### 6.2 — Build

`npm run build` — must pass clean (lint + type check, no warnings).

### 6.3 — Wrap up

- Update CHANGES.md with a dated section per batch.
- Final commit + push.
- Hand back: one line — done / blocked / question.

---

## Open notes

- **Don't touch admin UI.** If you must modify a shared layout component, gate behavior by `viewer: 'client' | 'admin'` and keep admin defaults unchanged.
- **Reuse existing tokens.** brand-navy, role-color palette (just lightened to `-50` / `-200` / `-700` shades), gray scale.
- **No new features.** Layout polish only. If you spot a missing feature, log it as a tech-debt entry in CHANGES.md.
- **Don't introduce `any`.** Use `unknown` + cast if needed.
- **Mobile-first verification is required**, not optional. 375px must work without horizontal scroll on every page.
- **Reduced-motion respected.** Don't introduce new transitions without checking `prefers-reduced-motion`.
- **Take screenshots before/after for the audit batches** (4 and 6) and reference them in CHANGES.md so the diff is reviewable.
