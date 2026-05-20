# B-142 — Resolve reviewer / requester names from `users`, not legacy `profiles`

## Why

The "Review request" detail dialog renders **"Unknown"** under REVIEWERS when the reviewer is an admin created via the modern invite flow. Root cause: the hydration code queries the legacy `public.profiles` table to resolve admin user_ids → display names, but those admins only exist in `public.users` (per B-127's auth refactor).

This is the same class of bug B-138 fixed for the FK constraint side. B-138 fixed the WRITE path (insertions to `review_request_reviewers.admin_id` against the new `users(id)` FK). B-142 fixes the READ path (the name lookup that hydrates the API response).

The "Requested by you" line in the dialog already works because the UI compares `requester_id === currentUserId` directly without needing the lookup. The bug only manifests for reviewers AND for closers who aren't the current viewer.

## Out of scope (do NOT do in B-142)

- **Don't touch the auth fallback at `src/lib/auth.ts:41`** — the NextAuth credentials provider intentionally falls back to `profiles` when a user isn't in `users` yet. Leave alone.
- **Don't touch the invite-mirror writes at `src/lib/filing-rep-invite.ts:67`, `src/app/api/admin/admins/route.ts:110`** — these intentionally write to BOTH `users` AND `profiles` to keep the auth fallback path working. Leave alone.
- **Don't touch the legacy client-create / client-delete flows in `src/app/api/admin/create-client/route.ts` and `src/app/api/admin/clients/[id]/delete/route.ts`** — those are part of the deprecated `clients` + `client_users` flow that's being retired via a separate sweep. Out of scope here.
- **No schema changes** — the data is in `users`; we just need to query the right table.

---

## Batch 1 — Repoint the three name-lookup queries

### File 1: `src/lib/review-requests/hydrate.ts` (line ~55)

The `profileLookup` map is populated from `profiles`:

```ts
const { data: profiles } = await supabase
  .from("profiles")                              // ← legacy
  .select("id, full_name, email")
  .in("id", Array.from(actorIds));
```

Change to `users`. The columns (`id`, `full_name`, `email`) all exist on `public.users` with the same names and types.

```ts
const { data: profiles } = await supabase
  .from("users")                                 // ← repointed
  .select("id, full_name, email")
  .in("id", Array.from(actorIds));
```

No other changes in this file. The variable can stay named `profiles` / `profileLookup` (cosmetic — renaming is bigger surgery; leave for a separate cleanup).

### File 2: `src/app/api/admin/services/[id]/review-requests/route.ts` (line ~213)

CLI reads the file to confirm the context. Likely the same shape — a `from("profiles")` to resolve actor names for the response. Apply the same `users` repoint.

If the query is for a different purpose (e.g., a write or an audit-fallback that's intentional), leave it alone and document why in the commit message.

### File 3: `src/app/api/admin/services/[id]/review-requests/[requestId]/close/route.ts` (line ~141)

Same — read the surrounding context to confirm it's a name lookup, then repoint to `users`.

### Verification (Batch 1)

```bash
npm run build
npm run lint
```

Manual:
1. As an admin, request a peer review on a service and pick another admin as the reviewer.
2. Open the review request detail dialog (eye icon in the right-rail Peer / Manager Review card).
3. The REVIEWERS section should now show the actual reviewer's name (e.g. "Tony Stark") — NOT "Unknown".
4. Close the request via the "Close request" button. Re-open from the closed-history view.
5. The "Force-closed by [name]" line should resolve to the closer's actual name.
6. Repeat with an admin who only exists in `users` (e.g. one created via your SQL-only Super User path) — confirm their name still resolves correctly.

### Commit message (Batch 1)

```
fix: review-request name lookup reads users, not legacy profiles (B-142)

review_request hydration + the create/close response paths queried
the legacy public.profiles table to resolve admin user_ids → names.
Admins created via the modern invite flow (or the SQL-only Super
User path) exist in public.users only, so the lookup missed and
the UI rendered "Unknown" in the reviewers list / closed-by line.

Three call sites updated to .from("users") instead:
- src/lib/review-requests/hydrate.ts
- src/app/api/admin/services/[id]/review-requests/route.ts
- src/app/api/admin/services/[id]/review-requests/[requestId]/close/route.ts

Columns (id, full_name, email) are identical between users and
profiles, so the queries are otherwise unchanged. The auth-fallback
read at src/lib/auth.ts is left alone (it's intentional). The
invite-mirror writes at filing-rep-invite + admins/route are also
left alone (they keep auth fallback working).
```

---

## Batch 2 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-142 — Reviewer name lookup repointed to users (done YYYY-MM-DD)`. One-liner; references B-138 as the sibling fix.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Audit remaining read-side `profiles` queries for the same legacy-lookup pattern. B-138 + B-142 fix the FK write side + the visible reviewer-name read side. There may be other admin-name displays (audit-log actor names, communications-dialog recipient picker, etc.) that also query profiles instead of users and silently render 'Unknown'. Estimate: ~half-day grep + fix sweep; new brief when one surfaces."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure query change.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No auth.ts changes.
- No invite-mirror write changes (they keep auth-fallback working).
- No legacy client create/delete touched (separate sweep).
- No variable rename (`profileLookup` stays — cosmetic only).
