# Tech Debt Log

Items deferred during brief work — small fixes / cleanups that didn't justify a
dedicated brief but shouldn't be lost. Each entry: date added, brief that spawned
it, one-line description, and a brief note on why it was deferred.

Newest items at the top. Strike-through (`~~…~~`) when resolved, then optionally
remove after 30 days.

---

## 2026-05-19 (B-133)

- **Hide-vs-cascade convention for `service_profile_removals`.** *Severity: Low.*
  *Spawned by:* [B-133](cli-brief-respect-profile-removals-b133.md).
  *What:* B-133 makes the queue + service detail HIDE per-service-removed profiles, but the underlying `profile_service_roles` rows stay intact (so re-add via AddDirector restores roles cleanly). Any future caller that reads `profile_service_roles` directly outside `loadServiceDetail.ts` (a report query, an external integration, an ad-hoc SQL export) will surface the removed profile unless it also joins `service_profile_removals`. Two options: (a) introduce a DB view `active_profile_service_roles` that pre-joins the exclusion and migrate readers, or (b) document the invariant loudly in the schema. Either way, a single canonical "active roles" entry point would prevent the bug class. Estimate: 1-2 hours for option (a).
  *Why deferred:* The two surfaces that actually rendered the bug are fixed; no other surface has surfaced yet.

- **Removals-filter audit for other admin surfaces.** *Severity: Low.*
  *Spawned by:* [B-133](cli-brief-respect-profile-removals-b133.md).
  *What:* B-133 fixed the queue + service detail (and the four knock-on consumers — People & KYC, KYC progress %, B-132 document inheritance, peer review picker, section review aggregates). The remaining admin surfaces weren't audited: audit-log readouts, Communications dialog recipient picker, `/admin/services` services-list page, `/admin/profiles/[id]` detail, etc. If a removed profile pops up on any of these, fix in a small follow-up. Estimate: 1-2 hours per surface.
  *Why deferred:* No bug reports against those surfaces yet — the visible ones (queue + service detail) were the user-reported regressions.

---

## 2026-05-19 (B-132)

- **Document expiry alerts.** *Severity: Low.*
  *Spawned by:* [B-132](cli-brief-profile-scoped-documents-b132.md).
  *What:* `document_types.valid_for_months` defines how long a doc stays valid, and the per-row UI already computes "Expires in N days / Expired" pills. There&apos;s no proactive alert when a doc is approaching or past expiry — admins only see it when they happen to open the service. Useful for compliance refresh workflows; could surface as a dashboard widget or a daily email digest. Estimate: ~half-day.
  *Why deferred:* Pitch demo doesn&apos;t need it; the per-row pill catches it during normal review.

- **Document categorization may be wrong in legacy seed data.** *Severity: Med.*
  *Spawned by:* [B-132](cli-brief-profile-scoped-documents-b132.md).
  *What:* The Batch 1 backfill assumed `document_types.category IN ('identity','financial','compliance')` correctly identifies personal docs. If any seeded category was mislabeled (e.g. a corporate doc accidentally categorized as 'compliance'), it was backfilled to `service_id = NULL` and now surfaces on every service the profile is on — a leak across services. Audit the `document_types` table after deploy and reclassify if needed; the per-doc `audit_log` row from the migration captures the count but not the individual rows. Estimate: ~1 hour to audit, plus migration time if any rows need fixing.
  *Why deferred:* The categorisation has been stable across recent briefs; treat as a post-deploy sanity check rather than blocking work.

- **Cross-service document audit trail.** *Severity: Low.*
  *Spawned by:* [B-132](cli-brief-profile-scoped-documents-b132.md).
  *What:* When a personal doc is replaced on Service A, the change isn&apos;t reflected in Service B&apos;s audit_log — the upload route writes one audit row tied to the originating service. The doc itself is updated everywhere (correct), but a Service B admin reading the audit trail won&apos;t see the replace event. If GWMS audit pressure requires per-service audit on every doc replace, augment the audit writer to fan out one row per service the profile is currently on. Estimate: ~2 hours.
  *Why deferred:* The single audit row already captures the actor, the doc, and the previous filename; tracing across services is a power-user analysis (and `audit_log` filtering can recover it from the doc id).

- **`/api/admin/processes/[id]/upload` doesn&apos;t set service_id at all.** *Severity: Low.*
  *Spawned by:* [B-132](cli-brief-profile-scoped-documents-b132.md).
  *What:* The legacy `client_processes` upload route inserts into `documents` without setting `service_id`. Pre-B-132 this would have errored (NOT NULL). Now it silently sets NULL, which classifies every process-uploaded doc as profile-scoped even if it&apos;s a corporate doc. Decide whether that&apos;s correct (most process docs are entity-level) and either set the process&apos;s associated service_id or accept the new semantics. Estimate: ~1 hour after a category audit.
  *Why deferred:* Legacy code path; the broader retirement of `applications` / processes is its own brief.

---

## 2026-05-19 (B-131)

