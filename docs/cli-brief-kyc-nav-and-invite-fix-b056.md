# B-056 — KYC sidebar redirect + magic-link expired bug

## Why

Two follow-ups discovered after B-055 was queued:

1. **The "KYC Profile" sidebar item lands on a hub page** (`/kyc`,
   rendered by `KycPageClient`) that is now redundant — the per-service
   "People & KYC" view inside the Service wizard is the actual place
   users review and manage KYC.
2. **The magic-link KYC invite returns "expired"/"invalid" immediately
   after being sent.** Real-device QA on a fresh invite sees the error
   within seconds.

Goal: make the sidebar nav route to the right place, and make the
invite link work first try.

## Scope

- **In**: sidebar nav target for `KYC Profile`, the multi-service
  routing rule, the send-invite + verify-code data flow.
- **Out**: the `/kyc` and `KycPageClient` files themselves — they can
  remain in the codebase as a fallback or be deleted by future cleanup.

## Working agreement

Two batches. Bug fix ships first, nav redirect second. Per CLAUDE.md
"Database Migration Workflow", any migration in this brief MUST be
applied via `npm run db:push` and verified with `npm run db:status`
before the batch is considered done.

---

## Batch 1 — Fix the magic-link expired/invalid bug

This bug has two suspected causes. Diagnose first, then fix both.

### 1.1 — Reproduce + diagnose

In a dev environment, run through the actual user path:

1. Admin invites Bruce Banner (or any test person) for one role.
2. Pull the resulting row from `verification_codes` directly:
   ```sql
   select id, email, access_token, code, expires_at, verified_at, created_at
   from verification_codes
   order by created_at desc limit 5;
   ```
3. Confirm `expires_at` is ~72h in the future relative to `now()`.
4. Hit `/kyc/fill/<token>` → enter the code from the email.
5. Watch the network tab. Note exact status code returned by
   `/api/kyc/verify-code` and the response body.

Match the result to one of the suspects below.

### 1.2 — Suspected cause A — same-email DELETE wipes earlier rows

**File**: [`src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts:129-139`](src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts:129)

```ts
await supabase
  .from("verification_codes")
  .delete()
  .eq("email", profile.email);

await supabase.from("verification_codes").insert({ access_token, ... });
```

If the admin invites the same person for multiple roles (Bruce Banner is
Director + Shareholder + UBO), or re-sends to the same email for any
reason, the second send DELETEs the first row. The user clicking the
first email link gets a 404 (token not found) → toast "Invalid or
expired link". Same surface text as the 410 "expired" path.

**Fix**: stop deleting by email. Replace with one of:
- **Option A (preferred)**: replace the DELETE+INSERT with a single UPSERT
  keyed on `(email, client_profile_id)`. Each (person, client_profile)
  pair gets one verification_codes row that's overwritten on resend.
- **Option B**: keep multiple rows per email but never DELETE; just
  INSERT a new row each time. Verify-code already looks up by
  `access_token` (unique), so old rows are harmless. Adds a tiny amount
  of DB cruft but is the smallest diff.

Pick **Option A** — cleaner, prevents unbounded row growth, and aligns
with the "one active invite per person" model.

If `client_profile_id` is not currently a column on
`verification_codes`, add a migration:

```sql
-- supabase/migrations/<YYYYMMDDHHMMSS>_verification_codes_profile_id.sql
ALTER TABLE public.verification_codes
  ADD COLUMN IF NOT EXISTS client_profile_id uuid REFERENCES public.client_profiles(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS verification_codes_email_profile_uq
  ON public.verification_codes (email, client_profile_id)
  WHERE verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_verification_codes_token
  ON public.verification_codes (access_token);
```

The unique-with-WHERE-clause means we still keep historical verified
rows around (in case we want audit), but only one *unverified* row per
(email, profile) is allowed.

After writing the migration: `npm run db:push` then `npm run db:status`
to confirm.

