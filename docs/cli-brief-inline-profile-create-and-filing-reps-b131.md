# B-131 — Inline profile create everywhere + filing representative delegation

## Why

Two related gaps surfaced while testing the new-service flow for the pitch:

1. **No inline "create profile" from the new service wizard.** `NewServiceWizard.tsx` Step 2 ("Add people") is search-only — there's no "+ Create new profile" button. If the director you want doesn't exist yet, you have to leave the wizard, go to `/admin/profiles`, create the profile there, then come back and search. Same gap exists with the AddDirector modal on the service detail page: it offers Individual / Corporation inline creation but is missing the `is_representative` checkbox and the `due_diligence_level` field — those only exist in `CreateProfileDialog` at `/admin/profiles`.

2. **No way to capture a filing representative.** Today a director is a single `client_profiles` row. In practice, many directors (especially corporate directors) don't fill their own KYC paperwork — a secretary, lawyer, or accountant does it on their behalf. Today there's no field for that delegation. The director gets the magic-link, fills the form themselves, end of story. There's also no way for one person to manage filings across multiple directors.

B-131 closes both gaps:

- **Inline profile creation** from the wizard AND consistent UX across all three profile-create entry points (CreateProfileDialog on `/admin/profiles`, NewServiceWizard Step 2, AddDirector modal on service detail).
- **Filing representative delegation**: a "Filed by a representative" checkbox on the create-profile flows. When checked, capture the rep's name + email. The rep gets a magic-link invite. On login they see a "Filings on behalf of" dashboard listing every profile where their email is the filing rep, with a clickable link to that profile's KYC form (which they can edit on behalf of the director).

## Out of scope (do NOT do in B-131)

- **Multiple filing reps per director.** One rep per director profile (two columns: `filing_rep_name`, `filing_rep_email`). If a future need arises for multiple reps per profile, a separate junction table can be added.
- **Rep can act as the director everywhere** — the rep's access is **scoped to the KYC long form** for the directors they're a rep for. They cannot manage the service, add other directors, change milestones, etc. (Out of scope: a separate brief if Vanessa wants reps to have broader access.)
- **Notification to the director when a rep edits their KYC** — emails on rep-driven changes are deferred. The audit_log captures the change but the director isn't pinged.
- **Revoke / replace a filing rep** — admin can update `filing_rep_email` to a new value, which sends a new invite + the old rep loses access. No formal "revoke" workflow; B-131's UI is just "edit the email" not "revoke this rep".
- **Mass-assign filing rep to many profiles at once** — one profile at a time.

## Permission model

- **Setting / changing a filing rep on a profile**: any admin with `data_access = 'edit'` (Super User, Manager, Officer). Junior Officer + Auditor cannot.
- **Filing rep login + access to delegated profiles' KYC**: any user whose email matches `filing_rep_email` on at least one `client_profiles` row. No admin-side permission flags involved; the access is driven entirely by the email match.

---

## Batch 1 — Schema: `filing_rep_name` + `filing_rep_email` on `client_profiles`

### Migration: `<timestamp>_client_profiles_filing_rep.sql`

Use `npx supabase migration new client_profiles_filing_rep` to generate the timestamp.

```sql
-- B-131 — Filing representative delegation. When a director's KYC
-- paperwork is filed by someone else (corporate secretary, lawyer,
-- accountant, etc.), capture the rep's name + email on the profile.
-- The rep logs in with that email to access the profile's KYC form.

ALTER TABLE public.client_profiles
  ADD COLUMN IF NOT EXISTS filing_rep_name  text,
  ADD COLUMN IF NOT EXISTS filing_rep_email text;

-- Lookup index: at login time, query "give me every profile where
-- filing_rep_email = my email". This needs to be fast.
CREATE INDEX IF NOT EXISTS client_profiles_filing_rep_email_idx
  ON public.client_profiles(lower(filing_rep_email))
  WHERE filing_rep_email IS NOT NULL;

-- Validation: if email is set, name should be too (UI enforces, but
-- belt-and-suspenders here).
ALTER TABLE public.client_profiles
  DROP CONSTRAINT IF EXISTS client_profiles_filing_rep_consistency;
ALTER TABLE public.client_profiles
  ADD CONSTRAINT client_profiles_filing_rep_consistency
  CHECK (
    (filing_rep_name IS NULL AND filing_rep_email IS NULL)
    OR (filing_rep_name IS NOT NULL AND filing_rep_email IS NOT NULL)
  );
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
-- Column exists
SELECT column_name FROM information_schema.columns WHERE table_name='client_profiles' AND column_name IN ('filing_rep_name','filing_rep_email');

-- Index in place
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='client_profiles' AND indexname='client_profiles_filing_rep_email_idx';

-- Constraint fires
INSERT INTO public.client_profiles (full_name, filing_rep_name) VALUES ('Test', 'Should fail');
-- Expect: ERROR, constraint violation
```