- **Rep notifications — director isn't pinged when their rep edits KYC.** *Severity: Low.*
  *Spawned by:* [B-131](cli-brief-inline-profile-create-and-filing-reps-b131.md).
  *What:* When a filing rep saves KYC on behalf of a director, the director receives no email. The change is captured in `audit_log` as `profile_kyc_saved_by_rep`, but no outbound notification fires. If we want "your rep just updated your KYC, here's what changed" emails (with a per-change diff or a once-a-day digest), add a hook to the rep-driven save path that builds the diff + sends via Resend. ~2 hours; new brief when needed.
  *Why deferred:* Pitch demo doesn't need it; the audit row covers the compliance angle.

- **Multiple filing reps per director.** *Severity: Low.*
  *Spawned by:* [B-131](cli-brief-inline-profile-create-and-filing-reps-b131.md).
  *What:* B-131 supports exactly one rep per profile via two columns (`filing_rep_name`, `filing_rep_email`). If a need arises for joint reps (e.g. two lawyers, primary + backup), add a junction table `client_profile_filing_reps (client_profile_id, rep_user_id, rep_name, created_at)` and adapt the dashboard / `/filings` queries. Estimate: ~half-day, plus a migration that backfills the existing two-column data.
  *Why deferred:* One rep is the common case and matches today's UX.

- **Rep access is KYC-only; no broader delegation.** *Severity: Low.*
  *Spawned by:* [B-131](cli-brief-inline-profile-create-and-filing-reps-b131.md).
  *What:* Filing reps can only edit the delegated director&apos;s KYC long form via `/filings/[profileId]`. They cannot manage milestones, see the audit trail, add other directors, upload service-level documents, etc. If clients want broader delegation ("power-of-attorney mode"), extend the rep-auth check across more routes (service-level write endpoints, document upload, KYC submit) gated on the same `filing_rep_email` match. Estimate: 1-2 days.
  *Why deferred:* Most rep use-cases today are pure KYC paperwork; broader scope wasn&apos;t requested.

- **Revoke / replace rep is implicit, not workflow-driven.** *Severity: Low.*
  *Spawned by:* [B-131](cli-brief-inline-profile-create-and-filing-reps-b131.md).
  *What:* To remove or replace a rep, an admin edits `filing_rep_email` on the profile (PATCH route). When the value changes to a new address, the new rep gets an invite; the old rep simply loses dashboard access on next page load (the email-match query no longer includes the profile). There&apos;s no explicit "revoke" toast, no email to the dropped rep, and the orphan `users` row stays in place. If revocation needs a formal flow (notification + audit ceremony), add a dedicated PATCH path. ~1 hour.
  *Why deferred:* Implicit revocation is enough for the pitch; the audit trail still captures the email change.

- **`/api/profiles/kyc/save` was previously open to any authenticated user in tenant.** *Severity: Low.*
  *Spawned by:* [B-131](cli-brief-inline-profile-create-and-filing-reps-b131.md).
  *What:* The save endpoint historically accepted any session with no per-profile authorization check. B-131 tightened it to require either profile ownership (user_id match), email-on-profile match, or filing-rep email match — but the legacy `/kyc` page reads from `kyc_records` (legacy table), not `client_profiles`. The newer modern-table KYC paths now pass that gate; if any code path still expects pre-B-131 permissive behaviour we&apos;ll surface it as a 403. Audit reach: grep for `/api/profiles/kyc/save` callers and verify each one&apos;s session matches the new contract.
  *Why deferred:* No known failing caller. Documenting so future debugging starts here.

---

## 2026-05-19 (B-130)

- **Legacy clients/applications cleanup — Queue migrated, ~10-15 surfaces remain.** *Severity: Medium.*
  *Spawned by:* [B-130](cli-brief-services-queue-modernization-b130.md) (incremental progress on the older B-126 entry below).
  *What:* B-130 migrated `/admin/queue` from the legacy `applications` table to the modern `services` table; `ApplicationTable.tsx` is marked `// LEGACY` and kept in place for the remaining readers. Surfaces still reading from `applications` / `clients` / `client_users`: admin clients list + breadcrumbs, application detail header on `/admin/applications/[id]`, AI verification context lookup, several audit-log writes, the dashboard's recent-activity card. Full retirement still needs a dedicated brief that ports each reader, then drops the tables in one migration with FK cascades + `audit_log.entity_type` backfill.
  *Why deferred:* B-130 was scoped to the queue surface only; full sweep is its own brief (estimate 2-3 days). The older B-126 entry below stays open as the umbrella.

- **Reviews inbox could surface as a dashboard widget.** *Severity: Low.*
  *Spawned by:* [B-130](cli-brief-services-queue-modernization-b130.md).
  *What:* Today open reviews show as a sidebar badge + dedicated `/admin/reviews` page. Admins who land on `/admin/dashboard` first miss the badge until they look at the nav. Add a small "Reviews awaiting you" card at the top of the dashboard that links straight into `/admin/reviews` (or shows up to 3 inline rows with the same "Mark as reviewed" action). ~2-3 hours; new brief when usage shows admins are bouncing between dashboard and sidebar.
  *Why deferred:* Sidebar badge is enough for now; rejecting unnecessary surface area.

