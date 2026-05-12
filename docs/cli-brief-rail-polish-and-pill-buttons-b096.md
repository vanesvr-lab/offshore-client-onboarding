# CLI Brief — B-096 Right-Rail Polish + Pill-Shaped Buttons

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-093 (right-rail Status card), B-094 / B-095 (audit-trail attribution)

---

## Why this batch exists

Three small visual / wording changes:

1. **Status badge font.** The right-rail Status card displays the current-status badge (`Verification`, `In Review`, etc.) at `text-xs` (12 px) while the surrounding `"Current status:"` label is `text-sm` (14 px). Vanessa wants them matched at `text-sm` so the badge reads as a peer of the label, not a footnote.
2. **"Account Service Owner" → "Assigned Officer" + fix broken dropdown.** Label rename in the right rail; PLUS fix a latent bug — the dropdown query at `page.tsx:152` filters by a `tenant_id` column that doesn't exist on `admin_users`, so the dropdown silently renders empty. Removing the bad filter restores the 3 admins (Jane Doe, Sarah Mitchell, Tony Stark) that exist in the DB. When future roles (officer, supervisor, super-user) are added, those will need a separate data model; out of scope here per Vanessa's explicit call.
3. **Pill-shaped buttons + tighter horizontal padding.** Across the whole admin portal — and, because the cleanest path is a single change to the shared `Button` component, the client portal too. Reference screenshots from Vanessa showed fully-rounded pill buttons with comfortable but not overstuffed horizontal padding.

After this brief: Status badge reads same size as its label; the panel title says "Assigned Officer"; every `<Button>` in the app is pill-shaped with one Tailwind step less horizontal padding.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main` — worktree is on a feature branch; CLI pulls main) + update CHANGES.md.
2. `npm run build` clean.
3. **Don't change the `Button` component's color variants, gap, height, or icon-size rules** — only `border-radius` and horizontal padding.
4. **Don't touch any data model.** The "Assigned Officer" change is a label-only rename; the underlying `service_details._assigned_admin_id` field stays as-is. Don't introduce a `staff_roles` table or expand the admin_users schema.
5. **Don't replace `BTN_PRIMARY` / `BTN_OUTLINE` / `BTN_DESTRUCTIVE_OUTLINE` with new constants** — just update the `rounded-md` inside them to `rounded-full`. Same constants, same call sites, new shape.
6. **Don't restart the dev server.**

---

## Step 1 — Bump Status badge from `text-xs` to `text-sm`

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx).

Find the Status card section (around line ~3650-3672 after B-093 landed). The current-status badge is rendered as:

```tsx
<span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadgeClass(service.status)}`}>
  {service.status.replace(/_/g, " ")}
</span>
```

Change `text-xs` → `text-sm`. Keep everything else identical. Result: the badge sits at the same visual weight as the `"Current status:"` label next to it.

## Step 2 — Rename label + fix broken dropdown query

### 2a. Label rename