### Commit message (Batch 1)

```
feat(db): filing rep columns on client_profiles (B-131)

Adds filing_rep_name + filing_rep_email to client_profiles for the
director→rep delegation feature. CHECK constraint enforces both
or neither (UI-level validation backstop). Functional index on
lower(filing_rep_email) for fast at-login lookup.
```

---

## Batch 2 — Profile create/update APIs accept the new fields + send rep invite

### Update `POST /api/admin/profiles-v2/create`

Add to the accepted body:

```ts
{
  full_name: string;
  email: string | null;
  phone: string | null;
  record_type: 'individual' | 'organisation';
  is_representative: boolean;
  due_diligence_level: 'sdd' | 'cdd' | 'edd';

  // NEW (B-131):
  filing_rep_name: string | null;
  filing_rep_email: string | null;
}
```

Validation: if `filing_rep_email` is set, `filing_rep_name` must also be set (and vice versa). Return 400 if mismatched.

After inserting the profile, if `filing_rep_email` is set:

1. **Upsert `users` row** for that email (same tenant). If it already exists (admin user, another rep, etc.), no-op — they already have a login.
2. **Mirror to `profiles` legacy table** for backward compat with the NextAuth credentials provider's fallback path.
3. **Send the rep invite email** (see "Filing rep invite email" below).

Permission gate: caller's session must have `data_access = 'edit'` (B-127 flag). Return 403 otherwise. This applies to ALL profile-create / profile-update routes that touch `filing_rep_email`.

### Update `POST /api/admin/services/[id]/roles`

Same change: the "create new" code path (when `body.client_profile_id` is null) now reads `filing_rep_name` + `filing_rep_email` from the body and forwards them to the `client_profiles` insert. Same downstream invite flow.

### Update `PATCH /api/admin/profiles-v2/[id]` (or wherever profile edits land)

When the patch contains `filing_rep_email`:

