# CLI Brief — B-101 Stage Strip + Uploaded Filter + Soft-Delete Profile + Admin Account Settings + Brand Refresh + Chatbot Placeholder

**Status:** Ready for CLI (no hold)
**Estimated batches:** 6
**Touches migrations:** Yes (Batches 3 + 4)
**Touches AI verification:** No
**Touches API:** Yes (Batches 3 + 4)
**Builds on:** B-098 (stage chain), B-099 (stage strip font 14), B-100 (waive docs / Local Director / ISO3 country / Section review tooltip)

---

## Pre-flight check

Run `git pull origin main` first. Confirm the B-100 feat commits are on `origin/main`:

```bash
git log --oneline -6
```

Should show `6301a62 feat: ISO3 country dropdown + AI extractor + Local Director badge on profile header` near the top. If not, stop and tell Vanessa.

---

## Why this batch exists

Six independent improvements stacked into one brief — separate commits per batch:

1. **Stage strip: Start chevron same width as the others.** B-099 narrowed `Start` to `flex-[0.55]` so the longer labels (`Document Collection`, `Verification & Screening`, `Risk Assessment`) could fit at `fontSize=14`. Vanessa wants uniform widths. Trade-off accepted: drop `fontSize` from 14 → 12 so every label still fits at equal width.
2. **Add "Uploaded" option to the KYC Documents status filter.** Today's filter dropdown is `All / Valid / Expired / Never expires / Missing / Waived`. Add a new `Uploaded` option that matches any row whose `expiryStatus` is one of `valid`, `expired`, or `never_expires` (i.e. there's an upload). Keep existing options in place; just add `Uploaded` as the second item under `All`.
3. **Soft-delete profile from service.** Admin can remove a profile from a service. Removed profiles disappear from the page entirely. Soft-delete (new `service_profile_removals` table) preserves the audit trail and lets `profile_service_roles` stay intact, so future re-add restores the role assignments cleanly. No UI for restoration — tech-debt entry below.
4. **Admin account settings page** at `/admin/account`. Admin can: upload a profile picture, edit full name, change password (require current password). Stored on `users.avatar_url` + a new public `avatars` Supabase Storage bucket. Sidebar gets an `Account` link. **Admin only** for B-101 — client equivalent is tech-debt.
5. **Logo + role-based portal name.** Sidebar header and auth pages (login/register/set-password) show a small building logo (`public/brand-logo.png`) next to the name. Name format changes by audience:
   - Non-admin viewers see: **"Mauritius Offshore - Client Portal"**
   - Admin viewers see: **"Mauritius Offshore - Admin Portal"**
   - Hyphen with single spaces around it (`<space>-<space>`)
   Email headers stay on the original "Mauritius Offshore Client Portal" wording (emails only go to clients).
6. **Chatbot placeholder widget** on both client and admin portals. Floating button bottom-right of every authenticated page → slide-in panel from the right → static welcome message + disabled input ("AI assistance coming soon"). No backend wiring in this brief — just the surface so it ships as a visible commitment to come.

---

## Hard rules

1. **Six batches, six commits.** After each batch: stage specific files → commit → `git push origin HEAD:main` (worktree → main, never `git push origin main`) → update `CHANGES.md` with one sub-entry under `## B-101` → move to the next batch. Never bundle.
2. `npm run build` must pass after each batch.
3. **Migrations** (Batches 3 + 4): place the migration in `supabase/migrations/<timestamp>_*.sql`, then `npm run db:push`, then `npm run db:status`. If `db:status` shows drift, stop and document in CHANGES.md.
4. **Don't restart the dev server.** Vanessa runs the restart pattern from the main project dir.
5. **No `as any`.** Cast via `unknown` first if Supabase inference falls over.
6. **No batch ID in commit messages** (CLAUDE.md rule). Batch references live in CHANGES.md only.
7. **Brand logo file**: Before Batch 5, check whether `public/brand-logo.png` exists. If yes, use it. If no, fall back to a lucide `Landmark` icon in the same slot — Vanessa will drop the file in later and the same component will read it without changes.

---

## Batch 1 — Stage strip: uniform width + font 12

**File:** [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) around line 3496–3520.

Two single-line changes:

- Change `className={\`relative ${step === "start" ? "flex-[0.55]" : "flex-1"}\`}` to `className="relative flex-1"` (drop the conditional entirely).
- Change `fontSize="14"` to `fontSize="12"` on the `<text>` element a few lines below.

Update the inline comment to: `B-101 — fontSize 14 → 12 so all 8 chevrons fit at equal width; Start matches the rest.`

**Commit:** `fix: stage strip Start chevron matches other widths (font 12 keeps labels readable)`