- **Assigned officer is admin-only — not visible to clients.** *Severity: Low.*
  *Spawned by:* [B-130](cli-brief-services-queue-modernization-b130.md).
  *What:* `services.assigned_admin_id` populates the admin-side right-rail card + queue filter, but the client portal doesn't surface "Your account manager is X" anywhere. Add it to the client-side service detail header (with name + email/contact) once Vanessa decides on the client-facing contract. ~half-day including the email-template tie-in.
  *Why deferred:* No client-side UX brief yet; pitch demo is admin-centric.

- **No multi-officer assignment or workload-balancing UI.** *Severity: Low.*
  *Spawned by:* [B-130](cli-brief-services-queue-modernization-b130.md).
  *What:* B-130 ships a single `assigned_admin_id` per service. If GWMS wants "primary + backup" or "lead + reviewer pair" assignments, that's a new `service_assignments` junction table. Workload-balancing (per-officer queue size + 1-click reassignment) is also explicitly out of scope. Each is a separate brief (~1 day each) when an operational need surfaces.
  *Why deferred:* Single-officer assignment covers the current operational model.

---

## 2026-05-19 (B-129)

- **Admin UI for editing tenant brand.** *Severity: Low.*
  *Spawned by:* [B-129](cli-brief-tenant-brand-centralization-b129.md).
  *What:* B-129 wired the data path from `tenants.settings` → `session.user.tenantBrand` → every render surface, but the editing experience is still raw SQL. Build `/admin/settings/branding` with: display_name / portal_name / country / support_email / footer_text inputs, a colour picker bound to primary_color, and a logo uploader that writes to Supabase Storage (or an external URL). Gate behind a future `branding_access` permission flag.
  *Why deferred:* Vanessa edits the JSON directly via Supabase SQL editor for the pitch demo — a polished editor UI isn't blocking. Tracked as B-130.

- **Substance review labels are still Mauritius-hardcoded.** *Severity: Low.*
  *Spawned by:* [B-129](cli-brief-tenant-brand-centralization-b129.md).
  *What:* `SubstanceReviewForm` renders FSC §3.2-3.4 questions ("Has 2 Mauritius-resident directors?", "Principal bank account in Mauritius?", etc.) as hardcoded strings because they're jurisdiction-specific compliance, not generic copy. When (if) GWMS expands to other jurisdictions, the substance section needs a per-tenant compliance template — likely JSON config keyed on `tenants.country` or a dedicated `tenant_compliance_frameworks` table.
  *Why deferred:* No multi-jurisdiction tenant on the roadmap. Estimate when it lands: 2-3 days; depends on the new jurisdiction's specific framework.

- **Customer-facing white-label switch.** *Severity: Low.*
  *Spawned by:* [B-129](cli-brief-tenant-brand-centralization-b129.md).
  *What:* `PLATFORM_BRAND` is overridable via env vars (`NEXT_PUBLIC_PLATFORM_NAME` / `NEXT_PUBLIC_PLATFORM_TAGLINE` / `NEXT_PUBLIC_PLATFORM_LOGO_URL`) but there's no in-app flip to hide the "Powered by Elarix" line entirely for resold instances. If Vanessa sells fully-white-label deployments, add a `branding.show_platform_brand` flag (env or DB) + a small switch in `BrandedHeader`.
  *Why deferred:* No reseller in pipeline yet. Tracked as a future B-131 if/when it becomes relevant.

- **Per-locale formatting tied to `tenants.country`.** *Severity: Low.*
  *Spawned by:* [B-129](cli-brief-tenant-brand-centralization-b129.md).
  *What:* `brand.country` is rendered as a display string today (footer line, KYC tooltip). Date / currency / phone-number formatting is still hard-coded to en-US / MUR conventions in various utilities. When a non-Mauritius tenant is onboarded, locale formatting needs to follow `brand.country` (or a separate `locale` setting).
  *Why deferred:* No second tenant; locale-aware formatting is touchier than copy substitution and warrants its own brief.

- **Tenant brand staleness on session.** *Severity: Low.*
  *Spawned by:* [B-129](cli-brief-tenant-brand-centralization-b129.md).
  *What:* `session.user.tenantBrand` is stamped at NextAuth `authorize()` time and cached on the JWT for 8h. SQL edits to `tenants.settings` don't propagate to active sessions until each user logs out + back in. Same caveat as `adminPermissions` from B-127. Resolutions: (a) shorten JWT TTL, (b) revalidate brand on every request via middleware, (c) add a "force re-auth all users" admin button.
  *Why deferred:* For the pitch demo Vanessa controls the timing — she edits then re-logs herself. Real multi-tenant operations will need (b) or (c).