- If the new value differs from the existing one **AND** is non-null → upsert `users` row + send invite (same as Batch 2's create flow).
- If the new value is null (rep cleared) → leave the orphan `users` row alone (the rep may still be filing for other directors). No revoke action — the access is driven by the live email match, so once `filing_rep_email` is null, the rep no longer sees this profile in their dashboard.

### Filing rep invite email (new helper)

Create `src/lib/filing-rep-invite.ts`:

```ts
import { SignJWT } from "jose";
import { Resend } from "resend";
import { PLATFORM_BRAND } from "@/lib/platform-brand";
import { getTenantBrand } from "@/lib/tenant-brand";
// ... (same imports as the existing client-invite route)

export async function sendFilingRepInvite({
  supabase,
  userId,
  email,
  repName,
  directorName,
  tenantId,
}: {
  supabase: SupabaseClient;
  userId: string;
  email: string;
  repName: string;
  directorName: string;
  tenantId: string;
}) {
  const brand = await getTenantBrand(supabase, tenantId);
  const secret = new TextEncoder().encode(process.env.AUTH_SECRET!);
  const token = await new SignJWT({ sub: userId, email, purpose: "filing_rep_invite" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("24h")
    .sign(secret);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl}/auth/set-password?token=${encodeURIComponent(token)}`;

  const resend = new Resend(process.env.RESEND_API_KEY!);
  await resend.emails.send({
    from: `${brand.portal_name} <${process.env.RESEND_FROM_EMAIL!}>`,
    to: email,
    subject: `You've been added as a filing representative — ${brand.display_name}`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #1e3a8a; padding: 20px;">
          <h1 style="color: white; margin: 0; font-size: 22px;">${brand.portal_name}</h1>
        </div>
        <div style="padding: 24px; color: #1a202c;">
          <p>Hi ${repName},</p>
          <p>You've been added as the filing representative for <strong>${directorName}</strong> on the ${brand.portal_name}. This means you can complete their KYC paperwork on their behalf.</p>
          <p>Set your password to log in:</p>
          <p><a href="${inviteUrl}" style="background: #1e3a8a; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; display: inline-block;">Set Password & Log In</a></p>
          <p style="font-size: 12px; color: #64748b;">This link expires in 24 hours. If you weren't expecting this, contact your account manager.</p>
        </div>
        <div style="padding: 16px 24px; background: #f1f5f9; font-size: 11px; color: #64748b;">
          Powered by ${PLATFORM_BRAND.name}
        </div>
      </div>
    `,
  });
}
```

Call this from each of the three create/update paths above after successfully writing `filing_rep_email`.

### Verification (Batch 2)

```bash
# Create a profile with a filing rep via the API
curl -X POST http://localhost:3000/api/admin/profiles-v2/create \
  -H "Content-Type: application/json" \
  --cookie "<your admin session cookie>" \
  -d '{
    "full_name": "Sarah Smith",
    "email": "sarah@example.com",
    "record_type": "individual",
    "is_representative": false,
    "due_diligence_level": "cdd",
    "filing_rep_name": "John Doe",
    "filing_rep_email": "john.doe@example.com"
  }'
# Expect: 200, returns { id: <uuid> }
```

Then in Supabase: confirm `users` row exists for john.doe@example.com with null password_hash. Confirm Resend dashboard shows the invite email sent.

### Commit message (Batch 2)

```
feat: profile-create APIs accept filing rep + send invite (B-131)

POST /api/admin/profiles-v2/create and POST /api/admin/services/[id]/roles
(create-new branch) and PATCH /api/admin/profiles-v2/[id] now accept
filing_rep_name + filing_rep_email. When set, the system upserts a
users row + mirrors to profiles for the credentials fallback path,
then sends a magic-link invite via the new sendFilingRepInvite
helper. Permission gated on data_access=edit. Reps reuse the
existing /auth/set-password flow with purpose="filing_rep_invite".
```

---

## Batch 3 — UI: inline create everywhere + "Filed by a representative" affordance

### A. `CreateProfileDialog` (`src/components/admin/CreateProfileDialog.tsx`)

The component already has `is_representative` + due-diligence + individual/organisation toggle + name + email + phone. Add the filing-rep affordance at the bottom of the form, above the Create button:

```tsx
{/* Filed by a representative */}
<div className="border-t pt-3 space-y-2">
  <div className="flex items-center gap-2">
    <input
      type="checkbox"
      id="has-filing-rep"
      checked={hasFilingRep}
      onChange={(e) => setHasFilingRep(e.target.checked)}
      className="rounded border-gray-300"
    />
    <label htmlFor="has-filing-rep" className="text-sm text-gray-700">
      Filed by a representative
    </label>
  </div>
  <p className="text-xs text-gray-500 -mt-1 ml-6">
    Someone else fills KYC paperwork on this person's behalf — e.g. a corporate secretary, lawyer, or accountant. They'll get a login link.
  </p>

  {hasFilingRep && (
    <div className="space-y-2 ml-6">
      <Input
        value={filingRepName}
        onChange={(e) => setFilingRepName(e.target.value)}
        placeholder="Representative's full name"
      />
      <Input
        type="email"
        value={filingRepEmail}
        onChange={(e) => setFilingRepEmail(e.target.value)}
        placeholder="Representative's email"
      />
    </div>
  )}
</div>
```

Validation in `handleCreate()`:
- If `hasFilingRep` is true, both `filingRepName` and `filingRepEmail` must be non-empty (after trim).
- Email format check (simple regex).

POST body now includes `filing_rep_name` + `filing_rep_email` (or both null if checkbox is off).

### B. `NewServiceWizard.tsx` Step 2 ("Add people")

Add a "+ Create new profile" button next to the search input.

```tsx
<div className="flex gap-2">
  <input
    type="text"
    placeholder="Search profiles by name or email…"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    className="flex-1 …"
  />
  <Button
    variant="outline"
    onClick={() => setCreateOpen(true)}
    className="shrink-0"
  >
    <Plus className="h-4 w-4 mr-1" />
    Create new
  </Button>
</div>

<CreateProfileDialog
  open={createOpen}
  onClose={() => setCreateOpen(false)}
  onCreated={(newProfileId) => {
    setCreateOpen(false);
    // Re-fetch profiles list and auto-add the new one with default role:
    refreshProfiles().then(() => {
      const newProfile = profiles.find((p) => p.id === newProfileId);
      if (newProfile) onAdd(newProfile);
    });
  }}
/>
```

The `onCreated` callback closes the dialog, re-fetches the profiles list to include the new one, and auto-adds the newly-created profile to the wizard's selected list with the default role.

### C. AddDirector modal on service detail page (`ServiceDetailClient.tsx`)

The "Or create new" section currently has Individual / Corporation radio + name + email. Add:

1. **`is_representative` checkbox** with the same "no KYC required" copy from CreateProfileDialog.
2. **`due_diligence_level` dropdown** (SDD / CDD / EDD), default CDD.
3. **`Filed by a representative` checkbox** with the same affordance as CreateProfileDialog above.

The modal's `handleSubmit()` posts to `POST /api/admin/services/[id]/roles` with the additional body keys.

### Verification (Batch 3)

Manual:
1. Open `/admin/profiles` → click Create Profile → fill name + email → check "Filed by a representative" → enter rep name + email → Create.
2. Check Supabase: profile created with `filing_rep_name` + `filing_rep_email` populated. Resend log shows the invite email.
3. Try to submit with the checkbox on but one field empty → validation error.
4. Open `/admin/services/new` (or click "New Service") → Step 2 → "+ Create new" button → CreateProfileDialog opens → create → confirm the new profile is auto-added to the wizard's selected list with the default role.
5. On a service detail page → People & KYC → "+ Add Director" → Or create new → check `is_representative` + `Filed by a representative` → confirm the form behaves identically to CreateProfileDialog.

### Commit message (Batch 3)

```
feat: filing rep affordance on profile-create flows (B-131)

Adds "Filed by a representative" checkbox + rep name/email
fields to CreateProfileDialog, the NewServiceWizard Step 2
(via "+ Create new" button mounting CreateProfileDialog), and
the AddDirector modal on service detail. AddDirector also gains
is_representative + due_diligence_level for parity with
CreateProfileDialog. Validation: rep name + email required
together when the checkbox is on; email format check; clean
mutual exclusivity.
```

---

## Batch 4 — Client portal: "Filings on behalf of" section on `/dashboard`

### Update `src/app/(client)/dashboard/page.tsx` (or wherever the client dashboard renders)

Add a query at the top: fetch every `client_profiles` row where `lower(filing_rep_email) = lower(session.user.email)`. For each, also pull the services it's attached to via `profile_service_roles`.

```ts
const { data: filingFor } = await supabase
  .from("client_profiles")
  .select(`
    id, full_name, record_type, due_diligence_level,
    profile_service_roles!inner(
      role,
      services!inner(id, service_number, status, service_templates(name))
    )
  `)
  .ilike("filing_rep_email", session.user.email);
```

Render a new section on the dashboard, ABOVE the user's own applications list (or as its own card depending on layout):

```tsx
{filingFor && filingFor.length > 0 && (
  <section className="mb-6">
    <h2 className="text-base font-semibold text-brand-navy mb-2">
      Filings on behalf of
    </h2>
    <p className="text-xs text-gray-500 mb-3">
      You've been designated as the filing representative for the following directors. Click any to complete their KYC paperwork.
    </p>
    <div className="space-y-2">
      {filingFor.map((profile) => (
        <Link
          key={profile.id}
          href={`/filings/${profile.id}`}
          className="block p-4 bg-white border rounded-xl hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{profile.full_name}</p>
              <p className="text-xs text-gray-500">
                {profile.profile_service_roles
                  .map((r) => `${r.services.service_number} (${r.role})`)
                  .join(" · ")}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        </Link>
      ))}
    </div>
  </section>
)}
```

If `filingFor` is empty, the section doesn't render. Existing dashboard sections stay unchanged.

### Verification (Batch 4)

Manual:
1. Log in as the rep (john.doe@example.com from Batch 2's test).
2. Land on `/dashboard`. The "Filings on behalf of" section appears above any other dashboard content, listing the director(s) you're a rep for + their service numbers.
3. Click a row → routes to `/filings/[profileId]` (Batch 5 builds this).
4. Log in as someone who isn't a filing rep → section doesn't appear at all.

### Commit message (Batch 4)

```
feat: "Filings on behalf of" section on /dashboard (B-131)

Client dashboard now queries client_profiles where filing_rep_email
matches session.user.email (case-insensitive via ilike + functional
index on lower(filing_rep_email)). For each match, lists the
director name, their service numbers, and the role. Click → routes
to /filings/[profileId] for KYC editing. Section hides when empty.
```

---

## Batch 5 — `/filings/[profileId]` route: rep-facing KYC editor

### New route: `src/app/(client)/filings/[profileId]/page.tsx`

Server component. Server-side checks:

1. Caller must be authenticated.
2. Load the profile by id.
3. **Authorization check**: `lower(profile.filing_rep_email) === lower(session.user.email)`. If not, return 403 (redirect to `/dashboard` with an error toast OR a dedicated "You don't have access" page).
4. Render the KYC long form for that profile.

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { KycLongForm } from "@/components/kyc/KycLongForm"; // existing component

export default async function FilingPage({ params }: { params: Promise<{ profileId: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { profileId } = await params;
  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("client_profiles")
    .select("id, full_name, filing_rep_email, client_profile_kyc(*)")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) redirect("/dashboard");
  if (profile.filing_rep_email?.toLowerCase() !== session.user.email?.toLowerCase()) {
    redirect("/dashboard?error=not-a-filing-rep");
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold text-brand-navy">
          Filing KYC for {profile.full_name}
        </h1>
        <p className="text-xs text-gray-500">
          You're completing this on behalf of {profile.full_name}.
        </p>
      </header>
      <KycLongForm
        profileId={profile.id}
        initialKyc={profile.client_profile_kyc?.[0] ?? null}
        // Pass a "mode" prop so the form knows it's rep-driven, not self-driven.
        // The save endpoint stays the same — backend trusts the route-level
        // authorization (we verified above).
        savedByRep
      />
    </div>
  );
}
```

### Save endpoint authorization

The existing KYC save endpoint (probably `POST /api/profiles/kyc/save` or similar — CLI: grep for the existing client-side KYC save call) needs to accept rep-driven saves. The route should:

1. Validate the session.
2. Load the profile by `profile_id` in the body.
3. Allow the save if **EITHER**:
   - `profile.email == session.user.email` (the director themselves), OR
   - `profile.filing_rep_email == session.user.email` (the rep).
4. Reject otherwise (403).

The audit_log entry on the resulting KYC update should capture the actual saver (`session.user.id`) so we can tell rep-driven changes from self-driven changes later.

### Verification (Batch 5)

Manual:
1. As the rep, click into a director from the "Filings on behalf of" section.
2. Land on `/filings/[profileId]` → KYC form renders with the director's existing data (if any).
3. Edit a field, click save → confirm the update persists (refresh the page; field stays edited).
4. As an unrelated user (e.g. log out, log in as a different client), try to navigate directly to `/filings/<that-profile-id>` → redirected to `/dashboard?error=not-a-filing-rep`.
5. Audit log: confirm the KYC update entry shows the rep's user_id as actor (not the director's).

### Commit message (Batch 5)

```
feat: /filings/[profileId] — rep-facing KYC editor (B-131)

New route renders the existing KycLongForm for a profile, gated
on "session.user.email matches profile.filing_rep_email". Save
endpoint authorization extended to accept rep-driven saves
(audit_log captures the actual saver's user_id, not the
director's). Direct navigation by anyone else 403s back to
/dashboard with a toast.
```

---

## Batch 6 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-131 — Inline profile create + filing rep delegation (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Rep notifications — when a filing rep edits a director's KYC, the director isn't pinged. If we later want 'your rep just updated your KYC, here's what changed' email + audit, that's a follow-up brief. Estimate: ~2 hours; new brief when needed."
- **Add new Open entry**: "Multiple filing reps per director — B-131 supports one rep per profile (two columns). If a need arises for joint reps (two lawyers, primary + backup), add a junction table `client_profile_filing_reps`. Estimate: ~half-day."
- **Add new Open entry**: "Rep can only edit KYC, not other surfaces — filing reps cannot manage milestones, see audit trail, add other directors, etc. If clients want a broader rep delegation (full power-of-attorney), expand the rep auth pattern across more routes. Estimate: 1-2 days."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write, commit + push file, `db:push`, `db:status`, CHANGES.md.
2. **Per-batch commits:** six commits. Stage by filename — never `git add .` or `git add -A`.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- One rep per director, not multiple.
- Rep access scoped to KYC long form only — no milestones, no service-wide actions.
- No notification to the director when rep edits their KYC.
- No formal "revoke rep" workflow — just edit `filing_rep_email` to null or a new value.
- No bulk-assign filing rep across many directors at once.