CHANGES.md entry under `## B-101` → batch 1.

---

## Batch 2 — KYC Documents filter: add "Uploaded"

**File:** [`src/components/admin/KycDocumentsTable.tsx`](src/components/admin/KycDocumentsTable.tsx).

1. Extend the `StatusFilter` union type at line 45:

```ts
type StatusFilter = "all" | "uploaded" | "valid" | "expired" | "never_expires" | "missing" | "waived";
```

2. Add the new option in the filter dropdown (line ~400, second `<option>` after "All"):

```tsx
<option value="all">All</option>
<option value="uploaded">Uploaded</option>
<option value="valid">Valid</option>
…
```

3. Extend the `filtered` memo (~line 171) so `uploaded` matches any row whose `expiryStatus` is one of `valid` / `expired` / `never_expires`:

```ts
if (statusFilter === "uploaded") {
  return ["valid", "expired", "never_expires"].includes(r.expiryStatus);
}
// other branches stay as-is
```

**Commit:** `feat: KYC documents filter adds Uploaded option (groups valid/expired/never_expires)`

CHANGES.md entry under `## B-101` → batch 2.

---

## Batch 3 — Soft-delete profile from service

**Goal:** Admin clicks an action on a profile card → confirm modal → POST → profile disappears from the People & KYC accordion + the KYC Documents table + the per-profile review summary. Underlying `profile_service_roles` rows stay intact so re-adding the profile to the service restores roles automatically.

### Step 3.1 — Migration: `service_profile_removals`

File: `supabase/migrations/<timestamp>_service_profile_removals.sql` (generate with `npx supabase migration new service_profile_removals`).

```sql
CREATE TABLE IF NOT EXISTS service_profile_removals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id) ON DELETE CASCADE,
  removed_at timestamptz NOT NULL DEFAULT now(),
  removed_by uuid NOT NULL REFERENCES users(id),
  UNIQUE (service_id, client_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_spr_service ON service_profile_removals(service_id);
CREATE INDEX IF NOT EXISTS idx_spr_profile ON service_profile_removals(client_profile_id);

ALTER TABLE service_profile_removals ENABLE ROW LEVEL SECURITY;
-- Service-role-only access, mirroring waived_document_requirements from B-100.
```

Run `npm run db:push` + `npm run db:status` immediately after writing.

### Step 3.2 — API route

Create [`src/app/api/admin/services/[id]/profiles/[profileId]/remove/route.ts`](src/app/api/admin/services/[id]/profiles/[profileId]/remove/route.ts):

- `POST` — upsert a row into `service_profile_removals` for `(service_id, client_profile_id)`. Write `audit_log` with `action_type = "profile_removed_from_service"`, `target_type = "client_profile"`, `target_id = profileId`, `metadata = { service_id }`. Return `{ ok: true }`.
- Auth: admin_users only (mirror the pattern from `waive-document/route.ts`).

### Step 3.3 — Server-side filter

The service detail page loads `roleRows` (the profile-service-role rows that drive the People & KYC section). Find the source query — most likely in [`src/app/(admin)/admin/services/[id]/page.tsx`](src/app/(admin)/admin/services/[id]/page.tsx). After fetching, query `service_profile_removals` for this service, build a `Set<client_profile_id>`, and **drop** any row whose `client_profiles.id` is in that set before passing to `ServiceDetailClient`.

The same filter must apply to:
- The People & KYC accordion (already covered by filtering roleRows)
- The KYC Documents tab data source — find where its `rows` prop is computed and filter the same way
- The per-profile review summary panel (`PerProfileReviewSummaryPanel`) — same filter
- The waived_document_requirements join (waivers for removed profiles should also disappear from the UI — they stay in the DB)

Hide removed profiles entirely. No "Show removed (N)" toggle — Vanessa explicitly said don't show.

### Step 3.4 — Admin UI: Remove action

