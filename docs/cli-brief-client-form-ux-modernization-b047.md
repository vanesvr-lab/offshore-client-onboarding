# B-047 — Client form UX modernization (ui-ux-pro-max pass)

**Goal:** Apply `ui-ux-pro-max` design rules across every client-facing form in the portal so they meet modern UX standards. Lands two specific design decisions agreed in the design review:
1. Yes/No declaration answers move directly under the question (no edge-to-edge gap).
2. Role chips on the Review-KYC top row become labeled checkbox-style toggles ("Roles: ☑ Director ☑ Shareholder ☐ UBO") for clearer affordance.

**Out of scope:** Admin-side forms. Don't touch admin UI unless a shared component is being modified — gate behind a `viewer: 'client' | 'admin'` prop so admin behavior is unchanged.

**Important:** Run `git pull origin main` first. This brief depends on B-046 being merged (sub-step wizard, role chips, centered button group, contact-details slim row already in place).

---

## Reference — ui-ux-pro-max rules every batch must satisfy

Use these as the acceptance bar throughout. Tags map to the skill's Quick Reference categories:

| Category | Rules |
|---|---|
| §1 Accessibility | `color-contrast` 4.5:1, `focus-states` 2–4px visible ring, `aria-labels`, `keyboard-nav`, `form-labels` (label `for=`), `color-not-only` |
| §2 Touch | `touch-target-size` ≥44pt, `touch-spacing` ≥8px between targets |
| §6 Typography | Top-aligned labels, base 16px body, line-height 1.5, semantic color tokens (no raw hex) |
| §8 Forms | `input-labels` (visible, not placeholder-only), `error-placement` below field, `inline-validation` on blur, `required-indicators`, `progressive-disclosure`, `success-feedback`, `field-grouping`, `disabled-states` reduced opacity, `error-clarity` (cause + fix), `focus-management` (auto-focus first invalid), `aria-live-errors`, `input-type-keyboard` |
| Layout | `whitespace-balance` (proximity = grouping), no card-on-card nesting, 4/8 px spacing rhythm |

---

## Batch 1 — Form design system foundations

Establish the patterns every later batch reuses. **No visual changes go live in this batch alone** — it's a token / utility / shared-component pass.

### 1.1 — Field-width system

Replace "every input is full width" with content-aware widths. Add as a shared module — either Tailwind utility classes documented in a comment, or a small `formWidths` object exported from `src/lib/form-widths.ts`:

| Content | Tailwind | px |
|---|---|---|
| Postal / zip | `w-24` | 96 |
| Phone | `w-48` | 192 |
| Date (single) | `w-40` | 160 |
| Country dropdown | `w-60` | 240 |
| State / region | `w-52` | 208 |
| City | `w-64` | 256 |
| Currency amount | `w-32` | 128 |
| Tax ID / passport number | `w-56` | 224 |
| Email | `w-80` | 320 |
| Full name | `w-80` | 320 |
| Address line 1 | full width | — |
| Long-form (notes, business activity) | full width, `min-h-[120px]` | — |

Two-column rows use:
```tsx
<div className="grid grid-cols-1 md:grid-cols-[1fr_192px] gap-4">
  <Email />
  <Phone />
</div>
```
Mobile collapses to single column (mobile-first, §5).

### 1.2 — Label + helper-text component

Make sure there's one shared `<FormField>` wrapper used by every form. Pattern:

```
[Label]*               <- 14px, font-medium, text-gray-900, mb-1.5; * red-600
[input]                <- 44pt min height, focus ring 2px brand-navy
[helper or error]      <- 12px, mt-1; helper = text-gray-600, error = text-red-600
```

- No placeholder-as-label.
- Required marker: red `*` after label, no leading space, `aria-required="true"` on input.
- Helper text: optional `helperText?: string` prop, persistent (not just on focus).
- Error text replaces helper when present, with `role="alert"` and `aria-live="polite"`.

If a `<FormField>` doesn't exist yet, create one in `src/components/shared/FormField.tsx` and migrate as you go. If one exists but is incomplete, extend it.

### 1.3 — Section grouping (kill card-on-card)

Replace bordered Card containers wrapping single sections (Contact Details, Declarations, etc.) with:

```
<section className="space-y-4">
  <h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase">
    Contact Details
  </h3>
  <div className="grid grid-cols-1 md:grid-cols-[1fr_192px] gap-4">
    {fields...}
  </div>
</section>
```

Vertical rhythm:
- Heading → first input: 16px
- Input → input (same group): 16px
- Group → group (same section): 24px
- Section → section: 48px

The wizard shell card is the **only** outer card — no nested ones inside it.

### 1.4 — Validation utilities

Add (or reuse) one small set of validators in `src/lib/validation.ts`:

- `isEmail`, `isPhone`, `isRequired`, `isMinLength`, `isMaxLength`, `isISODate`
- Each returns `{ valid: true } | { valid: false, message: string }` with messages following `error-clarity`: state cause + how to fix. e.g. "Enter a valid email like name@example.com" not just "Invalid email".

`<FormField>` validates on `blur` and clears error on next `change`. On submit, parent collects all errors and focuses the first invalid field (`focus-management`).

