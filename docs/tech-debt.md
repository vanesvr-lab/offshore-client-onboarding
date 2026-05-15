# Tech Debt Log

Items deferred during brief work — small fixes / cleanups that didn't justify a
dedicated brief but shouldn't be lost. Each entry: date added, brief that spawned
it, one-line description, and a brief note on why it was deferred.

Newest items at the top. Strike-through (`~~…~~`) when resolved, then optionally
remove after 30 days.

---

## 2026-05-15

- **Review requests can't be re-opened.**
  *Spawned by:* [B-118](cli-brief-peer-manager-review-and-hotfixes-b118.md).
  *What:* Once a `review_requests` row is closed (by a reviewer marking, or by the requester force-closing), there's no API to re-open it. If a requester wants more review on the same scope, they create a new request — the audit log still ties them together via service_id + entity history. Revisit if usage patterns make sequential review thrash awkward.
  *Why deferred:* Single-shared-status is the agreed POC pattern. Re-opening adds branching to the email + audit logic for marginal benefit at this stage.

- **Per-reviewer accountability on a single review request is intentionally absent.**
  *Spawned by:* [B-118](cli-brief-peer-manager-review-and-hotfixes-b118.md).
  *What:* `review_request_reviewers` carries no per-row status — any one invited reviewer marking closes for everyone. When admin role hierarchy (Officer / Manager / Super User / Junior Officer) ships, revisit whether Manager vs Junior Officer reviews should have separate accountable tracks. Today, requesters needing independent sign-offs send N requests by hand.
  *Why deferred:* Single shared status is the agreed POC model; the role hierarchy that would motivate parallel accountability isn't in tree yet.

- **Email-template visual styling is duplicated.**
  *Spawned by:* [B-118](cli-brief-peer-manager-review-and-hotfixes-b118.md).
  *What:* Inline HTML envelope + CTA-button rendering now exists in three places: `src/lib/review-requests/emails.ts`, `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts`, and `src/app/api/admin/documents/[id]/request-update/route.ts`. Extract to a shared template helper once a fourth template appears, or when a brand refresh forces a one-pass edit across all three.
  *Why deferred:* Premature abstraction across 3 callers; each currently has slightly different layout requirements.