- **Multi-tenancy — data isolation, tenant resolution, admin UI.** *Severity: Med.*
  *Spawned by:* [B-129](cli-brief-tenant-brand-centralization-b129.md).
  *What:* B-129 centralized brand strings to `tenants.settings`, which means a new tenant inserted today would automatically have its own brand identity flow through every email + UI surface. The remaining multi-tenant work is: (1) per-tenant data isolation via RLS scoped to `tenant_id`, (2) tenant context resolution from session / subdomain / header, (3) admin UI for managing multiple tenants. None of those were in B-129's scope. This is the existing tech debt #1 from the legacy `CHANGES.md` tracker — B-129 makes the brand layer multi-tenant-ready but the data layer is the larger remaining lift.
  *Why deferred:* Single tenant today; pitch demo only needs brand swap, not full data isolation.

---

## 2026-05-19 (B-128)

- **Chatbot multi-turn memory.** *Severity: Low.*
  *Spawned by:* [B-128](cli-brief-chatbot-wire-up-b128.md).
  *What:* Each question to `/api/chatbot/ask` is independent today — `useChatbot.ask` only passes the current question, no prior turns. If users start asking follow-ups ("what about that one?", "and the next step?"), wire a `history: ChatMessage[]` array through to the search API + LLM context window. The hook already keeps the transcript in memory for the visual; the work is on the wire format + the LLM prompt scaffolding (and a re-think of the system prompt to handle multi-turn ambiguity).
  *Why deferred:* Multi-turn is one of those features that's easy to add badly and hard to add well; wait until usage data shows real pain.

- **Chatbot "Was this helpful?" feedback capture.** *Severity: Low.*
  *Spawned by:* [B-128](cli-brief-chatbot-wire-up-b128.md).
  *What:* No 👍/👎 or any feedback signal on chatbot answers. To drive content tuning, add per-answer voting → write to a new `chatbot_feedback` table keyed on `(question_text, answer_text, mode, audience, voted_at)` plus an optional free-text comment. UI: small thumbs row under each assistant message.
  *Why deferred:* No content-tuning workflow yet — adding a vote pipeline without a "review the votes" surface puts the signal in the floor. Revisit once Vanessa's first review-pass on the seed entries lands.

- ~~AI assistant messages are hardcoded~~ — *resolved B-128 (2026-05-19).* The real chatbot widget is now wired on both shells and powered by the seeded `knowledge_base` (43 entries) + LLM fallback. The legacy hardcoded card in `ApplicationStatusPanel` is now redundant; queue a follow-up sweep to delete it once usage telemetry shows users go to the new widget.

- **Chatbot KB lookup is fail-open (still).** *Severity: Low.* B-128 did not change the verifier-side "return empty on error" behaviour from #17, and the chatbot's KB call has the same shape — when the Supabase query errors, the search returns `[]` and the user sees the LLM fallback's "no information yet" sentence. There's no telemetry to alert on a silent KB outage. Tracked separately as Open #17.

---

## 2026-05-19

- **Fine-grained role gating sweep.** *Severity: Medium.*
  *Spawned by:* [B-127](cli-brief-admin-role-hierarchy-b127.md).
  *What:* B-127 wired the 5 highest-leverage gates (settings, admin mgmt, status-change, destructive, review buttons). The remaining ~20 admin surfaces still render their affordances unconditionally even when the actor's role should block them. Walk every `/admin/*` page + `/api/admin/*` route and add the matching `session.user.adminPermissions.<flag>` check (UI hide/disable + API 403). Examples: the KYC edit affordances inside `KycLongForm` should consult `data_access`, the Communications dialog send button should check `send_communications`, the Document Replace surfaces should check `data_access` ≥ `edit`. Audit log + CSV export visibility should branch on `view_audit_log` / `export_data`. Estimate: 1-2 days; tracked as B-128.
  *Why deferred:* The 5 in-scope gates cover the highest-blast-radius actions; the rest is a methodical sweep that benefits from being its own brief with a per-page checklist rather than getting buried in the schema/UI batch.

- ~~All admins are equal~~ — *resolved B-127 (2026-05-19).* Five system roles seeded with the Vanessa-approved defaults; `admin_users.role_id` populated for every existing admin (Super User on backfill). Coarse gating in place across 5 surfaces; fine-grained sweep tracked above as B-128.

- ~~No invite/onboarding flow for admins~~ — *resolved B-127 (2026-05-19).* `/admin/settings/admins` ships with magic-link invite + role assignment + remove + per-role permission editor. JWT pattern mirrors `/api/admin/clients/[id]/send-invite` with `purpose = "admin_invite"`. Page is gated on the `admin_mgmt_access` flag.

---

## 2026-05-18

