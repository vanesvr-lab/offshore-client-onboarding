# B-150 — Restore Actions in the regular service-detail step nav (B-146 regression)

## Why

B-146 wanted to drop Actions from the Review/Update Wizard only — Actions was supposed to STAY in the regular service-detail page's step navigation at the top. The brief I wrote was too aggressive: it told CLI to collapse `buildAdminSteps(hasActions)` to always return a 5-step list, but that builder is used by BOTH the wizard's step indicator AND the regular page's top step-pill navigation.

Net effect today (post-B-146): on the regular `/admin/services/[id]` page (NOT in wizard mode), the step nav at the top shows 5 pills (Company Setup → Financial → Banking → People & KYC → Documents). The Actions step is missing from the nav. The Actions content block still renders below (line 6582 in `ServiceDetailClient.tsx` is gated on `hasActionBindings && !reviewMode`), but the navigational handle to scroll to it is gone.

Vanessa flagged this — she only wanted Actions removed from the wizard, not from the regular page.

The fix: separate the builders. `buildAdminSteps(hasActions)` honors `hasActions` again (returns 6 when true, 5 otherwise) — that's the regular page's nav. The wizard's `buildReviewStepSectionKeys()` + `buildReviewStepLabels()` stay always-5 (the B-146 intent for the wizard).

## Out of scope (do NOT do in B-150)

- **Wizard changes** — wizard stays at 5 steps. Don't touch the wizard's step builders.
- **The page-level Actions block render gate** — `hasActionBindings && !reviewMode` is already correct. Leave it.
- **Step ordering / labels** — Actions slots back in as step 6 on the regular page. Same position it had pre-B-146.

---

## Batch 1 — Split `buildAdminSteps` from the wizard builders

### Update `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`

Currently (around line 4204):

```ts
const ADMIN_STEPS_SERVICES: AdminStep[] = [
  { id: "step-company-setup", label: "Company Setup", sectionKeys: ["company_setup"] },
  { id: "step-financial",     label: "Financial",     sectionKeys: ["financial"] },
  { id: "step-banking",       label: "Banking",       sectionKeys: ["banking"] },
  { id: "step-people-kyc",    label: "People & KYC",  sectionKeys: ["people"] },
  { id: "step-documents",     label: "Documents",     sectionKeys: ["documents"] },
];

function buildAdminSteps(hasActions: boolean): AdminStep[] {
  void hasActions;
  return ADMIN_STEPS_SERVICES;
}
```

Restore the conditional. Replace with:

```ts
const ADMIN_STEPS_BASE: AdminStep[] = [
  { id: "step-company-setup", label: "Company Setup", sectionKeys: ["company_setup"] },
  { id: "step-financial",     label: "Financial",     sectionKeys: ["financial"] },
  { id: "step-banking",       label: "Banking",       sectionKeys: ["banking"] },
  { id: "step-people-kyc",    label: "People & KYC",  sectionKeys: ["people"] },
  { id: "step-documents",     label: "Documents",     sectionKeys: ["documents"] },
];

const ADMIN_STEPS_WITH_ACTIONS: AdminStep[] = [
  ...ADMIN_STEPS_BASE,
  { id: "step-actions", label: "Actions", sectionKeys: ["actions"] },
];

// B-150 — Restore conditional. The REGULAR service-detail page's top
// step navigation honors `hasActions` so the Actions pill reappears
// when the template binds at least one action. The wizard's step list
// (see buildReviewStepSectionKeys / buildReviewStepLabels) stays
// permanently 5 steps per B-146.
function buildAdminSteps(hasActions: boolean): AdminStep[] {
  return hasActions ? ADMIN_STEPS_WITH_ACTIONS : ADMIN_STEPS_BASE;
}
```

**Do NOT touch** `buildReviewStepSectionKeys` and `buildReviewStepLabels` (lines ~4528-4545). They stay always-5 (the B-146 intent). Verify their comments still read correctly.

### Render path verification

The page's top step nav (around `<AdminReviewWizardStepIndicator>` or whatever the regular-page equivalent is — CLI: grep for `buildAdminSteps(hasActionBindings)` in render code, around line 5501) calls `buildAdminSteps(hasActionBindings)`. After the fix, on a GBC service (4 action bindings), the page-level nav renders 6 pills; the wizard's nav stays at 5.

The wizard top bar uses `buildAdminSteps(hasActions)` too (line 4565 — the `ReviewWizardTopBar` prop also feeds adminSteps). Since the wizard is reviewMode + uses its own iteration via `reviewSectionKeys.length`, the extra Actions pill at index 5 in adminSteps would visually appear in the wizard's top bar too — which we don't want.

**Important check during implementation**: confirm the wizard's top-bar step indicator is driven by `reviewSectionKeys.length` / `reviewLabels`, not by `adminSteps.length`. If it's driven by adminSteps directly, we need to either:
- Pass a wizard-specific 5-step list into the wizard top bar, OR
- Keep `buildAdminSteps` always returning the 5-step list AND introduce a separate `buildPageSteps(hasActions)` for the regular page's nav

Read the wizard top bar code (around lines 4570-4620) to confirm which it uses. If `adminSteps.length === 6` would leak into the wizard's indicator, this brief needs the second pattern. Document the choice in the commit message.

### Verification (Batch 1)

Manual:
1. Open `/admin/services/[id]` for a GBC or AC service (both have action bindings). Top step nav now shows 6 pills: Company Setup → Financial → Banking → People & KYC → Documents → **Actions**. Click the Actions pill → page scrolls to the Actions block.
2. Open the wizard (Review/Update Wizard button). Top step indicator still shows 5 circles (Company Setup → Financial → Banking → People & KYC → Documents). Actions does NOT appear in the wizard.
3. Open `/admin/services/[id]` for a service with a template that has zero action bindings (e.g. Trust and Foundation Formation if no bindings exist). Top step nav shows 5 pills only. Same as before.

### Commit message (Batch 1)

```
fix: restore Actions step in regular service-detail nav (B-150)

B-146 over-collapsed buildAdminSteps to always return a 5-step
list, removing the Actions pill from the regular service-detail
page's top step navigation. The Actions content block kept
rendering but the nav handle to scroll to it was lost.

Splits the builders:
- buildAdminSteps(hasActions) returns 5 or 6 steps based on
  hasActions (regular page nav — restores pre-B-146 behavior).
- buildReviewStepSectionKeys() + buildReviewStepLabels() stay
  always-5 (wizard — preserves B-146's wizard simplification).

[Note in commit message if the wizard top bar needed a
wizard-specific step list to avoid the extra Actions pill
leaking into the wizard's indicator.]
```

---

## Batch 2 — CHANGES.md

### CHANGES.md

Top-of-file entry under `## B-150 — Restore Actions step on regular page (done YYYY-MM-DD)`. Reference as a B-146 follow-up regression fix.

### Tech debt log

No new entries.

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure code fix.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- Wizard stays at 5 steps.
- Actions content block render gate unchanged.
- No other step-nav changes.