### 1.5 — Loading + success affordances

Buttons that fire async actions:
- Disable on click
- Show inline `<Loader2 className="animate-spin" />` + label change ("Saving…")
- Hold disabled state ≥200ms even on fast responses (anti-flash)
- On success, brief green check + label flash for 600ms before normal state returns

**Commit + push + update CHANGES.md.** No user-facing visual change yet.

---

## Batch 2 — Declarations: Yes/No placement

**File:** `src/components/kyc/steps/DeclarationsStep.tsx`

The current layout pins Yes/No radios to the far right of the row, hundreds of pixels away from the question. Violates `whitespace-balance` and Gestalt proximity. Rebuild as:

```
Politically Exposed Person (PEP) *
Are you, or have you ever been, a politically exposed person or
closely associated with one?

[ Yes ]   [ No ]
```

### 2.1 — Yes/No segmented pill

Build (or reuse if it exists) `src/components/shared/YesNoToggle.tsx`:
- Two buttons side-by-side: `Yes` and `No`
- Each ~120px wide, **44pt tall** (`touch-target-size`)
- 8px gap between (`touch-spacing`)
- Selected: filled `bg-brand-navy text-white`
- Unselected: `bg-white border border-gray-300 text-gray-700 hover:bg-gray-50`
- Focus ring 2px brand-navy
- `role="radiogroup"` on wrapper, `role="radio"` + `aria-checked` per pill
- Keyboard: arrow keys move selection, space/enter selects, tab moves to next field
- Don't use red for "No" — would imply wrong answer (`color-not-only`). Reserve red only when a Yes answer triggers a downstream compliance flag.

### 2.2 — Question block layout

Each declaration question becomes a vertically stacked block (no Card border, no row layout):

```tsx
<div className="space-y-3">
  <div>
    <label className="text-base font-semibold text-gray-900">
      Politically Exposed Person (PEP) <span className="text-red-600">*</span>
    </label>
    <p className="text-sm text-gray-600 mt-1">
      Are you, or have you ever been, a politically exposed person...?
    </p>
  </div>
  <YesNoToggle ... />
</div>
```

32px vertical gap between questions.

### 2.3 — Tax ID + other text fields in this step

Apply the §1.1 width system: tax ID is `w-56`, not full width. Top-aligned label, helper text "Your jurisdiction's tax identifier (e.g. NI number, SSN, TIN)".

**Commit + push + update CHANGES.md.**

---

## Batch 3 — Role chips on Review-KYC top row

**File:** wherever B-046 placed the role chips (likely `src/components/kyc/KycStepWizard.tsx` header, or a sub-component).

### 3.1 — Replace status-style with explicit toggle affordance

Current B-046 design: `[Director ✓] [Shareholder ✓] [UBO ✓]` reads as a **status badge** ("this person IS a Director"), not a control.

Replace with **labeled checkbox-style toggles** prefixed by "Roles:":

```
Roles:    [☑ Director]    [☑ Shareholder]    [☐ UBO]
```

Specs:
- Prefix label: "Roles:" — gray-600, 14px font-medium, vertically centered with chips
- Each chip: pill-shaped, 44pt tall, ~12px horizontal padding, 8px gap from next chip
- Inside the chip: checkbox glyph (`☑` filled / `☐` outlined — use Lucide `<CheckSquare />` / `<Square />`) + 6px gap + role label
- **Filled state** uses role-specific palette (keep B-046 colors): Director blue, Shareholder purple, UBO yellow
- **Outlined state**: `bg-white border border-gray-300 text-gray-700` with gray-300 outline checkbox
- **Label stays the same in both states** — do **not** flip to "Add Director" / "Remove Director" (visually noisy, confusing for keyboard nav)
- Click toggles state (existing B-046 behavior; just reskin)
- Keyboard: tab to chip, space toggles
- `aria-label` per chip: "Toggle Director role" / "Toggle Shareholder role" / "Toggle UBO role"
- `aria-pressed` reflects current state
- Focus ring 2px brand-navy on outer pill

### 3.2 — Maintain B-046 behaviors

- UBO chip hidden if `record_type !== 'individual'` (already in B-046)
- Last-role removal confirm dialog (already in B-046)
- Optimistic update + rollback on save failure (already in B-046)

Don't reintroduce the bottom Roles list that B-046 removed — top row remains the only place to see/edit roles.

**Commit + push + update CHANGES.md.**

---

## Batch 4 — Button hierarchy + placement audit

B-046 already centered the button group. This batch tightens visual hierarchy across every wizard / dialog.

### 4.1 — Three-tier button system

Standardize across the client portal:

| Tier | Use for | Style |
|---|---|---|
| **Primary** | Next, Save & Continue, Submit, Confirm | `bg-brand-navy text-white hover:bg-brand-navy/90`, 44pt, font-semibold |
| **Secondary** | Save & Close, Upload later, Add | `bg-white border border-gray-300 text-gray-700 hover:bg-gray-50`, 44pt |
| **Tertiary** | Back, Cancel | `text-gray-600 hover:text-gray-900` link-style, no border, no fill, 44pt hit area |