### 1.3 — Suspected cause B — kyc_record_id missing from row

**File**: [`src/app/api/kyc/verify-code/route.ts:34`](src/app/api/kyc/verify-code/route.ts:34)

After successful code entry, line 33-34 reads `vc.kyc_record_id` and
calls `returnKycData(supabase, vc.kyc_record_id)`. But the comment in
send-invite ([line 128](src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts:128))
says: "kyc_record_id omitted — new model uses client_profile_kyc". So
the row is inserted without `kyc_record_id`. The lookup at
`returnKycData → kyc_records.eq('id', null)` returns null → 404 "Profile
not found".

**Fix**: switch verify-code to look up by `client_profile_id` from the
new column (added in 1.2 migration). Add `client_profile_id` to the
send-invite INSERT in 1.2, then update verify-code's `returnKycData`:

```ts
async function returnKycData(supabase, clientProfileId: string) {
  // Look up KYC record(s) for this profile
  const { data: kycRecords } = await supabase
    .from("client_profile_kyc")
    .select("*")
    .eq("client_profile_id", clientProfileId);
  // ... return shape unchanged from caller's perspective
}
```

If the existing KycFillClient relies on the old shape (kycRecord
singular), keep the response shape but populate from the new query.
Either pick the latest kyc_record OR aggregate them — match what the
client actually consumes (read `KycFillClient.tsx` carefully before
choosing).

### 1.4 — Suspected cause C — expires_at timezone

If suspects A and B don't reproduce in the dev DB, check the
`verification_codes.expires_at` column type. If it's `timestamp without
time zone`, Postgres stores naive timestamps and JS `new Date(value)`
parses them in the runtime's local TZ. In production (Vercel = UTC)
this works; in a dev server in Mauritius (UTC+4) it parses 4h earlier
than truth. Unlikely to cause "just-sent → expired" on its own (window
is still many hours), but worth confirming.

**Fix** (only if needed): add a migration converting the column:

```sql
ALTER TABLE public.verification_codes
  ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'UTC';
```

### 1.5 — Verification

- Send a fresh invite to a test email. Open the link within 30 seconds.
  Enter the code. Should reach the KYC form, not the expired page.
- Send a second invite to the SAME email (same person, different role
  if your data model allows multiple roles per profile). Open the
  FIRST email's link → must still work, OR must show a clear "this
  invite was superseded by a newer one" message (not "expired"). If
  Option A (UPSERT) was chosen, the first link is replaced, so it must
  not pretend to still be valid — return a clear 410 with a different
  copy: "Your invite was updated. Please use the latest email."
- Open the SECOND email's link → must work.
- Run `npm run check:migrations` (or whatever the canary command became
  after B-054) and confirm zero drift.

**Commit/push**: `fix: KYC magic-link invite collision + missing profile id`

---

## Batch 2 — KYC sidebar redirects to People & KYC review

After Batch 1, the magic-link flow is fixed. Now reroute the sidebar
nav to the right destination.

### 2.1 — Find the most-recent service per client

Add a helper (or inline server query in the redirect route) that, given
the current session's `clientProfileId`, returns the most recent
`service.id` they manage:

```ts
const { data } = await supabase
  .from("profile_service_roles")
  .select("service_id, services!inner(id, created_at, is_deleted)")
  .eq("client_profile_id", clientProfileId)
  .eq("can_manage", true)
  .eq("services.is_deleted", false)
  .order("services(created_at)", { ascending: false })
  .limit(1)
  .maybeSingle();
const latestServiceId = data?.service_id ?? null;
```

If `latestServiceId` is null, the user has no service yet. Render a
gentle empty state pointing them to `/apply`.

### 2.2 — Update the sidebar nav target

**File**: [`src/components/shared/Sidebar.tsx:130`](src/components/shared/Sidebar.tsx:130)

Currently the nav item points to `/kyc`. Change it to point to a new
redirect route that picks the right destination at request time.

### 2.3 — Add the redirect route

**New file**: `src/app/(client)/kyc-review/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

