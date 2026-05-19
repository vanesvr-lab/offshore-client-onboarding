# B-134 — Unify representative model + dropdown pickers + KYC email multi-select

## Why

B-131 introduced "Filed by a representative" as a separate concept from the existing `is_representative` flag, which created two parallel ways to capture reps:

1. **`CreateProfileDialog`'s "This is a representative (no KYC required)"** — sets `is_representative = true` on the new profile. The profile IS a rep.
2. **B-131's "Filed by a representative"** — stores `filing_rep_name` + `filing_rep_email` text columns on the director's profile. The rep is described but not modeled as a profile.

Vanessa flagged this as confusing — and rightly so. The two paths produce different data shapes:

- Path 1 → a real `client_profiles` row with `is_representative = true`, can log in, has a profile detail page.
- Path 2 → just two strings on the director's row. No separate profile, no central tracking, can't surface "all directors this rep files for".

B-134 collapses to ONE model: **reps are first-class `client_profiles` rows** (`is_representative = true`). Directors point at them via `client_profiles.filing_rep_profile_id` (FK to another `client_profiles.id`). The text columns from B-131 get migrated to the FK and dropped.

This also enables:

- **Dropdown of existing reps** when adding a new director — one rep can be linked to many directors on the same service, without re-entering their name/email each time.
- **Email multi-select on Request KYC** — admin sees every email linked to the director (director's own + rep's), labeled with `name + role`, and can choose who to send to.
- **A single "filings on behalf of" view** (B-131's dashboard) that always queries the FK consistently.

## Out of scope (do NOT do in B-134)

- **Multiple reps per director** — one rep per director, single FK. Joint-rep arrangements stay deferred.
- **Rep can act as the director beyond KYC** — same scope as B-131. Reps can edit KYC, period.
- **Backfill audit** — the migration creates rep profiles for any name/email pair that doesn't already match an existing rep. If those auto-created profiles are duplicates or mislabeled, Vanessa cleans them up via `/admin/profiles` post-deploy.
- **Workflow change: "Director becomes rep"** — if a director's profile needs to be converted into a rep profile retroactively, that's a manual data fix. No UI for it.

## Permission gates (unchanged from prior briefs)

- Adding / editing the filing-rep link: `data_access = 'edit'`.
- Sending KYC requests: `send_communications`.
- Rep login + access to delegated KYC: driven by the rep's email match — no admin flags.

---

## Batch 1 — Schema: introduce `filing_rep_profile_id` FK + backfill + drop legacy columns

### Migration: `<timestamp>_unify_filing_rep_model.sql`

Use `npx supabase migration new unify_filing_rep_model` to generate the timestamp.

```sql
-- B-134 — Unify the representative model. Replace B-131's
-- filing_rep_name + filing_rep_email text columns with a proper FK
-- to a client_profiles row (where is_representative = true).

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS filing_rep_profile_id uuid
    REFERENCES public.client_profiles(id);

CREATE INDEX IF NOT EXISTS client_profiles_filing_rep_idx
  ON public.client_profiles(filing_rep_profile_id)
  WHERE filing_rep_profile_id IS NOT NULL;

-- Backfill: for each director with a filing_rep_email set, find or
-- create the matching rep profile and write the FK.
DO $$
DECLARE
  r RECORD;
  rep_id uuid;
BEGIN
  FOR r IN
    SELECT id, tenant_id, filing_rep_name, filing_rep_email
    FROM public.client_profiles
    WHERE filing_rep_email IS NOT NULL
      AND filing_rep_profile_id IS NULL
  LOOP
    -- Try to find an existing rep profile in the same tenant by email
    SELECT cp.id INTO rep_id
    FROM public.client_profiles cp
    WHERE cp.tenant_id = r.tenant_id
      AND lower(cp.email) = lower(r.filing_rep_email)
      AND cp.is_representative = true
      AND cp.is_deleted = false
    LIMIT 1;

    -- Create one if not found
    IF rep_id IS NULL THEN
      INSERT INTO public.client_profiles (
        tenant_id, full_name, email, record_type, is_representative,
        due_diligence_level
      )
      VALUES (
        r.tenant_id, r.filing_rep_name, r.filing_rep_email,
        'individual', true, 'cdd'
      )
      RETURNING id INTO rep_id;
    END IF;

    UPDATE public.client_profiles
    SET filing_rep_profile_id = rep_id
    WHERE id = r.id;
  END LOOP;
END $$;

-- Summary audit row for the backfill
INSERT INTO public.audit_log (
  actor_role, action, entity_type, entity_id,
  previous_value, new_value
) VALUES (
  'system',
  'filing_rep_model_unified_backfill',
  'migration',
  gen_random_uuid(),
  jsonb_build_object('migration', 'B-134'),
  jsonb_build_object(
    'linked_count', (
      SELECT count(*) FROM public.client_profiles
      WHERE filing_rep_profile_id IS NOT NULL
    )
  )
);

-- Drop legacy text columns. Constraint from B-131 also goes.
ALTER TABLE public.client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_filing_rep_consistency;
ALTER TABLE public.client_profiles
  DROP COLUMN IF EXISTS filing_rep_name,
  DROP COLUMN IF EXISTS filing_rep_email;

-- Drop the lookup index from B-131 (no longer needed; replaced by
-- the FK-based query path in Batch 4)
DROP INDEX IF EXISTS client_profiles_filing_rep_email_idx;
```

### Migration lifecycle (CLI is responsible for the full cycle)

Per CLAUDE.md "Database Migration Workflow":

1. Write the migration file.
2. Commit + push the migration file.
3. `npm run db:push` to apply to prod.
4. `npm run db:status` — confirm Local + Remote pair with no drift.
5. CHANGES.md entry noting the migration filename + that it was pushed.

### Verification (Batch 1)

```sql
-- New column exists, old columns gone
SELECT column_name FROM information_schema.columns
WHERE table_name='client_profiles'
  AND column_name IN ('filing_rep_profile_id','filing_rep_name','filing_rep_email');
-- Expect: only filing_rep_profile_id

-- Backfill count
SELECT count(*) FROM public.client_profiles WHERE filing_rep_profile_id IS NOT NULL;

-- Each linked director's rep profile actually exists and is is_representative=true
SELECT d.id, r.id, r.is_representative
FROM public.client_profiles d
JOIN public.client_profiles r ON r.id = d.filing_rep_profile_id
WHERE d.filing_rep_profile_id IS NOT NULL
LIMIT 5;
-- Every row's r.is_representative must be true
```

### Commit message (Batch 1)

```
feat(db): unify filing rep model with FK to client_profiles (B-134)

Replaces B-131's filing_rep_name + filing_rep_email text columns
with filing_rep_profile_id FK pointing at a client_profiles row
where is_representative = true. Backfill: for each director with
a filing_rep_email set, either reuse the existing rep profile
(matched by email + is_representative=true) or create a new one,
then write the FK. Legacy text columns + CHECK constraint
dropped. Audit_log summary row records the backfill count.
```

---

## Batch 2 — Backend: route updates for the FK model

### Update profile-create routes

- `POST /api/admin/profiles-v2/create` — drop `filing_rep_name` / `filing_rep_email` from the body schema. Add `filing_rep_profile_id: string | null`. Validate (if set) that the target profile exists with `is_representative = true` in the same tenant.
- `POST /api/admin/services/[id]/roles` — same change to the "create new" branch.
- `PATCH /api/admin/profiles-v2/[id]` — same change.

When `filing_rep_profile_id` is set and changed from null → non-null:
- Look up the rep profile.
- Find or upsert a `users` row for `rep_profile.email`.
- Send the magic-link invite (same `sendFilingRepInvite` helper, unchanged) so the rep can log in.

The helper signature changes: instead of taking `repName + email` directly, take the rep's profile_id and resolve internally. Simpler interface.

### Update `B-131` filing-rep query paths

Anywhere the codebase queries "what profiles is this email a filing rep for" — was `WHERE filing_rep_email = session.user.email`. Now becomes:

```ts
// Find the rep profile that matches the session user's email
const { data: repProfile } = await supabase
  .from("client_profiles")
  .select("id")
  .eq("tenant_id", tenantId)
  .ilike("email", session.user.email)
  .eq("is_representative", true)
  .eq("is_deleted", false)
  .maybeSingle();

if (repProfile) {
  // Find every director where this is the filing rep
  const { data: filingFor } = await supabase
    .from("client_profiles")
    .select("...")
    .eq("filing_rep_profile_id", repProfile.id);
}
```

Affected surfaces (CLI: grep `filing_rep_email` to find all of them):

- `src/app/(client)/dashboard/page.tsx` — "Filings on behalf of" section (B-131 Batch 4)
- `src/app/(client)/filings/[profileId]/page.tsx` — authorization check (B-131 Batch 5)
- KYC save endpoint authorization extension (B-131 Batch 5)

The authorization check changes from "session email matches profile.filing_rep_email" to "session email matches profile.filing_rep_profile.email AND that profile is is_representative=true".

### Verification (Batch 2)

Manual:
1. Create a fresh director via `POST /api/admin/services/[id]/roles` with `filing_rep_profile_id` = some existing rep profile's id. Confirm the director persists with the FK and the rep gets a magic-link invite.
2. Log in as the rep. The "Filings on behalf of" section still lists this director (B-131 functionality preserved through the migration).
3. Try the rep KYC editor at `/filings/[profileId]` — confirm it still loads + saves.

### Commit message (Batch 2)

```
feat: rep-aware routes use filing_rep_profile_id FK (B-134)

Profile-create / -update routes drop filing_rep_name + filing_rep_email
from the body schema, accept filing_rep_profile_id instead. Validate
the target is is_representative=true in the same tenant.
sendFilingRepInvite resolves the rep profile internally now.
Dashboard "Filings on behalf of" + /filings/[profileId] auth +
KYC save endpoint all switch to "find rep profile by email →
match filing_rep_profile_id" instead of the old text-email match.
```

---

## Batch 3 — AddDirector modal cleanup + existing-rep dropdown

### Update the AddDirector modal in `ServiceDetailClient.tsx`

Drop these existing affordances from the "Or create new" section:

- "This is a representative (no KYC required)" checkbox — gone. AddDirector is for adding directors.
- "Due Diligence Level" dropdown — keep this (it's per-director DD level, useful).
- "Filed by a representative" checkbox — REWORK as below.

Replace the current B-131 "Filed by a representative" text inputs with a **picker**:

```tsx
{filedByRep && (
  <div className="space-y-2 ml-6">
    <label className="text-xs font-medium text-gray-700">
      Representative
    </label>
    <select
      value={selectedRepId ?? ""}
      onChange={(e) => setSelectedRepId(e.target.value || null)}
      className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
    >
      <option value="">— Select a representative —</option>
      {existingReps.map((rep) => (
        <option key={rep.id} value={rep.id}>
          {rep.full_name} {rep.email ? `— ${rep.email}` : ""}
        </option>
      ))}
    </select>
    <button
      type="button"
      onClick={() => setShowCreateRepDialog(true)}
      className="text-xs text-brand-navy hover:underline"
    >
      + Add new representative
    </button>
  </div>
)}

{showCreateRepDialog && (
  <CreateProfileDialog
    open
    onClose={() => setShowCreateRepDialog(false)}
    onCreated={(newId) => {
      setShowCreateRepDialog(false);
      // Re-fetch reps list, auto-select the new one
      refreshReps().then(() => setSelectedRepId(newId));
    }}
    forceIsRepresentative
  />
)}
```

The `forceIsRepresentative` prop on `CreateProfileDialog` (new) hard-locks `is_representative = true` and hides the checkbox, so the inline create flow always produces a rep profile. The dialog title becomes "New Representative" in this mode.

`existingReps` is loaded once when the AddDirector modal opens — query `client_profiles` filtered to the current tenant where `is_representative = true` and `is_deleted = false`.

On submit, the AddDirector form's POST body includes `filing_rep_profile_id: selectedRepId` (or null if the box is unchecked).

### Update `CreateProfileDialog` (`src/components/admin/CreateProfileDialog.tsx`)

Add a `forceIsRepresentative?: boolean` prop. When true:
- Skip the "This is a representative (no KYC required)" checkbox UI.
- Skip the "Filed by a representative" affordance from B-131 (irrelevant for a rep profile).
- Title reads "New Representative".
- POST always sends `is_representative: true`, no other variants.

The standalone usage at `/admin/profiles` doesn't pass this prop, so the existing UX stays.

### Verification (Batch 3)

Manual:
1. On a service with no reps yet, open AddDirector modal → click "Filed by a representative". The dropdown lists "— Select a representative —" (empty) and the "+ Add new representative" link.
2. Click the link → modal title is "New Representative", checkbox to mark-as-rep is gone (forced), DD level + name + email visible.
3. Create the rep → modal closes → dropdown now shows the new rep → it's auto-selected.
4. Complete the AddDirector form → submit → director persists with `filing_rep_profile_id` set to the rep's id.
5. On a second service (different one), AddDirector → "Filed by a representative" — the new rep from step 3 appears in the dropdown (because reps are tenant-scoped, not service-scoped).

### Commit message (Batch 3)

```
feat: AddDirector modal — rep dropdown + inline create (B-134)

Removes the redundant "This is a representative" checkbox from
AddDirector (you add directors here, not reps). The "Filed by
a representative" checkbox now reveals a dropdown of existing
rep profiles in the tenant, with "+ Add new representative"
opening CreateProfileDialog in a forced-rep mode (is_representative
locked true, title "New Representative"). Selecting a rep stores
filing_rep_profile_id on the director.
```

---

## Batch 4 — Service detail per-director KYC card: "+ Add representative for KYC"

In `ServiceDetailClient.tsx`, find the per-director KYC card (the section that shows the director's name + email + KYC progress + sections).

Add a clear button at the top of the card OR next to the email field:

```tsx
{!profile.filing_rep_profile_id ? (
  <button
    type="button"
    onClick={() => setRepPickerOpen(true)}
    className="inline-flex items-center gap-1 text-xs text-brand-navy hover:text-brand-blue underline-offset-2 hover:underline"
  >
    <UserPlus className="h-3 w-3" />
    + Add representative for KYC
  </button>
) : (
  <div className="text-xs text-gray-600 flex items-center gap-2">
    <UserCheck className="h-3 w-3 text-purple-600" />
    Filed by <span className="font-medium">{profile.filing_rep.full_name}</span>
    <button
      type="button"
      onClick={() => setRepPickerOpen(true)}
      className="text-[10px] text-gray-500 hover:text-gray-700 underline"
    >
      change
    </button>
  </div>
)}
```

The rep picker (`setRepPickerOpen`) opens the same dropdown + inline-create UX from Batch 3. On select, PATCH the director's profile to update `filing_rep_profile_id`. The audit log fires automatically via the existing trigger pattern.

Also: the existing email-edit affordance (which Vanessa flagged as "currently email can be updated but it's not clear this is editable") should be more clearly indicated:
- Add a pencil icon next to the email field
- Hover state shows a subtle background tint to indicate clickability
- A tooltip on the icon: "Edit director's email"

### Verification (Batch 4)

Manual:
1. On a service detail page, find a director with no rep set → confirm "+ Add representative for KYC" button shows.
2. Click → rep picker (same as Batch 3's dropdown) opens.
3. Pick or create a rep → confirm the card now shows "Filed by [rep name] [change]" with the purple icon, and audit_log captures the change.
4. Click "change" → picker reopens; clear the selection → director's `filing_rep_profile_id` set back to null → card reverts to the "+ Add" button.
5. The director's email field now has a pencil icon and a hover state that makes it obvious it's editable.

### Commit message (Batch 4)

```
feat: service detail — "+ Add representative for KYC" affordance (B-134)

Per-director KYC card on the service detail page gains an explicit
"+ Add representative for KYC" button when no rep is set; when set,
shows "Filed by [name]" with a [change] link. Both open the same
rep picker (dropdown of existing reps + inline create) from B-134
Batch 3. Director email field now has a pencil icon + hover tint
so the edit affordance is obvious (Vanessa flagged this as unclear).
```

---

## Batch 5 — Request KYC dialog: multi-select email picker with name/role context

In the existing Request KYC flow (CLI: locate the dialog — likely in `ServiceDetailClient.tsx` or a separate `RequestKycDialog` component, triggered by the "Send Invite" button on a per-director card), replace the single-recipient flow with a multi-select email picker.

### Recipient resolution

For the director the admin is requesting KYC from, gather every email linked to them:

```ts
// Pseudocode
const emails: Array<{ email: string; name: string; role: string }> = [];

// 1. Director's own email
if (profile.email) {
  emails.push({
    email: profile.email,
    name: profile.full_name,
    role: profile.is_representative ? "Representative" : "Director", // or whatever the profile_service_roles role is
  });
}

// 2. Filing rep's email (if profile.filing_rep_profile_id is set)
if (profile.filing_rep) {
  emails.push({
    email: profile.filing_rep.email,
    name: profile.filing_rep.full_name,
    role: "Filing Representative",
  });
}
```

### UI

```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Request KYC from {profile.full_name}</DialogTitle>
    </DialogHeader>

    <div className="space-y-3">
      <label className="text-xs font-medium text-gray-700">
        Send to
      </label>
      <div className="space-y-1">
        {emails.map((r) => (
          <label
            key={r.email}
            className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selectedEmails.has(r.email)}
              onChange={(e) => toggleEmail(r.email, e.target.checked)}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-900 truncate">{r.email}</div>
              <div className="text-[11px] text-gray-500">
                {r.name} <span className="text-gray-400">·</span> {r.role}
              </div>
            </div>
          </label>
        ))}
      </div>

      {/* Optional message field if it exists today, keep as-is */}
      {/* ... */}
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={onClose}>Cancel</Button>
      <Button
        disabled={selectedEmails.size === 0}
        onClick={handleSend}
      >
        Send to {selectedEmails.size} recipient{selectedEmails.size === 1 ? "" : "s"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### Default selection

When the dialog opens:
- If the director has a filing rep set → default-select **only the rep's email**.
- Otherwise → default-select **only the director's own email**.

Admin can toggle either on/off to send to both, one, or neither (button disables when empty).

### Send-side

POST body becomes `{ recipientEmails: string[] }` instead of a single email. The route loops through the array (sending one email per recipient, each with the appropriate magic-link token) and writes one audit_log row per send.

### Verification (Batch 5)

Manual:
1. Open Request KYC for a director with NO rep → dialog shows just the director's email row, default checked.
2. Set a rep on the director → reopen the dialog → now shows both emails; the rep is checked by default, director is unchecked.
3. Check both → click Send → confirm two separate emails go out (verify in Resend dashboard). Two audit_log rows.
4. Each option's row shows the email on the first line and "Name · Role" on the second.
5. Send button disables when all are unchecked.

### Commit message (Batch 5)

```
feat: Request KYC multi-select email picker (B-134)

The Request KYC dialog now lists every email linked to the
target director (director's own + filing rep's, if set). Each
row shows email on top + "Name · Role" beneath for context.
Default selection: rep's email when set, else director's. Admin
can check both to send to both. Send route loops the recipient
array; one magic-link + one audit_log row per recipient.
```

---

## Batch 6 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-134 — Unify representative model + dropdown pickers + KYC email multi-select (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Update B-131 entry** (was: "Multiple filing reps per director — defer to junction table when needed") — leave open. Still applies under the new FK model; junction is the upgrade path.
- **Add new Open entry**: "Auto-created rep profiles from B-134 backfill may have minimal data — the migration's backfill only had `filing_rep_name` + `filing_rep_email` from B-131. Other rep-profile fields (phone, DD level, etc.) were defaulted. Vanessa should audit `client_profiles WHERE is_representative = true AND created_at >= '<B-134 deploy date>'` and fill in missing fields. ~30 min audit task."
- **Add new Open entry**: "Per-rep view of "directors I file for" from admin side — today admins see per-director who their rep is, but there's no view showing "all directors using Rep X". Useful for compliance review of a single rep's portfolio. Estimate: half-day; new brief."
- **Resolve previous open**: "Filing rep field clarity — Vanessa's feedback that the email field 'wasn't clearly editable' is now addressed by Batch 4's pencil icon + hover tint."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write, commit + push file, `db:push`, `db:status`, CHANGES.md.
2. **Per-batch commits:** six commits total. Stage by filename — never `git add .` or `git add -A`.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- One rep per director, not multiple.
- No conversion UI between director profile and rep profile.
- No per-rep "directors I file for" admin view (separate brief if needed).
- Backfill creates rep profiles with minimal data — Vanessa audits + fills missing fields post-deploy.