Rule: **one Primary per screen** (`primary-action`). If a screen has two blue buttons today, demote the less critical one to secondary.

### 4.2 — Apply across

- Outer application wizard (`ServiceWizardNav.tsx` and any wrapper)
- Per-person KYC wizard (`KycStepWizard.tsx`)
- Add Person modal (`AddPersonModal.tsx` from B-046)
- Unsaved-changes dialog (`ClientServiceDetailClient.tsx`)
- Any dialog / sheet that has Confirm + Cancel buttons

Centered group from B-046 stays — only colors / weights change.

### 4.3 — Loading states everywhere

Every primary-button submit handler must use the §1.5 pattern: disable + spinner + label change + 200ms minimum.

### 4.4 — Top-left "Back to People" / "Back to Dashboard" link

Currently bright brand-blue. Demote to gray-600 link with smaller chevron — it's a back-navigation, not a CTA, and competes for attention with the page heading.

**Commit + push + update CHANGES.md.**

---

## Batch 5 — Apply system to existing client forms

Audit and refactor these forms to use Batch 1 patterns:

1. **Login** (`/login`) — email + password form
2. **Register** (`/register`) — full name, email, company, password
3. **Outer wizard step 1** (`/apply/[templateId]/details`) — proposed names, business activity, countries
4. **Add Person modal** (`AddPersonModal.tsx` from B-046) — Select existing tab + Add new tab
5. **Identity step** (`IdentityStep.tsx`) — name, DOB, nationality, passport, address
6. **Financial step** (`FinancialStep.tsx`)
7. **Declarations step** (`DeclarationsStep.tsx`) — most done in Batch 2; verify text fields use width system
8. **Review step** (`ReviewStep.tsx`) — read-only summary; ensure spacing rhythm
9. **Contact details sub-step** (B-046) — verify email `w-80` + phone `w-48`, top-aligned labels

For each form:
- Apply variable field widths per §1.1
- Top-aligned labels with required asterisks per §1.2
- Section grouping per §1.3 (no card-on-card)
- Inline validation per §1.4
- Helper text on complex fields per `input-helper-text` (e.g. "Tax ID — your jurisdiction's identifier", "Country of operations — where the entity will conduct business")
- Inputs use semantic `type=` so mobile keyboards match (`input-type-keyboard`): `email`, `tel`, `number`, `date`
- Add `autocomplete=` attributes (`autofill-support`): `email`, `name`, `tel`, `street-address`, `postal-code`, `country-name`

**Commit + push + update CHANGES.md.**

---

## Batch 6 — Pre-delivery verification

Run the following checklist. Fix anything that fails before final commit.

**Forms**
- [ ] All required fields marked with red `*` after the label, `aria-required="true"`
- [ ] All inputs have visible top-aligned labels (no placeholder-as-label anywhere)
- [ ] Field widths match content (phone narrower than email, postal narrower than city, etc.)
- [ ] Errors render directly below the related field, red-600, `role="alert"` + `aria-live="polite"`
- [ ] Inline validation triggers on blur, not keystroke
- [ ] First invalid field auto-focuses on submit error
- [ ] No card-on-card nesting; only the wizard shell card is outer
- [ ] Spacing rhythm 16/24/48 respected (input/group/section)
- [ ] Semantic `type=` and `autocomplete=` on every input

**Buttons**
- [ ] All buttons ≥44pt tall, ≥8px between
- [ ] One Primary per screen (brand-navy)
- [ ] Back is text-link style (no border, no fill)
- [ ] Loading state on every async submit (spinner + label change, ≥200ms)

**Specific design decisions from this brief**
- [ ] Yes/No declarations: answer below question, segmented pill, not red for No
- [ ] Role chips: "Roles:" prefix, ☑/☐ icons, label unchanged across states
- [ ] Top-left "Back to …" links demoted to gray-600

**Accessibility**
- [ ] Focus rings visible on every interactive element (2–4px brand-navy)
- [ ] All icon-only buttons have `aria-label`
- [ ] Keyboard tab order matches visual order
- [ ] Color contrast ≥4.5:1 for body text on backgrounds (test with browser dev tools)
- [ ] Color is never the only signal (errors include text, success includes icon, declarations include text labels)

**Build**
- [ ] `npm run build` passes clean (lint + type check, no warnings)

Update CHANGES.md with a dated section per batch. Final commit + push.

Hand back: one line — done / blocked / question.

---

## Open notes

- **Reuse existing tokens.** brand-navy, role colors (Director blue, Shareholder purple, UBO yellow), gray scale. Don't introduce a new palette.
- **No new features.** This is a UX polish / a11y pass. If you spot a missing feature mid-work, log it in CHANGES.md tech-debt tracker — don't build it.
- **Don't introduce `any`.** Use `unknown` + cast if Supabase inference is wrong.
- **Don't disable TypeScript strict mode.**
- **Mobile-first.** Every change must work at 375px width without horizontal scroll.
- **Reduced-motion.** Any new transitions must check `prefers-reduced-motion` and skip animation when set.
- **Test in dark mode if the app supports it.** If not, no action needed — but don't introduce dark-only colors.