export default async function KycReviewRedirect() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role === "admin") redirect("/admin/dashboard");

  const tenantId = getTenantId(session);
  const clientProfileId = session.user.clientProfileId;
  if (!clientProfileId) redirect("/dashboard");

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("profile_service_roles")
    .select("service_id, services!inner(id, created_at, is_deleted)")
    .eq("tenant_id", tenantId)
    .eq("client_profile_id", clientProfileId)
    .eq("can_manage", true)
    .eq("services.is_deleted", false)
    .order("services(created_at)", { ascending: false })
    .limit(1)
    .maybeSingle();

  const serviceId = data?.service_id;
  if (!serviceId) redirect("/apply"); // No active service — push them to start one

  // Land on the People & KYC step of the service wizard
  redirect(`/services/${serviceId}?wizardStep=3`);
}
```

The exact `wizardStep` index — verify by reading
`src/app/(client)/services/[id]/ClientServiceDetailClient.tsx:65`
(`SECTION_CONFIG`) — the audit said the People & KYC section is
`stepIndex: 3` but confirm.

If the destination URL pattern uses a different param than `wizardStep`
(e.g., `?startWizard=true&step=3` or path-based), match that. Test the
URL manually before shipping.

### 2.4 — Update the sidebar href

**File**: `src/components/shared/Sidebar.tsx`

Change the KYC Profile nav item's href from `/kyc` to `/kyc-review`. The
label stays "KYC Profile" — that's still meaningful copy for the user.

### 2.5 — Decide what to do with `/kyc`

**Don't delete it** in this batch. Keep `/kyc` accessible by URL but no
longer linked from the sidebar. If users have it bookmarked, they'll
still land somewhere reasonable. A future batch can clean up if it's
truly unused (admin can check Vercel analytics).

Add a tech-debt entry:

```
| 22 | `/kyc` page is orphaned (no inbound link) | Low | KycPageClient still works but no nav points to it post-B-056. Delete the route + component if Vercel analytics shows zero traffic for 30 days. |
```

### 2.6 — Verification

- Click "KYC Profile" in the sidebar as a client with one service →
  lands on `/services/<id>?wizardStep=3` (the People view).
- Same nav as a client with two services → lands on the latest one's
  People view (compare `created_at` in the DB to confirm).
- Same nav as a client with no services → redirects to `/apply` with
  no error.
- `/kyc` still loads if visited directly (KycPageClient renders).

**Commit/push**: `feat: route KYC Profile sidebar to current People & KYC view`

---

## CHANGES.md

Single rollup B-056 entry plus per-batch entries (one paragraph each).
Mention:
- 1 new migration file (verification_codes.client_profile_id) applied
  to prod via `npm run db:push`.
- The DELETE-by-email pattern was the root cause of the "expired"
  reports — replaced with UPSERT-by-(email, client_profile_id).
- New tech-debt entry #22 about the orphaned `/kyc` route.

## CLAUDE.md

If the new redirect route pattern (`(client)/kyc-review/page.tsx` as a
server-side redirect to the right service) becomes a recurring need,
add a "Redirect routes" gotcha. Otherwise no doc update needed.

## Things to flag to the user

- **One DB migration** (verification_codes.client_profile_id). CLI must
  run `npm run db:push` per CLAUDE.md.
- The fix changes the `/kyc/fill/[token]` semantics: a superseded
  invite now shows a clear "your invite was updated" message instead
  of "invalid token". If the admin's existing invitations were already
  collision-broken, those links won't be resurrected — admin will need
  to send fresh invites after this lands.
- If during reproduction CLI finds a third root cause not listed in
  1.2-1.4, document it in CHANGES.md and fix that one specifically;
  don't apply all three fixes blindly.

## Rollback

`git revert` the relevant commit. Migration is additive (new column +
new index) so safe to leave applied even if the app code is reverted.