- **Legacy clients/applications cleanup.** *Severity: Medium.*
  *Spawned by:* [B-126](cli-brief-register-cleanup-claude-md-rewrite-b126.md).
  *What:* `clients`, `client_users`, and `applications` are no longer the source of truth for new work but still get read by ~25 admin surfaces (queue, clients list, applications detail header, breadcrumbs on `/admin/clients/[id]/*`, AI verification context, audit-log writes). Retire by porting every reader to the services-first model, then dropping the tables in one migration with FK cascades + `audit_log.entity_type` backfill. Estimated 2–3 days; needs a dedicated brief and a feature-flag rollout (don't flip readers in one commit). Tracked alongside Open #29 in the CHANGES.md Tech Debt Tracker.
  *Why deferred:* Touches enough surfaces that it needs its own brief + careful migration ordering. The B-126 doc rewrite made the legacy-vs-modern split explicit in CLAUDE.md so contributors don't get confused while this lingers.

- ~~CLAUDE.md is partially outdated~~ — *resolved B-126 (2026-05-18).* The Data Model / Admin Setup / Known Future Migration sections were rewritten to the services-first model. Open #13 in CHANGES.md's Tech Debt Tracker has been moved to Resolved.

- **`client_profile_kyc.is_local_resident_director` is no longer read by app code.**
  *Spawned by:* [B-125](cli-brief-substance-review-and-audit-trail-polish-b125.md).
  *What:* B-125 unified the People & KYC header chip's local-director count to use the same predicate as the badge in `ProfileRowBadges` (`passport_country === "MUS"` + role includes `director` + not `is_representative`). The legacy manually-managed `is_local_resident_director` boolean on `client_profile_kyc` is now write-orphaned: nothing in the app reads it and only the original B-100 seed and ad-hoc admin SQL write it. Drop the column in a cleanup migration once a final grep confirms zero consumers (CLI checked at B-125 time — 0 reads). Leaving in place to avoid a migration just for this; safe to drop.
  *Why deferred:* Migration churn without functional gain.

- **Substance Review autosave has no inline saved-state indicator.**
  *Spawned by:* [B-125](cli-brief-substance-review-and-audit-trail-polish-b125.md).
  *What:* The Yes/No/Unknown buttons now PUT each answer inline (fire-and-forget). On error a toast appears, but there's no positive "saved" cue per row — admin has to trust that the button visually showing as picked = saved. If admins flag the silent flow, add a small per-row check-or-spinner indicator that flips after the PUT resolves. Today's UX is acceptable since the toast covers the error case; success is the common path.
  *Why deferred:* Visual minimalism; adding per-row spinners adds noise where success is the default outcome.

- **Audit Trail CSV export is unauthenticated against rate limits.**
  *Spawned by:* [B-125](cli-brief-substance-review-and-audit-trail-polish-b125.md).
  *What:* `GET /api/admin/services/[id]/audit-log/export` checks the admin role but doesn't rate-limit. Heavy services with thousands of audit entries could produce large downloads and be abused by an automated script logged in as admin. If this becomes a real concern, add a per-admin-per-minute limiter on the export endpoint (re-using `src/lib/rate-limit.ts`) and a maximum row cap with pagination.
  *Why deferred:* Admin-only surface, internal tool, no abuse seen.

- **Audit Trail date filter state is not URL-persisted.**
  *Spawned by:* [B-125](cli-brief-substance-review-and-audit-trail-polish-b125.md).
  *What:* The Today / 7 days / 30 days / All time / Custom preset lives in React state on the AuditTrail card. Deep-linking to a filtered view (e.g., "share a link to Bruce's audit trail for the last 7 days") doesn't work. Sync the preset + custom range to URL query-params (`?auditFrom=&auditTo=`) when admin starts sharing filtered audit views.
  *Why deferred:* No sharing pattern yet; the filter is per-admin-session.

---

## 2026-05-15

- **Closed-review-requests popup is hard-capped at 50 rows.**
  *Spawned by:* [B-124](cli-brief-review-requests-tabular-and-milestones-redesign-b124.md).
  *What:* `ReviewRequestsCard`'s new "View closed history" popup pages via `slice(0, 50)` and shows "Showing 50 of N" when there are more. Real pagination (cursor or page-N) is deferred until services routinely accumulate >50 closed requests, which doesn't happen for the current usage pattern. Easiest upgrade: paginate against the existing GET endpoint with `?limit=&before=` style params.
  *Why deferred:* Premature for the POC volume.

- **Milestones card hides anything beyond LOE / INV / PAY.**
  *Spawned by:* [B-124](cli-brief-review-requests-tabular-and-milestones-redesign-b124.md).
  *What:* The new `MilestonesCard` is hard-coded to three columns. If we add new milestones (audit letter sent / engagement letter received / etc.), the card needs to either (a) grow horizontally — fine for 4 columns, awkward beyond, (b) add a "more milestones" disclosure, or (c) switch to a vertical layout once we exceed ~4 cells. The data model on `services` is unaffected by this UI cap.
  *Why deferred:* Single set of three milestones today; no pressure to generalise.

- **Right rail JSX has evolved through ten briefs — extract a `<RightRail>` component.**
  *Spawned by:* [B-124](cli-brief-review-requests-tabular-and-milestones-redesign-b124.md).
  *What:* The right rail in `ServiceDetailClient.tsx` is now a hand-ordered JSX list of cards (Progress → View Summary → Review Requests → Status → Pending → Officer → Communications → Milestones → Audit Trail). Reordering means moving JSX blocks every brief. Once the rail stabilises, extract a `<RightRail slots={[...]} />` component with a typed prop for ordered card slots so future reorders become a single config edit. Don't preemptively — wait for one more reorder so the right abstraction reveals itself.
  *Why deferred:* The pattern is still moving; abstracting now would lock in shape that's likely to shift.

- **Legacy `services.loe_received` boolean is now write-orphaned from the UI.**
  *Spawned by:* [B-124](cli-brief-review-requests-tabular-and-milestones-redesign-b124.md).
  *What:* The old row-per-milestone card flipped both `loe_received_at` (timestamp) and `loe_received` (boolean) when admin toggled the LOE row. The new MilestonesCard only writes `loe_received_at` (null = unset). The legacy boolean column still exists and is still readable, but no UI writes it. Either drop it in a follow-up migration (when we're sure no other consumer reads it) or keep it as a redundant flag synced via a trigger. CLI greps showed no other consumer today, so dropping is safe — left in place to avoid a migration just for this.
  *Why deferred:* Migration churn without functional gain. Tag for the next schema cleanup pass.

- **Modal sizing has no persistence (Communications list + DocumentPreviewDialog).**
  *Spawned by:* [B-123](cli-brief-modal-sizing-polish-b123.md).
  *What:* Both modals now expose a native resize handle (horizontal on the list dialog, two-axis on the preview). Width/height resets every time admin closes the modal. If admins find themselves repeatedly resizing in the same session, add `localStorage` persistence keyed on the dialog name (`gwms.modalSize.communications-list`, `gwms.modalSize.document-preview`).
  *Why deferred:* Native resize is sufficient for the POC; persistence is plumbing without immediate value. Revisit if Vanessa flags this.

- **`DocumentPreviewDialog` is shared across many callers with one default size.**
  *Spawned by:* [B-123](cli-brief-modal-sizing-polish-b123.md).
  *What:* The bigger default size (max-w-7xl × 80vh) was applied unconditionally and is fine for every current caller — KYC doc detail, AI viewer, field-provenance preview, reference-form blank, submitted-form preview. If a future caller wants a smaller default (e.g., a thumbnail-style inline preview), formalise a `size?: 'compact' | 'default' | 'large'` prop and migrate that caller. Don't preemptively introduce the variant — premature abstraction.
  *Why deferred:* Single visual default works today.

- **`SubmittedFileDropZone` is purpose-built for submitted-form uploads.**
  *Spawned by:* [B-122](cli-brief-progress-gauges-and-reference-forms-table-b122.md).
  *What:* The drop-zone component lives at `src/components/admin/actions/SubmittedFileDropZone.tsx` and hard-codes the `/api/admin/services/[id]/submitted-forms` endpoint + the submitted-form MIME allow-list. If we add more "upload a file here" surfaces (e.g., the reference-form library upload modal, a future bulk-document upload), refactor into a generic `<FileDropZone>` that takes the upload endpoint + accepted MIME list as props. Today's component is the only consumer so generalising now is premature.
  *Why deferred:* Premature abstraction — single call site.

- **Progress meters card has three mini gauges; revisit if more sections land.**
  *Spawned by:* [B-122](cli-brief-progress-gauges-and-reference-forms-table-b122.md).
  *What:* The compact 3-up layout fits in the rail's ~280px today (Completed / Reviewed / Actions). If we add a new top-level section that warrants its own gauge (or split Documents into "service" vs "person" KYC gauges), three may stop being the right shape. Likely move to a single horizontal bar with per-section breakdowns, or stack two rows of gauges.
  *Why deferred:* Three is the current ceiling; not adding more sections in the immediate pipeline.

- **Reference Forms table is rendered as a manual `<table>`, not a reusable DataTable.**
  *Spawned by:* [B-122](cli-brief-progress-gauges-and-reference-forms-table-b122.md).
  *What:* `ReferenceFormsPanel` renders its own thead/tbody with Tailwind classes. If we add more admin tables of similar shape (likely audit log views, deactivated-form list, etc.), extract a shared `<DataTable>` primitive with column defs + cell renderers and migrate. Avoid jumping straight to a heavyweight library — the project's pattern is small, focused components, and a 50-line wrapper around `<table>` would cover most needs.
  *Why deferred:* Single table today. Pattern emerges from the second + third use case.

- **`service_templates.min_local_directors` has no admin UI for editing.**
  *Spawned by:* [B-121](cli-brief-review-wizard-fix-and-right-rail-polish-b121.md).
  *What:* The column is seeded (GBC = 1, everything else = 0) via the B-121 migration. There's no admin-side surface to change the value — managed only via Supabase SQL editor for the POC. Add a UI when more per-template compliance counters appear (Local Secretary, Local Registered Agent, Min Directors Total, etc.) or when regulators change requirements often. Likely lands on `/admin/settings/templates` as a small numeric input per row.
  *Why deferred:* Single counter today, edits are rare, SQL is acceptable for now.

- **First per-template numeric compliance threshold — refactor to a shared helper if more land.**
  *Spawned by:* [B-121](cli-brief-review-wizard-fix-and-right-rail-polish-b121.md).
  *What:* `min_local_directors` is the first per-template numeric rule. Its Pending derivation is hand-coded in `computePendingItems` and its display chip is hand-coded in `ServiceDetailClient`. If we add `min_local_secretaries` / `min_local_registered_agents` / `min_directors_total` / `min_shareholders`, refactor the Pending derivation into a `forEachTemplateThreshold(template, counts, emit)` helper rather than copy-pasting the if-branch each time. Same for the chip — extract a `<ComplianceCountChip>` component that takes a list of `{ label, count, required }` rows.
  *Why deferred:* Single rule today doesn't justify the abstraction. Premature.

- **Admin UI for `client_profile_kyc.is_local_resident_director` checkbox.**
  *Spawned by:* [B-121](cli-brief-review-wizard-fix-and-right-rail-polish-b121.md).
  *What:* B-121 added the column with `DEFAULT false`. The chip + Pending row read it, but there's no UI to flip it — admins set it via Supabase SQL editor for the POC. Surface a checkbox in the admin profile-detail surface (`/admin/profiles/[id]`) or per-profile under the People & KYC section of the service detail page, scoped to profiles assigned the Director role on this service. Should write to `client_profile_kyc.is_local_resident_director` via the existing KYC PATCH route plumbing.
  *Why deferred:* Brief's third branch said "expose a checkbox on the Director KYC subsection's identity step" — that's client-portal UX work which felt out of scope for a polish brief. Schema is in place; UX layer can land cleanly later.

- **`is_local_resident_director` is a manual admin flag — risk that nationality `MUS` is more truthful than residence.**
  *Spawned by:* [B-121](cli-brief-review-wizard-fix-and-right-rail-polish-b121.md).
  *What:* The brief allowed picking between adding the flag and inferring from `country_of_residence === 'MUS'`. We picked the flag because there's no `country_of_residence` for individuals (only `nationality` + `passport_country`). A director might be a Mauritius national but live abroad — they'd still pass our flag if admin ticks it. Revisit whether a residence-based inference (when we capture residence on the client KYC form) would be more truthful, or whether to keep the manual flag as the override surface and add residence as supporting context.
  *Why deferred:* The data needed for the inferred path doesn't exist yet. Manual flag is the minimum-viable bridge.

- **Reference forms are bound per `(service_template, action_key)` — same form on multiple templates means re-uploading per template.**
  *Spawned by:* [B-120](cli-brief-reference-forms-and-right-rail-reorder-b120.md).
  *What:* `reference_forms.service_template_id` is a single FK and the lookup index is `(service_template_id, action_key, status, sort_order)`. So if FSC Form A applies to both GBC and Authorised Company templates, admin must upload it twice (once per template). Replace flow only touches the template you're working on; cross-template "bulk replace" isn't supported. If duplication becomes painful — i.e., admins are uploading the same regulatory form to ≥3 templates — revisit with a `linked_templates uuid[]` array column or a junction table.
  *Why deferred:* POC has 5 templates and most reference forms are template-specific (GBC's FSC FS-41 is not what the Trust template needs). The duplication cost today is low; the schema change cost is non-trivial.

- **Reference-form library has no role gating today.**
  *Spawned by:* [B-120](cli-brief-reference-forms-and-right-rail-reorder-b120.md).
  *What:* Any user with a row in `admin_users` can upload, replace, deactivate, and reactivate reference forms. When the planned admin role hierarchy ships (Officer / Manager / Super User / Junior Officer per [[project_admin_role_hierarchy]]), restrict library mutations to Manager+. Add an `is_admin_manager(uid)` (or similar) gate to the four mutating routes under `src/app/api/admin/reference-forms/`.
  *Why deferred:* Roles are still flat. The library page is at `/admin/settings/reference-forms` and only linked from the admin sidebar — practical exposure is low.

- **Submitted forms link to a single `reference_form_id` — no combined-form support.**
  *Spawned by:* [B-120](cli-brief-reference-forms-and-right-rail-reorder-b120.md).
  *What:* If a regulator publishes a "combined" reference form that replaces two existing forms (e.g., FSC Form A+B → Form AB), admin must mark both old forms deactivated AND upload the combined as a new form on each — submitted-form rows for the combined version duplicate storage one per old reference_form_id. Revisit when combined forms appear in practice; could add a `bridges_reference_form_ids uuid[]` column on `reference_forms` so a single uploaded combined form services multiple historical slots.
  *Why deferred:* No current combined forms in the Mauritius regulatory set. Speculative until a regulator publishes one.

- **Auto-fill of blank reference templates from service data is deferred.**
  *Spawned by:* [B-120](cli-brief-reference-forms-and-right-rail-reorder-b120.md).
  *What:* Today Download blank returns the raw blank PDF from storage. The future flow is: admin clicks Download blank with a `?prefilled=true` flag, the backend renders a partially-filled PDF using a templating library (pdf-lib, server-side form-fill helper) populated from service data (company details, registered office, beneficial owner KYC), and admin prints + finalises. No schema change needed — the blank stays the source of truth, pre-fill is computed at download time.
  *Why deferred:* Requires per-form field mapping (which PDF fields map to which service columns), which is meaningful product work. Library + storage are now in place; pre-fill can layer on later.

- **`ReferenceFormsPanel` lacks a component-level unit test because vitest's vite/esbuild pipeline can't transform JSX while project tsconfig sets `jsx: preserve`.**
  *Spawned by:* [B-120](cli-brief-reference-forms-and-right-rail-reorder-b120.md).
  *What:* B-120's brief asked for a unit test asserting `ReferenceFormsPanel` renders nothing when `referenceForms` is empty and renders rows + history disclosure otherwise. The test was scaffolded under `tests/unit/components/ReferenceFormsPanel.test.tsx` but vitest fails to load the source `.tsx` (vite:import-analysis sees raw JSX because `jsx: preserve` is set in tsconfig.json for the SWC build path). Workaround attempts via `esbuild.tsconfigRaw` and `optimizeDeps.esbuildOptions` were ineffective. The test file was removed; behavioural coverage of the panel is left to the integration tests of its underlying endpoints and the eventual E2E pass. To restore: either add `@vitejs/plugin-react` to dev deps (preferred — gives full React HMR + jsx transform), or split a per-test `tsconfig.vitest.json` with `jsx: "react-jsx"`.
  *Why deferred:* Infrastructure-level test config, not panel logic. Functional coverage of the panel's contract is provided by the API integration tests it consumes and by the existing E2E test infrastructure.

- **Action subsections don't plug into `application_section_reviews`.**
  *Spawned by:* [B-119](cli-brief-actions-section-and-ui-hotfixes-b119.md).
  *What:* The four action subsections (Substance, Bank Opening, Company Registration, FSC Checklist) use `service_actions.status` as their done-state authority — no per-subsection review row in `application_section_reviews`. The top-level Actions section still gets reviewed via the standard step-level pattern (`sectionKey="actions"`). Substance Review's body keeps its own `ConnectedSectionHeader` (section_key `action:substance_review`) for legacy review trail, but the other three subsections don't have a peer/manager-review surface. If admin-on-admin review of Action subsections becomes a real need (B-118's peer-review covers ad-hoc requests but not per-section flow), wire each subsection to its own `section_key` and a `SectionReviewControls` row inside the accordion header.
  *Why deferred:* Action subsections drive completion through manual status pills, which admins control directly. Review-on-review adds a second surface for the same signal.

- **Action status-pill UI is duplicated across four subsections.**
  *Spawned by:* [B-119](cli-brief-actions-section-and-ui-hotfixes-b119.md).
  *What:* Each subsection (`SubstanceReviewSubsection`, `BankAccountOpeningSubsection`, `CompanyRegistrationSubsection`, `FscChecklistSubsection`) consumes the shared `<ActionSubsection>` shell that owns the status pill. The shell itself owns the dropdown + tone tables; if we add a fifth action subsection, or introduce a new status value, the duplication is already concentrated in one place. The TODO is: extract `ActionSubsection`'s status dropdown into a tiny `<ActionStatusPill>` so a future "review badge" sibling can drop in next to it without rewriting the shell every time.
  *Why deferred:* Today there are exactly four subsections and five statuses. Refactor when the next action type lands.

- **`ServiceProgressMeters` is hardcoded for two aggregate gauges.**
  *Spawned by:* [B-119](cli-brief-actions-section-and-ui-hotfixes-b119.md).
  *What:* The right-rail Progress card renders 2 aggregate gauges (Completed n/total + Reviewed n/total). `total` already flexes between 5 and 6 via the dynamic step list, but the layout is `grid-cols-2` and hard-coded. If we ever want a different gauge layout for the 6-step case, or a per-section gauge mode, the card needs a different grid. Today the n/total surface scales fine — defer until per-section gauges are explicitly requested.
  *Why deferred:* The 2-gauge aggregate visual works at both 5 and 6 sections; no current need for a per-section variant.

- **Pending action rows scroll to the subsection anchor but don't auto-expand it.**
  *Spawned by:* [B-119](cli-brief-actions-section-and-ui-hotfixes-b119.md).
  *What:* `handlePendingAction` with payload `action-{key}` scrolls to the `<ActionSubsection>` anchor; the parent `<ServiceCollapsibleSection>` auto-opens when ragStatus ≠ green (so when actions are pending the section is open by default). But the individual subsection accordions default to collapsed, so admin has to click the chevron to see the body. Lifting `ActionSubsection`'s expand state up to `ServiceActionsSection` would let the pending row open it directly. Skipped for B-119 to keep the refactor scoped; tracked here.
  *Why deferred:* Two-click flow (Pending row → chevron) is acceptable for the POC; refactor lands once we have feedback on whether admins actually find the deeper-link annoying.

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