In [`ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) around line ~3800:

```diff
-<p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Service Owner</p>
+<p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned Officer</p>
```

Quick grep to confirm no other places use the old label:

```bash
grep -rn "Account Service Owner" --include='*.tsx' src/
```

If matches exist elsewhere (e.g., a different panel header, a related component), rename those too for consistency.

### 2b. Fix the broken dropdown query

The dropdown today renders empty even though there are 3 admins in the DB (Jane Doe, Sarah Mitchell, Tony Stark). Root cause verified against live data: the query at [`page.tsx:152-154`](src/app/(admin)/admin/services/[id]/page.tsx:152) filters by a `tenant_id` column that doesn't exist on `admin_users`. The `admin_users` table only has `id, user_id, created_at` — no `tenant_id`. The filter throws a Postgres error and the page silently swallows it, leaving the dropdown empty.

Fix: drop the non-existent filter.

```diff
   // Admin users for manager dropdown
   supabase
     .from("admin_users")
-    .select("user_id, users(full_name, email)")
-    .eq("tenant_id", tenantId),
+    .select("user_id, users(full_name, email)"),
```

`admin_users` is global (not tenant-scoped). All admins are eligible to be Assigned Officer. If multi-tenant scoping of officers is needed in the future, that's a separate schema change (add `tenant_id` column + migration) — out of scope here.

After this, the dropdown should populate with the 3 existing admin users. Verify by opening any `/admin/services/[id]` page after the change.

The `_assigned_admin_id` field on `service_details` (where the selected user_id is stored) stays as-is — it's an internal identifier, not a UI string.

## Step 3 — Pill-shape every Button (shared component)

File: [`src/components/ui/button.tsx`](src/components/ui/button.tsx).

Two changes inside the cva config:

### 3a. Base radius

The base classes currently include `rounded-lg`. Change to `rounded-full`:

```diff
-"group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding ..."
+"group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding ..."
```

### 3b. Size-variant radii

Several size variants override the radius with `rounded-[min(var(--radius-md),Npx)]`. Update each to `rounded-full` so all variants render as pills:

- `xs` size: `rounded-[min(var(--radius-md),10px)]` → `rounded-full`
- `sm` size: `rounded-[min(var(--radius-md),12px)]` → `rounded-full`
- icon-size `size-6` and `size-7` variants: same pattern

Keep `in-data-[slot=button-group]:rounded-lg` overrides if present — those affect grouped buttons and should keep their corner style.

### 3c. Horizontal padding — reduce by 1 Tailwind step

Inside each size variant, shave 1 step off horizontal padding:

| size | current `px-*` | new `px-*` |
|---|---|---|
| default | `px-2.5` (from `has-data-[icon=inline-end]:pr-2` line — verify) — main path uses default sizing | `px-2` |
| `xs` | `px-2` | `px-1.5` |
| `sm` | `px-2.5` | `px-2` |
| `lg` | `px-2.5` | `px-2` |

If a variant already feels too tight at the reduced value (e.g., `xs` going from `px-2` to `px-1.5` causes label text to kiss the pill edge), bump it back up one step for that variant only and document the exception in CHANGES.md.

(`has-data-[icon=inline-end]:pr-N` / `has-data-[icon=inline-start]:pl-N` overrides for icon-adjacent padding stay as-is — they ensure icons get proportional space.)

## Step 4 — Update `BTN_*` constants in ServiceDetailClient.tsx

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx), lines 79-84.

Three constants currently use `rounded-md`. Update to `rounded-full`:

```diff
 const BTN_PRIMARY =
-  "bg-brand-navy hover:bg-brand-blue text-white rounded-md border-transparent";
+  "bg-brand-navy hover:bg-brand-blue text-white rounded-full border-transparent";
 const BTN_OUTLINE =
-  "bg-white hover:bg-gray-50 text-brand-navy hover:text-brand-navy border-brand-navy rounded-md";
+  "bg-white hover:bg-gray-50 text-brand-navy hover:text-brand-navy border-brand-navy rounded-full";
 const BTN_DESTRUCTIVE_OUTLINE =
-  "bg-white hover:bg-red-50 text-red-600 hover:text-red-600 border-red-600 rounded-md";
+  "bg-white hover:bg-red-50 text-red-600 hover:text-red-600 border-red-600 rounded-full";
```

That's all 3 — 22 call sites in this file pick up the change automatically via the merged className.

## Step 5 — Sweep for any inline `rounded-md` / `rounded-lg` on buttons elsewhere

After Step 3 + Step 4, the base + the BTN_* constants are pill. But there may be other admin-page buttons with inline `rounded-md` / `rounded-lg` that override the base. Grep:

```bash
grep -rn "Button.*rounded-md\|className.*rounded-md.*Button" --include='*.tsx' src/app/\(admin\) src/components/admin
grep -rn "Button.*rounded-lg\|className.*rounded-lg.*Button" --include='*.tsx' src/app/\(admin\) src/components/admin
```

For each match that's actually styling a `<Button>` (not a card / surface element), change `rounded-md` → `rounded-full` and `rounded-lg` → `rounded-full`.

**Don't change `rounded-md` / `rounded-lg` on non-button elements** — only buttons. Cards, dialogs, panels, badges keep their existing radii.

If a button explicitly sets a different radius for a deliberate visual reason (e.g., a "tab-style" button that's supposed to be square — unlikely but possible), leave it and note in CHANGES.md.

## Step 6 — Smoke test (manual; document in CHANGES.md)

1. **Status card badge.** Open `/admin/services/[id]`. The right-rail Status card line reads `Current status: Verification` (or whatever current status) with the badge text at the **same size** as the "Current status:" label — both `text-sm`.
2. **Panel rename.** Below it, the section header reads `ASSIGNED OFFICER` (was `ACCOUNT SERVICE OWNER`). The dropdown options + Unassigned behavior unchanged.
3. **Pill buttons — admin page.** Every button on `/admin/services/[id]` is pill-shaped: `Move to <next>`, `Stage Override ▾`, `View Summary for GBC-0002`, `Review` buttons on each section card, `Portal access` / `Request KYC` / `View Summary` chips on each profile card, `Save` / `Cancel` bars, etc. Horizontal padding is visibly tighter (one Tailwind step less than before).
4. **Pill buttons — other admin pages.** Quick visit to `/admin/dashboard`, `/admin/queue`, `/admin/services` (list), `/admin/settings/templates`, `/admin/profiles`. Every primary CTA and secondary button is now pill-shaped.
5. **Client portal sanity.** Open `/dashboard` (client) and `/apply/[templateId]/details` (a wizard step). Buttons there are also pill — the change is global per Vanessa's chosen scope. Visual sanity: no button becomes too tight to read or overflows its container.
6. **Disabled state.** `Move to Approved` greyed out on an Approved service still reads as a disabled pill button (no shape regression).
7. **`npm run build` clean.**

If any text gets clipped or any button visibly breaks because of the tighter padding, fix the affected size variant in the same batch (bump that variant's padding back up one step and note in CHANGES.md).

---

## CHANGES.md format

```md
### 2026-05-12 — B-096 — Right-rail polish + pill-shaped buttons (Claude Code)

Three visual changes bundled.

- **Status badge size:** bumped current-status badge in the right-rail Status card from `text-xs` to `text-sm` — same visual weight as the "Current status:" label.
- **"Account Service Owner" → "Assigned Officer" + dropdown fix:** label rename in the right rail. Removed an `.eq("tenant_id", tenantId)` filter from the dropdown's admin-users query at `page.tsx:152` — that column doesn't exist on `admin_users` so the query was failing silently and the dropdown was rendering empty. After the fix, all 3 existing admins surface. Underlying `service_details._assigned_admin_id` field name unchanged.
- **Pill-shaped buttons (global):** `Button` component default radius `rounded-lg` → `rounded-full`; size variants' radii updated; horizontal padding shaved by one Tailwind step per variant. Plus `BTN_PRIMARY` / `BTN_OUTLINE` / `BTN_DESTRUCTIVE_OUTLINE` constants in `ServiceDetailClient.tsx` (used 22 times) flipped `rounded-md` → `rounded-full`. Inline `rounded-md` / `rounded-lg` on buttons across admin pages swept and updated. Client portal also picks up the change (single source of truth in the shared Button component).

Smoke test: <pass/fail notes from Step 6>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT replace `BTN_PRIMARY` / `BTN_OUTLINE` / `BTN_DESTRUCTIVE_OUTLINE` with new constants. Edit them in place.
- Do NOT introduce a `staff_roles` table or rebuild the dropdown's data model. "Assigned Officer" is a label rename only.
- Do NOT change `rounded-md` / `rounded-lg` on non-button elements (cards, dialogs, panels, badges) — buttons only.
- Do NOT change `Button` color variants, height, gap, or icon-size rules — only border-radius and horizontal padding.
- Do NOT introduce an "admin button" wrapper or new variant — touch the shared component once.
- Do NOT change the `service_details._assigned_admin_id` field name or any underlying data.
- Do NOT skip the Step 5 sweep — there may be inline `rounded-md` on buttons that won't pick up the base change.
- Do NOT restart the dev server yourself.