Inside the profile card in People & KYC (find the component by grepping `combinedRoles` + `roleLabels` — it's a section of `ServiceDetailClient.tsx` around line 1955–2020 based on B-100), add a "Remove from service" action. Placement:

- Add a small kebab/overflow menu (or a discreet `Remove` button) in the top-right of the *expanded* profile card header — alongside the role chips area. Don't put it on the collapsed strip; we want a deliberate two-step (expand → remove).
- Click → confirm dialog (`src/components/ui/dialog.tsx`):
  - Title: `Remove this profile from the service?`
  - Body: `The profile will no longer appear under People & KYC for this service. Their role assignments stay saved and can be restored by adding them back. This action is recorded in the audit log.`
  - Primary action: `Remove` (destructive variant — red)
  - Secondary: `Cancel`
- On confirm → POST → optimistically remove the card from the list (don't `router.refresh()`; just splice locally and trigger a soft re-fetch in the background to stay consistent).

### Step 3.5 — Commit + push + CHANGES.md

```
feat: admin can soft-delete profile from service (audit logged, role assignments preserved)
```

CHANGES.md entry under `## B-101` → batch 3, mention the migration filename + `db:push`/`db:status` clean.

---

## Batch 4 — Admin account settings page

**Goal:** New page at `/admin/account` where the admin can update their profile picture, full name, and password.

### Step 4.1 — Migration: `avatar_url` + `avatars` bucket

File: `supabase/migrations/<timestamp>_user_avatar_and_bucket.sql`.

```sql
-- avatar_url column on users (nullable, free-form storage path or full URL)
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;

-- Public avatars bucket (avatars are non-PII; public read is fine and removes
-- the signed-URL roundtrip on every page render)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users can upload to their own user_id-prefixed
-- path; anyone can read (bucket is public).
CREATE POLICY IF NOT EXISTS "Anyone can read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY IF NOT EXISTS "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY IF NOT EXISTS "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

Note: this app's auth is Auth.js, not Supabase Auth, so `auth.uid()` won't resolve from a client-side write. **All avatar writes go through the server-side API route below using the service-role client**, which bypasses RLS. The policies above are defensive guard rails for any future direct-from-browser write that we haven't planned. Keep them.

Run `npm run db:push` + `npm run db:status`.

### Step 4.2 — API routes

Create [`src/app/api/admin/account/route.ts`](src/app/api/admin/account/route.ts):

- `GET` — returns current admin's `{ id, full_name, email, avatar_url }`. Auth: must be in `admin_users`.
- `PATCH` — accepts `{ full_name?: string }` → updates `users.full_name` → returns updated record. Audit-log `account_profile_updated`.

Create [`src/app/api/admin/account/avatar/route.ts`](src/app/api/admin/account/avatar/route.ts):

- `POST` — multipart form upload (use `request.formData()`). Validate: must be image MIME (`image/png`, `image/jpeg`, `image/webp`), max 2 MB. Compute storage path `${user_id}/${randomId}.${ext}`. Upload to `avatars` bucket via service-role client. Update `users.avatar_url` to the public URL. Return `{ avatar_url }`.
- `DELETE` — clear `users.avatar_url`, remove the underlying storage object (best-effort).
- Audit-log `account_avatar_updated` / `account_avatar_removed`.

Create [`src/app/api/admin/account/password/route.ts`](src/app/api/admin/account/password/route.ts):

- `POST` — accepts `{ current_password: string, new_password: string }`. Look up the admin's current `password_hash` from `users`. Use `bcrypt.compare(current_password, hash)` — if false, return `400 { error: "Current password is incorrect" }`. Validate new password: min 8 chars (match whatever rule lives in `set-password/page.tsx`). Hash with `bcrypt.hash(new_password, 10)` and persist. Audit-log `account_password_changed`.

### Step 4.3 — Page UI

Create [`src/app/(admin)/admin/account/page.tsx`](src/app/(admin)/admin/account/page.tsx) (server component shell) + `AccountSettingsClient.tsx` (client component with the form).

Layout: three cards stacked, plenty of whitespace, max-width `max-w-2xl mx-auto`:

1. **Profile picture card** — current avatar (circle, 96px) on the left, "Upload new picture" button + "Remove picture" link on the right. Drag-and-drop optional; file input fallback always available. Show error toast on failed upload (oversize, wrong MIME).
2. **Profile details card** — `Full name` input. Email shown as read-only (changing email is out of scope). `Save` button bottom-right, disabled until dirty.
3. **Change password card** — `Current password`, `New password`, `Confirm new password` inputs (all type=password). `Change password` button bottom-right, disabled until all three filled + new matches confirm. Show clear inline errors for "Current password is incorrect" and "Passwords don't match".

### Step 4.4 — Sidebar entry

[`src/components/shared/Sidebar.tsx`](src/components/shared/Sidebar.tsx). Add an `Account` nav item near the bottom (above sign-out), with a `UserCircle` lucide icon. Only render for admins (the sidebar already handles role variants — check existing pattern).

If the current admin has an `avatar_url`, render a tiny version of the avatar inline next to the admin's name in the sidebar footer (existing slot where the name appears). Falls back to the current initials avatar if no `avatar_url`.

### Step 4.5 — Commit + push + CHANGES.md

```
feat: admin account settings page (profile picture, name, password change)
```

CHANGES.md entry under `## B-101` → batch 4. Note: client equivalent is tech-debt.

---

## Batch 5 — Logo + role-based portal name

**Goal:** Logo image next to the portal name. Portal name reads "Mauritius Offshore - Admin Portal" for admins, "Mauritius Offshore - Client Portal" for everyone else.

### Step 5.1 — Brand logo asset

Check whether `public/brand-logo.png` (or `.jpg`/`.svg`) exists. If yes, use it. If no, use a lucide `Landmark` icon in the same slot at the same size. Either way, the visual treatment is a 32×32 (sidebar) / 48×48 (auth pages) container with the logo inside.

Create a small shared component [`src/components/shared/BrandMark.tsx`](src/components/shared/BrandMark.tsx):

```tsx
"use client";
import { Landmark } from "lucide-react";
import Image from "next/image";

interface Props {
  size?: number; // px
  className?: string;
}

export function BrandMark({ size = 32, className }: Props) {
  // Try the asset first; Image's onError swap to lucide is awkward with
  // Next/Image, so just check at module load time whether the public path
  // resolves. Simpler approach: render Image directly. If the file doesn't
  // exist, the alt text shows and we'll see it visually.
  return (
    <Image
      src="/brand-logo.png"
      alt="Mauritius Offshore"
      width={size}
      height={size}
      className={className}
      onError={(e) => {
        // Hide broken image; render Landmark fallback via parent.
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
```

If `public/brand-logo.png` doesn't exist when CLI runs this batch, default to the lucide `<Landmark className="h-8 w-8 text-brand-navy" />` block at every callsite — wrap the BrandMark with a sibling Landmark and toggle via a quick `fs.existsSync` at module level (or just ship the Landmark version and Vanessa will swap once the file lands; the `BrandMark` component is the swap point).

**Recommendation:** ship Landmark fallback in this batch, leave the brand-logo.png hookup as a one-line follow-up edit when the file lands. Simpler than wiring runtime fallback.

### Step 5.2 — Role-based portal name

Helper at [`src/lib/portal-name.ts`](src/lib/portal-name.ts):

```ts
export function portalName(isAdmin: boolean): string {
  return isAdmin ? "Mauritius Offshore - Admin Portal" : "Mauritius Offshore - Client Portal";
}
```

Update the following sites — each uses the helper with the right context:

- [`src/components/shared/Sidebar.tsx`](src/components/shared/Sidebar.tsx) lines 150–152: split "Mauritius Offshore" + "Client Portal" into one expression using `portalName(isAdmin)`. The sidebar already knows the role variant — pass that in or read from session.
- [`src/components/shared/Header.tsx`](src/components/shared/Header.tsx) line 46
- [`src/components/shared/Navbar.tsx`](src/components/shared/Navbar.tsx) line 27 (this one is dead per tech-debt #7, but update for consistency anyway since it's a one-line change)
- [`src/app/(auth)/login/page.tsx`](src/app/(auth)/login/page.tsx) line 86 — always "Mauritius Offshore" on login (we don't know the role yet). Use the literal "Mauritius Offshore - Client Portal" here since most users logging in are clients, OR render just "Mauritius Offshore" without the suffix. Vanessa's call — default to no suffix on login/register/set-password (cleanest).
- [`src/app/(auth)/register/page.tsx`](src/app/(auth)/register/page.tsx) line 144 — same: "Mauritius Offshore" only.
- [`src/app/auth/set-password/page.tsx`](src/app/auth/set-password/page.tsx) lines 58 + 71 — same.
- [`src/app/layout.tsx`](src/app/layout.tsx) line 7 (`metadata.title`) — keep the generic "Mauritius Offshore" or "Mauritius Offshore - Client Portal" since the metadata can't change per request without server logic. Default: `"Mauritius Offshore Portal"`.

Each call-site that has access to a session reads the admin flag from `session.user.role === "admin"` (Auth.js session shape). The auth pages don't have a session, so they render the brand-only string.

### Step 5.3 — Logo placement

Drop a `<BrandMark size={32} />` immediately above the existing text title in Sidebar.tsx. On auth pages, replace the current title block with a centered logo (48px) above the heading.

### Step 5.4 — Commit + push + CHANGES.md

```
feat: brand logo placeholder + role-based portal name (admin vs client)
```

CHANGES.md entry under `## B-101` → batch 5. Note: emails kept the legacy "Mauritius Offshore Client Portal" wording on purpose.

---

## Batch 6 — Chatbot placeholder widget

**Goal:** Floating "AI Assistant" widget visible on every authenticated page in both portals. Placeholder only — no backend.

### Step 6.1 — Component

Create [`src/components/shared/FloatingAssistantWidget.tsx`](src/components/shared/FloatingAssistantWidget.tsx):

- Fixed positioning: `fixed bottom-6 right-6 z-50`
- Closed state: a round button (`h-14 w-14 rounded-full bg-brand-navy text-white shadow-lg`) with a lucide `MessageCircle` icon. Hover scales 1.05.
- Click → opens a slide-in panel anchored to the bottom-right corner:
  - `w-80 max-w-[calc(100vw-3rem)] h-[28rem] bg-white rounded-2xl shadow-2xl border` with subtle entry animation (`transition + translate-y`).
  - Header: brand-navy bar, "AI Assistant" title, `X` close button.
  - Body: a single bot bubble (left-aligned, gray background) with the placeholder copy:
    > Hi! I'm here to help you fill out the form and answer questions about the onboarding process.
    >
    > AI assistance is coming soon — for now, please reach out to support@elarix.io if you need help.
  - Input row at the bottom: a disabled `<textarea>` placeholder text `AI assistance coming soon…`, send button rendered but disabled.
- Persistence: open/closed state in local React state only (no localStorage; resets per page load — fine for a placeholder).

### Step 6.2 — Mount

Mount the widget in both layouts:

- [`src/app/(admin)/layout.tsx`](src/app/(admin)/layout.tsx) — render `<FloatingAssistantWidget />` adjacent to the main content.
- [`src/app/(client)/layout.tsx`](src/app/(client)/layout.tsx) — same.

Do NOT mount in auth layouts (`/login`, `/register`, `/set-password`) — they don't need it.

### Step 6.3 — Commit + push + CHANGES.md

```
feat: floating AI assistant placeholder widget (client + admin portals)
```

CHANGES.md entry under `## B-101` → batch 6. Note explicitly that this is UI-only — no backend wiring.

---

## Acceptance criteria (run before declaring brief done)

- [ ] `npm run build` clean after each batch
- [ ] Stage strip: every chevron is equal width, labels readable at fontSize 12, no clipping at default desktop width
- [ ] KYC Documents filter shows `Uploaded` between `All` and `Valid`; selecting it shows valid + expired + never_expires rows
- [ ] Profile card has a "Remove from service" action; clicking → confirm modal → profile vanishes from People & KYC, KYC Documents, and per-profile review summary; audit_log row `profile_removed_from_service` exists with `service_id` in metadata
- [ ] `/admin/account` page exists with three cards; uploading an avatar persists, name save persists, password change with wrong current password shows the inline error, with correct current password the change succeeds and a subsequent re-login uses the new password
- [ ] Admin's avatar (or initials fallback) is visible in the Sidebar footer
- [ ] Sidebar shows: `[logo] Mauritius Offshore - Admin Portal` when admin is logged in, `[logo] Mauritius Offshore - Client Portal` when a client is logged in
- [ ] Login/register/set-password pages show `[logo] Mauritius Offshore` (no suffix) since role isn't known pre-auth
- [ ] Floating chat button visible bottom-right on every page inside `/admin/*` and `/(client)/*`; clicking opens the panel with the placeholder copy; input is visibly disabled
- [ ] `npm run db:status` clean
- [ ] CHANGES.md has six sub-entries under `## B-101`, one per batch

---

## Tech debt to log

Append to `docs/tech-debt.md` after the final batch:

- **No UI to restore removed profiles** — B-101 batch 3 ships soft-delete with no admin-facing restore button. Removed profiles stay in `service_profile_removals` so restoration is a single SQL DELETE on `(service_id, client_profile_id)` if needed. Add a "Removed people (N)" collapsible at the bottom of People & KYC with one-click restore once Vanessa needs it.
- **Client account settings page** — B-101 batch 4 ships admin-only. Mirror the same three-card UX at `/account` for client users when the demand surfaces. Underlying API endpoints (`/api/admin/account/*`) can be generalized to `/api/account/*` and gated by session role at the time.
- **Chatbot has no backend** — B-101 batch 6 ships UI-only. Future: wire to Anthropic Claude with form-context awareness (current page, current profile, KYC section being viewed) and a knowledge-base RAG over our existing KB. Out of scope for this brief — placeholder copy explicitly says "coming soon".
- **Brand logo file (`public/brand-logo.png`) may not exist when batch 5 runs** — fallback is lucide `Landmark`. When the file is dropped in, no code change needed; the `<Image>` element will resolve. Confirm the file exists post-deploy.

---

## After all six batches

`CHANGES.md` shows six B-101 sub-entries → last `git push origin HEAD:main` → tell Vanessa one line: "B-101 done — six batches on main." Stop.
