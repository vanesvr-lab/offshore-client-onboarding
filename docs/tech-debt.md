# Tech Debt Log

Items deferred during brief work — small fixes / cleanups that didn't justify a
dedicated brief but shouldn't be lost. Each entry: date added, brief that spawned
it, one-line description, and a brief note on why it was deferred.

Newest items at the top. Strike-through (`~~…~~`) when resolved, then optionally
remove after 30 days.

---

## 2026-05-13

- **`address` is duplicated between `client_profiles` and `client_profile_kyc`.**
  *Spawned by:* [B-104](cli-brief-address-save-true-fix-b104.md).
  *What:* Both tables carry an `address` column. B-104 makes `/api/admin/profiles/[id]/kyc-fields` dual-write to keep them in sync from the admin save endpoint. Other writers (the legacy `verify-code` magic-link flow at `src/app/api/kyc/verify-code/route.ts`, the client wizard auto-save at `/api/services/[id]/persons/[personId]/route.ts`, and any direct DB updates) may still only touch one column — verify and plug any remaining single-side writers before consolidating. **Plan to consolidate:** pick one column as canonical (likely `client_profiles.address` since it's already the contact-info layer), backfill from the other, drop the duplicate, remove the dual-write logic in the kyc-fields route. ~2-hour follow-up brief once we confirm no other writers are silently relying on the now-dropped column.
  *Why deferred:* B-104 needed a same-day fix for the admin reset bug. Schema consolidation requires auditing every writer and a migration — out of scope for the immediate fix.

- **`ServiceDetailClient.tsx` is now dual-purpose.**
  *Spawned by:* [B-102](cli-brief-review-wizard-b102.md).
  *What:* B-102 added `reviewMode` + `reviewStep` props so the same component drives both the scroll page and the Review Wizard. The single-file size keeps creeping (now ~4700 lines). Next time we touch this file structurally, extract each step's section JSX (`ServiceCompanySetupSection`, `ServiceFinancialSection`, `ServiceBankingSection`, `ServicePeopleKycSection`, `ServiceDocumentsSection`) into standalone components and have both surfaces mount them by name. That collapses `reviewMode` into a layout-only concern.
  *Why deferred:* The wizard ships today by reusing the existing component with conditional rendering — clean separation requires a multi-hour refactor that doesn't add user-visible value yet.

- **Wizard "Mark Profile Reviewed" doesn't write a per-profile row.**
  *Spawned by:* [B-102](cli-brief-review-wizard-b102.md).
  *What:* In the People & KYC sub-step, clicking "Mark Profile Reviewed" runs the same `section_key=people` POST as the list view (since no per-profile section_key exists today) and then advances to the next profile. Per-section reviews inside the profile card remain the source of truth for individual KYC sections. Add a `profile_${id}` (or column-typed `subject_id` per tech-debt #26) section_key once Vanessa wants per-profile aggregate tracking.
  *Why deferred:* The brief said "per-profile subject_id per the existing pattern" — but no per-profile pattern exists yet. Shipping a placeholder schema would prejudge a real design.

- **No UI to restore removed profiles.**
  *Spawned by:* [B-101](cli-brief-account-brand-and-chatbot-b101.md).
  *What:* B-101 batch 3 ships soft-delete (`service_profile_removals`) with no admin-facing restore button. Removed profiles stay in the table so restoration is a single SQL DELETE on `(service_id, client_profile_id)` if needed. Add a "Removed people (N)" collapsible at the bottom of People & KYC with one-click restore once Vanessa needs it.
  *Why deferred:* Re-adding the profile via the existing "Add profile" flow already restores them functionally (their `profile_service_roles` rows stay intact, so role assignments come back). Only blocker is the UX needs to know they were previously here — not load-bearing yet.

- **Client account settings page (`/account`) is missing.**
  *Spawned by:* [B-101](cli-brief-account-brand-and-chatbot-b101.md).
  *What:* B-101 batch 4 ships admin-only at `/admin/account`. Mirror the same three-card UX at `/account` for client users when the demand surfaces. Underlying API endpoints (`/api/admin/account/*`) can be generalised to `/api/account/*` and gated by `session.user.role` at call time.
  *Why deferred:* Admins were the immediate need (Vanessa wanted to set her own picture). Clients can rely on Auth.js's set-password reset flow for password changes today.

- **Chatbot widget has no backend.**
  *Spawned by:* [B-101](cli-brief-account-brand-and-chatbot-b101.md).
  *What:* B-101 batch 6 ships UI-only. Future: wire to Anthropic Claude with form-context awareness (current page, current profile, KYC section being viewed) and a knowledge-base RAG over our existing `knowledge_base` content. Placeholder copy explicitly says "coming soon" so the disabled input is on-message.
  *Why deferred:* Out of scope for this brief — the UI surface is the commitment-to-come.

- **Brand logo file (`public/brand-logo.png`) hookup is hardcoded to PNG.**
  *Spawned by:* [B-101](cli-brief-account-brand-and-chatbot-b101.md).
  *What:* `BrandMark.tsx` reads `/brand-logo.png` only. If the brand asset ever moves to SVG, swap the extension in one place. The `onError` fallback to lucide `Landmark` keeps the layout intact if the file goes missing. Low-priority.
  *Why deferred:* Current asset is a 1536×1024 PNG. SVG would also remove the next/image roundtrip and shrink first-paint payload. Bundle that into the next brand polish pass.

- **Two parallel country lists in the codebase.**
  *Spawned by:* [B-100](cli-brief-waive-docs-and-local-director-b100.md).
  *What:* `src/components/shared/MultiSelectCountry.tsx` still exports a name-only `COUNTRIES` array, used wherever a free-text country tag list is acceptable (geographical area fields, etc.). The new ISO3 list at `src/lib/constants/countries.ts` powers `CountrySelect`. Unify when there's a real need to query "all profiles in Mauritius" across both fields.
  *Why deferred:* Multi-select country values aren't queryable on their own today — they're tags. Migrating would force every legacy "United Kingdom" → "GBR" backfill across a multi-string column with no validation guarantees. Defer until a Real Need surfaces.

- **`passport_country` / `nationality` / `jurisdiction_*` columns aren't constrained to ISO3.**
  *Spawned by:* [B-100](cli-brief-waive-docs-and-local-director-b100.md).
  *What:* After backfill + UI-only writes, add `CHECK (passport_country IS NULL OR passport_country ~ '^[A-Z]{3}$')` and analogous constraints on `nationality`, `jurisdiction_incorporated`, `jurisdiction_tax_residence` so the DB rejects future free-form values. Same for any other country column we missed.
  *Why deferred:* B-100 left two pre-backfill rows that match because the only existing values were already `"MUS"` and `"CITIZEN OF MAURITIUS"` (the latter migrated to MUS). But the CountrySelect's "(legacy)" tag still allows free-form values from older code paths. Add the constraint after a clean run with no legacy tag observed.

- **Local Director check is client-side only.**
  *Spawned by:* [B-100](cli-brief-waive-docs-and-local-director-b100.md).
  *What:* Today the indicator is derived inline in `ServiceDetailClient.tsx` from `kyc.passport_country === "MUS"` and `combinedRoles.includes("director")`. If a future need lands ("show me all local directors", a reportable list, a filter on the services list), hoist to a SQL view that joins `client_profile_kyc + profile_service_roles` and exposes a boolean.
  *Why deferred:* Single-surface feature today. View + RLS work doesn't pay off until there's a second consumer.

---

## 2026-05-12

- **Audit `previous_value` / `new_value` payloads are inconsistent across routes.**
  *Spawned by:* [B-095](cli-brief-audit-coverage-sweep-b095.md).
  *What:* Each route added in B-095 captures `previous_value` / `new_value`
  based on the developer's judgment of which fields are interesting for that
  mutation. There's no shared utility for "diff this record's fields and write
  a snapshot". Audit consumers (compliance review, future analytics) would
  benefit from a uniform convention — probably a small
  `buildAuditDiff(before, after, fields)` helper.
  *Why deferred:* B-095 is already a large brief covering ~37 routes. The
  current ad-hoc snapshots are good enough for the audit trail UI; a future
  brief can introduce the helper and refactor each call site.

- **Admin routes don't set `app.actor_*` session config before mutations.**
  *Spawned by:* [B-094](cli-brief-audit-actor-name-b094.md).
  *What:* Add a small `setActorContext(supabase, session)` helper and call it at the top of every admin API route that uses `createAdminClient()` and performs a mutation that may fire a DB-side audit trigger. Today no service-table trigger writes audit_log, so the hardened `get_actor_info()` from this brief is purely defensive — but if a future migration adds a status-change trigger on `services` (or similar), admin routes will need to push the actor identity into the session config or those audits will revert to `'system'`.
  *Why deferred:* Currently unused — the app-layer `writeAuditLog` fix covers the symptom Vanessa observed. The session-config plumbing is a future-proofing layer; deferred to keep B-094 small.

- **Denormalise status-change actor + timestamp onto `services`.**
  *Spawned by:* [B-093](cli-brief-status-card-redesign-b093.md).
  *What:* Add `status_changed_at TIMESTAMPTZ` and `status_changed_by UUID` columns to `services`, populate via the existing audit trigger (or a new one) on every status update. Read these in `page.tsx` instead of running a separate `audit_log` query for the right-rail Status card.
  *Why deferred:* B-093 ships with an audit-log query — works, just one extra query per page render. Migration + trigger update is a separate change to keep B-093 small.

---
