# CLI Brief — B-093 Right-Rail Status Card Redesign

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No (one piece flagged as tech debt — see "Tech debt" note)
**Touches AI verification:** No
**Touches API:** No new API; reuses existing `PATCH /api/admin/services/[id]`. Audit data already comes through the page's existing server-side load.
**Builds on:** B-090 (sticky right rail), B-091 (service summary modal), B-092 (scroll offset fix)

---

## Why this batch exists

Today the right-rail **Status** card on `/admin/services/[id]` is a single row: a small status badge + a generic `<select>` that lets the admin change to any value. Three problems:

1. **No accountability trail visible.** Admin can't see when the status last changed or who changed it without opening the Audit Trail panel.
2. **One-click downgrade is too easy.** The current dropdown lets the admin silently flip Approved → Draft with no confirmation. Status moves are high-impact.
3. **Forward motion is unclear.** The most common action — advance to the next stage — should be a single button click. Picking the right next value out of a flat dropdown of 7+ options every time is friction.

Vanessa wants the card restructured into three clearer rows:

```
STATUS
Current status: <bold status badge>
Status updated on <date> by <user-name>
[ Move to <next stage> ]   [ Stage Override ▾ ]
```

Forward motion = the primary button. Any other transition (rollbacks, jumping ahead, terminal flips) goes through the Override dropdown, which requires confirmation.

After this brief:
- The Status card has 4 lines (label / current / updated-on-by / action row).
- "Move to <next>" advances along the canonical forward chain. Greyed when at a terminal state (Approved or Rejected); label stays `Move to Approved` so the layout doesn't shift.
- "Stage Override" opens a menu of all stages; clicking any one prompts a confirmation dialog before applying.
- "Status updated on / by" reads from `audit_log` — the most recent service-status-change row for the current service. Falls back to "Created on `<service.created_at>` by system" when no status-change audit entry exists yet.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main` — worktree on a feature branch; CLI pulls main) + update CHANGES.md.
2. `npm run build` clean.
3. **No migration in this brief.** The denormalised `status_changed_at` / `status_changed_by` columns on `services` is tech debt (see below) — do NOT add the columns in this brief. The audit-log read covers the requirement.
4. **No new API.** Reuse `PATCH /api/admin/services/[id]` for status changes. Server-side: extend the page's data fetch in `src/app/(admin)/admin/services/[id]/page.tsx` to also pull the latest status-change audit row and pass it as a prop.
5. **Don't change the canonical stage chain.** It mirrors the existing stage strip: `draft → in_progress → submitted → in_review → verification → approved`. `pending_action` and `rejected` are off-path side states — they don't get a "next" in the forward chain.
6. **Don't restart the dev server.**

---

## Step 1 — Server-side: fetch the latest status-change audit row

File: [`src/app/(admin)/admin/services/[id]/page.tsx`](src/app/(admin)/admin/services/[id]/page.tsx).

The page already fetches the service + many related rows with the admin Supabase client. Add one more query: the most recent `audit_log` row for this service where the action represents a status change.

`audit_log` schema (from [src/types/index.ts:261](src/types/index.ts:261)): rows have `application_id`, `actor_id`, `actor_name`, `action`, `entity_type`, `entity_id`, `previous_value`, `new_value`, `detail`, `created_at`. Status changes for services are logged with `entity_type = 'service'`, `entity_id = service.id`, and either `action LIKE 'status%'` or `new_value->>'status' IS NOT NULL`. **Verify the exact action string in use** by checking recent audit rows for a service that has changed status (`SELECT action, new_value FROM audit_log WHERE entity_type='service' ORDER BY created_at DESC LIMIT 5;` via the admin client, or grep migrations for the audit trigger). Use whichever predicate matches the live data.

Query shape (adjust filter to match what the trigger writes):

```ts
const { data: lastStatusChange } = await supabase
  .from("audit_log")
  .select("created_at, actor_id, actor_name, action, new_value, previous_value")
  .eq("entity_type", "service")
  .eq("entity_id", service.id)
  .ilike("action", "%status%")          // or filter on new_value->>status — whichever matches
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

Pass the row (or `null`) into `ServiceDetailClient` via a new prop `lastStatusChange: AuditLogEntry | null`.

If `actor_name` is null on the row, optionally enrich by joining to `profiles` on `actor_id`. The display fallback is `"system"` when both are unavailable.

## Step 2 — Build the new Status card markup

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) — the existing Status card block at ~line 3650-3672.

Replace the block with the following structure (Tailwind, no new tokens):