- **Legacy `/api/admin/profiles/[id]/send-invite` route can probably be deleted.**
  *Spawned by:* [B-118](cli-brief-peer-manager-review-and-hotfixes-b118.md).
  *What:* The verification_codes NOT NULL fix in this brief unblocks the modern path. The legacy route still inserts `kyc_record_id`, so it works either way — but if nothing calls it anymore, it can go (closes tech-debt #28 too). Confirm zero callers via grep + Vercel logs over a release cycle, then delete.
  *Why deferred:* Cleanup is mechanical but needs a release cycle of "no traffic" evidence before deleting.

## 2026-05-14

- **Doc-card title-level mismatch chip.**
  *Spawned by:* [B-117](cli-brief-field-provenance-icons-and-doc-expiry-flow-b117.md).
  *What:* When any field tied to a doc disagrees with that doc's OCR value, surface a red flag chip on the doc card itself (the card title row), so admins notice mismatches without opening the per-section form. Deferred until per-field flags are observed in practice — the card is already visually busy and we don't want to multiply noise. If Vanessa reports the per-field flags get lost in the form's visual density, add this chip; otherwise leave the per-field flag as the single signal.
  *Why deferred:* Adds visual noise on top of an already busy card; per-field flag may be sufficient signal.

- **`field_extractions.source = 'admin_override'` is no longer rendered.**
  *Spawned by:* [B-117](cli-brief-field-provenance-icons-and-doc-expiry-flow-b117.md).
  *What:* The new icon vocabulary derives state from `(latest OCR extraction, current form value)` and ignores whether the row's `source` is `manual` or `admin_override`. The DB still records the distinction for audit-log integrity. When confidence is high that the distinction is not surfacing anywhere user-visible, collapse `admin_override` into `manual` in a follow-up migration + recordProvenance simplification.
  *Why deferred:* Audit-log integrity for the legacy distinction is non-zero value; cheap to keep until the icon design has had time in production.

- **Documents step and per-profile KYC % share the same underlying KYC-doc data.**
  *Spawned by:* [B-116](cli-brief-peoplekyc-dedup-and-combined-docs-b116.md).
  *What:* The Documents step pill now folds per-profile KYC docs into its denominator/numerator alongside service-level docs, and the per-profile KYC % already counts those same docs. Waiving a person-scope doc therefore bumps both metrics simultaneously. Conceptually correct — the doc is "done" at the profile level *and* at the service level — but worth flagging: a future all-up service-completion roll-up may want to dedupe further, or each metric should explicitly call out what it counts so admins reading two pills don't double-count progress in their head.
  *Why deferred:* Both reads are correct in isolation. The shared-data overlap is a UX question, not a math bug.

- **Native `<select>` rendering has visible OS variance.**
  *Spawned by:* [B-115](cli-brief-org-applies-to-and-native-dd-select-b115.md).
  *What:* `ProfileDdLevelSelector` was rewritten using a native `<select>` to dodge the parent's `stopPropagation` wrapper and base-ui's lowercase render quirk. The trigger is styled but the open menu draws with platform defaults (macOS / Windows / iOS Safari all differ). Acceptable for a 3-option DD picker; if visual parity becomes a need, build a small headless dropdown that doesn't fight the collapse handler at `ServiceDetailClient.tsx:2315`.
  *Why deferred:* The variance is cosmetic only and admin browsers are mostly macOS Chrome.

- **`document_types.applies_to` has no CHECK constraint.**
  *Spawned by:* [B-115](cli-brief-org-applies-to-and-native-dd-select-b115.md).
  *What:* `filterDocTypesForRecordType` treats `'individual' | 'organisation' | 'both'` as the canonical values; a typo (e.g. `'individuals'`) would silently behave like a legacy NULL and pass through for every profile. Today every value is set via the admin UI's dropdown so the risk is low. If we start importing/seeding doc types from other sources, add a CHECK constraint in a migration to prevent silent drift.
  *Why deferred:* Schema change without an active failure mode — admin UI is the only writer.

- **All person-scope KYC doc types are treated as required for every profile.**
  *Spawned by:* [B-114](cli-brief-kyc-pct-truthful-b114.md).
  *What:* `calcKycPct` (and the parallel logic inside `computeProfilePendingItems`) counts every active person-scope `document_types` row as required against every profile. In practice some doc types only apply to certain roles (e.g. UBO-only forms). When role-scoped doc requirements ship (probably via the `role_requirements` / `role_document_requirements` table already in the schema), filter `requiredDocs` to only those that apply to the profile's roles. The math stays correct by structure — just the field count gets more accurate per role.
  *Why deferred:* Today there's no consumed role-scope linkage for KYC doc types on this surface; introducing it cleanly means lifting that mapping into the loader. Out of scope for the truthful-% fix.

- **Conditional KYC fields (`showWhen`) are excluded from the required denominator.**
  *Spawned by:* [B-114](cli-brief-kyc-pct-truthful-b114.md).
  *What:* `pep_details`, `legal_issues_details`, `source_of_funds_other` and similar fields only render when their parent toggle is set. The new `calcKycPct` filters them out of the required set entirely (`f.required && !f.showWhen`). When the toggle is on, they're effectively required but invisible to the denominator — a profile reads 100% even with the follow-up textarea blank. Acceptable tradeoff for B-114; revisit if it causes noticeable under-counting in practice.
  *Why deferred:* Including `showWhen` fields correctly means evaluating each rule against the current values per profile (much like `visibleFields` already does for the form). Straightforward but not necessary for the immediate accuracy fix.

- **`calcKycCompletion` still uses the old field list — dashboard + admin services list under-count CDD profiles.**
  *Spawned by:* [B-113](cli-brief-spacebar-kycpct-ddlevel-profilepending-b113.md).
  *What:* B-113 fixed `calcKycPct` (the per-profile helper on `/admin/services/[id]`) to drop optional `source_of_funds_description` and gate `source_of_wealth_description` behind `ddLevel === "edd"`. The shared `calcKycCompletion` util in `src/lib/utils/serviceCompletion.ts` keeps the original buggy list and still drives `/admin/services` (services list page) and `/dashboard` (client dashboard). CDD profiles on those surfaces will keep showing ~80% even when complete.
  *Why deferred:* Fixing `calcKycCompletion` properly means propagating `due_diligence_level` through every caller's `kycPersons` shape (currently the util only sees `client_profile_kyc`). Touches `services/page.tsx`, `dashboard/page.tsx`, and the util signature. ~1h follow-up; out of scope for B-113's per-page fix.

- **`calcKycPct` uses an individual-shaped field list — under-counts organisation profiles.**
  *Spawned by:* [B-113](cli-brief-spacebar-kycpct-ddlevel-profilepending-b113.md).
  *What:* The helper hard-codes `date_of_birth / nationality / passport_number / passport_expiry / occupation / address / is_pep / legal_issues_declared` as the required set. None apply to organisation profiles (record_type === "organisation"), which have their own field shape on `client_profile_kyc`. Org profiles will always show low pct.
  *Why deferred:* Needs a `KYC_REQUIRED_FIELDS_FOR_RECORD_TYPE` lookup with separate lists per record type × DD level. Real fix should align with whatever `KYC_SECTIONS_ORGANISATION` declares so the % matches what the user actually sees.

- **Manual alerts have no profile linkage.**
  *Spawned by:* [B-113](cli-brief-spacebar-kycpct-ddlevel-profilepending-b113.md).
  *What:* `service_alerts` rows only carry a service id. B-113 Batch 3's per-profile Pending popover therefore can't include admin-authored manual alerts even when the alert is conceptually about a specific profile.
  *Why deferred:* Schema change. Add `client_profile_id` (nullable) to `service_alerts`, surface a profile picker in the alert authoring dialog, and route alerts with a linked profile into the per-profile popover.

---

## 2026-05-13

- **`computePendingItems` recomputes on every render.**
  *Spawned by:* [B-111](cli-brief-pending-glance-b111.md).
  *What:* `PendingCardWithState` derives the Pending list via `useMemo` over `sectionReviews + steps + profiles + missingDocCount + alerts`. Memoization keeps it cheap today (≤30 items for a busy service), but the inputs are array references that change on every parent re-render. If services start carrying hundreds of profiles or alerts, the memo deps will invalidate frequently and the cost climbs.
  *Why deferred:* No measurable cost today. When it bites, lift stable refs (e.g. memoize `profilesForPending` upstream) or move the aggregate to a server-side derivation in `loadServiceDetail`.

- **Pending card and Alerts feed overlap.**
  *Spawned by:* [B-111](cli-brief-pending-glance-b111.md).
  *What:* B-108's `ServiceAlertsDialog` and B-111's Pending card both surface critical / warning auto-alerts (doc expiry, KYC age). Info-tier auto-alerts (long-tail KYC age) stay in the Alerts dialog only. Manual alerts and per-section verdicts appear in both.
  *Why deferred:* Intentional — Pending is the onboarding checklist + monitoring blockers; Alerts is the monitoring history with dismiss/resolve actions. Different read patterns. Revisit if Vanessa reports the duplication is confusing.

- **`open_document` from Pending card scrolls instead of opening the dialog.**
  *Spawned by:* [B-111](cli-brief-pending-glance-b111.md).
  *What:* The brief specifies "open the existing `DocumentDetailDialog` for that document" on `open_document` click. Today the handler scrolls to the doc's section (PersonCard for profile-scoped docs, Documents section for service-scoped) and admin clicks View on the row to open the dialog. Lifting the dialog state to `ServiceDetailClient` would let us open it directly.
  *Why deferred:* `DocumentDetailDialog` mount state is local to two places (`PersonCard` and `AdminDocumentsSection`), each owning their own `detailDoc` useState + Approve/Reject/Replace flows. Lifting would propagate state changes through every save/refresh handler. Scroll-then-click is a reasonable interim; revisit if Vanessa pushes back on the extra click.

- **Review Wizard `Mark as Reviewed` writes a step-level review, not a per-profile review.**
  *Spawned by:* [B-109](cli-brief-review-wizard-polish-b109.md).
  *What:* Both the wizard-level `Mark as Reviewed` (Batch 1) and the per-profile sub-wizard's `Mark Profile Reviewed` (Batch 3) write to `application_section_reviews` with `section_key='people'` (the same step-level key) when reviewing inside step 3. They do not write a profile-scoped subject id. B-074 already supports per-profile subsection reviews via the inline KYC affordances inside `KycLongForm` (using `kyc:<profileId>:<categoryKey>` keys), so the per-profile review trail is captured there — just not from the sub-wizard's `Mark Profile Reviewed` button.
  *Why deferred:* The `application_section_reviews` schema already supports profile-scoped subject ids (B-074 uses them), so this is purely wiring: thread `profileId` into the dialog's POST and use `kyc:<profileId>:overall` (or similar) as the key. ~half-day follow-up.

- **Sub-wizard section ordering depends on `KYC_SECTIONS_*` arrays, not the client wizard.**
  *Spawned by:* [B-109](cli-brief-review-wizard-polish-b109.md).
  *What:* The admin per-profile sub-wizard's sub-steps are derived from `KYC_SECTIONS_INDIVIDUAL` / `KYC_SECTIONS_ORGANISATION` in `src/lib/kyc/sections.ts`. The client's `PerPersonReviewWizard` has its own sub-step config (e.g. it splits `Address` into its own sub-step between Identity and Financial; admin keeps Address inside the Identity section). If either side changes ordering, the two wizards drift.
  *Why deferred:* The client wizard has historical step naming + hidden-address-fields logic that doesn't 1:1 map to `KYC_SECTIONS_*`. Long-term: lift the sub-step ordering into a shared structure in `src/lib/kyc/sections.ts` that both the client `PerPersonReviewWizard` and admin `AdminPerProfileReviewWizard` consume.

- **Auto-alert dismissals never expire.**
  *Spawned by:* [B-108](cli-brief-comms-and-alerts-b108.md).
  *What:* A `dismissed_auto_alerts` row keyed on `(service_id, auto_alert_key)` permanently suppresses that exact alert. Most auto-alert keys are entity-id-scoped (`doc_expiry_<docId>`, `kyc_age_<profileId>`) so a future doc / profile triggers a different key and re-shows, but if the same key recurs (e.g. the same doc is replaced in-place keeping its id, and a new expiry crosses the 60-day threshold), the dismissal still applies and the alert never reappears.
  *Why deferred:* Acceptable for v1 — the entity-id-keyed pattern makes this rare in practice. Revisit if Vanessa reports an alert that "won't come back" after the underlying state genuinely re-triggers. Mitigation when needed: add `dismissed_at + expires_at` (e.g. 90 days) and filter dismissals server-side by expiry.

- **Communications log doesn't track delivery status.**
  *Spawned by:* [B-108](cli-brief-comms-and-alerts-b108.md).
  *What:* `service_communications.status` is set to `sent` (or `failed`) based on Resend's synchronous response only. Bounces, spam complaints, and unsubscribes fired later via webhook are not captured — the modal will always show the email as `sent` even if it bounced.
  *Why deferred:* Resend webhook plumbing is its own brief (auth header verification + event routing + idempotency keys + status transitions). The synchronous status is good enough until delivery monitoring becomes a real ask.

- **Email body stored verbatim — no template versioning.**
  *Spawned by:* [B-108](cli-brief-comms-and-alerts-b108.md).
  *What:* `service_communications.body_html` is the rendered HTML at send time. If the invite or update template changes (logo swap, copy revision, footer update), historical rows still show the old body. The iframe viewer always shows what the recipient actually saw — but if we ever want to *replay* an email through the *current* template, the data isn't there.
  *Why deferred:* Won't fix — this is the correct behavior for an audit log. Document the intent so a future re-render feature doesn't quietly conflate "what was sent" with "what the current template would have sent".

- **Waiver `waived_by_name` is resolved client-side via a `users` map.**
  *Spawned by:* [B-106](cli-brief-waiver-everywhere-b106.md).
  *What:* `PersonCard` builds a `Record<user_id, full_name>` from the existing `adminUsers` page-load and resolves the waiver-tooltip "by <name>" via that map. Works because the lookup data is already on the page, but if `loadServiceDetail` ever drops the admin-users fetch, the tooltip silently shows just the date. Long-term, surface `waived_by_name` directly on the waiver row by extending the `loadServiceDetail` select to join `users(full_name)` and project as a column-level alias on `waived_document_requirements`.
  *Why deferred:* Coupling the waiver row to a join changes the type shape across the chain — not worth it until either the admin-users fetch is removed or we add a non-admin actor (`waived_by` could in principle be any user_id, but today it's always an admin).

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