```tsx
<div className="bg-white border rounded-xl px-4 py-3 space-y-2">
  {/* Row 1 — label */}
  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</p>

  {/* Row 2 — current status, bold */}
  <div className="flex items-center gap-2">
    <span className="text-sm font-semibold text-gray-700">Current status:</span>
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadgeClass(service.status)}`}>
      {service.status.replace(/_/g, " ")}
    </span>
  </div>

  {/* Row 3 — updated-on-by */}
  <p className="text-xs text-gray-500">
    {lastStatusChange
      ? <>Status updated on <span className="text-gray-700">{formatDate(lastStatusChange.created_at)}</span> by <span className="text-gray-700">{lastStatusChange.actor_name ?? "system"}</span></>
      : <>Created on <span className="text-gray-700">{formatDate(service.created_at)}</span> by <span className="text-gray-700">system</span></>}
  </p>

  {/* Row 4 — action buttons */}
  <div className="flex items-center gap-2 pt-1">
    <Button
      onClick={() => void updateStatus(nextStage)}
      disabled={isTerminal || updatingStatus}
      className={`flex-1 h-9 ${isTerminal ? "opacity-50 cursor-not-allowed" : ""} ${BTN_PRIMARY}`}
    >
      Move to {nextStageLabel}
    </Button>

    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={updatingStatus} className="h-9 gap-1">
          Stage Override
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="z-[100]">
        {STATUS_OPTIONS.map((s) => (
          <DropdownMenuItem key={s} disabled={s === service.status} onSelect={() => requestOverride(s)}>
            {s.replace(/_/g, " ")}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>

    {updatingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
  </div>
</div>
```

(Above is a sketch — adjust imports / button styling to whatever the codebase already uses. `DropdownMenu` is base-ui per CLAUDE.md gotchas — check existing examples and use the correct prop API. If the codebase doesn't have a DropdownMenu wrapper yet, fall back to a native `<select>` with an "Override" placeholder; document the choice in CHANGES.md.)

## Step 3 — `nextStage` lookup + terminal detection

Below the prop destructuring, derive:

```ts
const FORWARD_CHAIN = ["draft", "in_progress", "submitted", "in_review", "verification", "approved"] as const;

function getNextStage(current: string): string | null {
  const idx = FORWARD_CHAIN.indexOf(current as typeof FORWARD_CHAIN[number]);
  if (idx === -1 || idx === FORWARD_CHAIN.length - 1) return null;  // off-path or at end
  return FORWARD_CHAIN[idx + 1];
}

const nextStage = getNextStage(service.status) ?? "approved";  // default label for terminals
const nextStageLabel = nextStage.replace(/_/g, " ");
const isTerminal =
  service.status === "approved" ||
  service.status === "rejected" ||
  !FORWARD_CHAIN.includes(service.status as typeof FORWARD_CHAIN[number]);
```

- For terminals (`approved`, `rejected`) and off-path states (`pending_action`): button shows `Move to Approved` and is **greyed + disabled**. Layout stays consistent.
- For all in-chain states: button shows `Move to <next>` enabled.

## Step 4 — Override confirmation flow

Override clicks must prompt before applying — admin can downgrade or skip multiple stages, which is destructive enough that one mis-click shouldn't be possible.

Pattern: use a confirmation dialog (the existing AlertDialog / Dialog component in the codebase). Behaviour:

```ts
const [pendingOverride, setPendingOverride] = useState<string | null>(null);

function requestOverride(target: string) {
  if (target === service.status) return;  // no-op
  setPendingOverride(target);
}

function confirmOverride() {
  if (pendingOverride) {
    void updateStatus(pendingOverride);
    setPendingOverride(null);
  }
}

// render conditionally:
{pendingOverride && (
  <AlertDialog open onOpenChange={(open) => { if (!open) setPendingOverride(null); }}>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Override status?</AlertDialogTitle>
        <AlertDialogDescription>
          This will change status from <b>{service.status.replace(/_/g, " ")}</b> to <b>{pendingOverride.replace(/_/g, " ")}</b>.
          Use this for corrections only — normal flow advances via the &quot;Move to&quot; button.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel onClick={() => setPendingOverride(null)}>Cancel</AlertDialogCancel>
        <AlertDialogAction onClick={confirmOverride} className={BTN_PRIMARY}>Override</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
)}
```

If the codebase doesn't have an AlertDialog ready (it likely does — search for prior uses), reuse the existing `Dialog` pattern with two buttons (Cancel + Override) in the footer. Don't invent a new dialog component.

The forward "Move to next stage" button does NOT need confirmation — that's the safe, normal-flow action.

## Step 5 — `updateStatus` cleanup

`updateStatus` exists already (~line 3041). It PATCHes the API and updates local state. After the PATCH succeeds, the audit-log row is written by the DB trigger and will be visible on the **next page render** — so the "Status updated on / by" line will refresh after `router.refresh()` (already called inside `updateStatus`). Verify the existing function calls `router.refresh()`; if not, add it so the new row appears without a manual reload.

If the existing function does `setService((prev) => ({ ...prev, status: status }))`, also set the `updated_at` field so the bg state matches; the audit row reflows on refresh.

## Step 6 — Tech debt note

The follow-up item (denormalising `status_changed_at` / `status_changed_by` onto `services`) is **already logged** in [`docs/tech-debt.md`](docs/tech-debt.md) under the 2026-05-12 entry. Do **not** add a duplicate note in CHANGES.md and do **not** open a separate brief for it in B-093 — the tech-debt file is the canonical place.

If you discover any additional follow-ups while implementing B-093 that should be deferred (e.g. obvious refactors, unrelated cleanups), append them to `docs/tech-debt.md` in the same batch — newest at the top, follow the existing entry's format.

## Step 7 — Smoke test (manual; document in CHANGES.md)

1. **Card layout:** open `/admin/services/[id]` for any service. The Status card shows 4 visible rows: STATUS label, "Current status: <badge>", "Status updated on … by …", action row with `Move to <next>` + `Stage Override ▾`.
2. **Initial-state fallback:** open a brand-new service (no status changes yet). Row 3 reads "Created on <date> by system".
3. **Forward motion:** click `Move to In Progress` (or whatever next stage is). PATCH fires; status flips; Row 3 updates to "Status updated on <now> by Jane Doe" after the refresh. Button now reads `Move to Submitted`.
4. **Sequential forward:** keep clicking through `Submitted → In Review → Verification → Approved`. Each transition advances cleanly. Once at Approved, the button is greyed, reads `Move to Approved` (label doesn't shift), cursor is `not-allowed`.
5. **Terminal — Rejected:** override to Rejected. Button still shows `Move to Approved` (greyed). Rollback the Move button doesn't fire.
6. **Override confirmation:** click `Stage Override ▾` → list shows all 8 stages, with current one disabled. Pick `Draft`. Confirmation dialog appears: "This will change status from approved to draft…". Cancel: nothing happens. Override: PATCH fires; Row 3 reflects the change; the button row recomputes for the new status.
7. **Override into terminal:** override Verification → Rejected. Confirmation fires; status changes; button becomes `Move to Approved` greyed.
8. **No-op self-override prevention:** override dropdown's current-status item is disabled; clicking it does nothing.
9. **Stage strip at top of page** also reflects the new status correctly — same data source.
10. **Audit Trail panel** (right rail, below this card) shows the new entries chronologically — confirming the trigger writes the row each PATCH.
11. `npm run build` clean.

If 1–10 fails, fix in the same batch.

---

## CHANGES.md format

```md
### 2026-05-12 — B-093 — Right-rail Status card redesign (Claude Code)

`/admin/services/[id]` right rail — Status card restructured.

- **New layout, 4 rows:** STATUS label → "Current status: <badge>" → "Status updated on <date> by <name>" → `Move to <next>` button + `Stage Override ▾` dropdown.
- **Forward-motion button** advances along the canonical chain (draft → in_progress → submitted → in_review → verification → approved). Greyed at terminals (Approved, Rejected) and off-path states (Pending Action); label stays `Move to Approved` so the layout doesn't shift.
- **Override dropdown** lists all 8 status values; the current status is disabled; selecting any other value opens a confirmation AlertDialog before applying.
- **Status updated on / by** queries the most recent `audit_log` row for `entity_type='service' AND entity_id=service.id` matching the status-change action predicate. Falls back to "Created on <service.created_at> by system" when no audit row exists. Query added in `page.tsx`; result threaded into `ServiceDetailClient` via new `lastStatusChange` prop.

Tech debt for this brief is logged in [`docs/tech-debt.md`](docs/tech-debt.md) — do not duplicate the note here.

Smoke test: <pass/fail from Step 7>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT add columns to `services` or write a migration. Tech debt, deferred.
- Do NOT change the action of the forward "Move to" button when at a terminal — it stays disabled, no confirmation needed (you can't click a disabled button anyway).
- Do NOT skip the confirmation dialog on overrides.
- Do NOT change the stage strip's chain at the top of the page — it's already correct.
- Do NOT remove or rename `STATUS_OPTIONS`. The override menu reuses it directly.
- Do NOT change the canonical stage chain — additions like `pending_action` stay off the forward path.
- Do NOT introduce new design tokens / refactor button colors.
- Do NOT touch the Account Service Owner / Milestones / Audit Trail panels in this brief.
- Do NOT restart the dev server.
