# CLI Brief — B-108 Communications Log + Service Alerts

**Status:** Hold until B-107 lands
**Estimated batches:** 3
**Touches migrations:** Yes (Batches 1 + 3)
**Touches API:** Yes (Batches 1, 2, 3)
**Touches AI verification:** No
**Builds on:** B-100/106/107 (waivers), existing Resend integration

---

## Pre-flight

Run `git pull origin main` first. Verify B-107 feat commit (`feat: waive action in per-profile docs + waiver-aware completion …`) is on origin/main before starting.

---

## Why this batch exists

Two new features on `/admin/services/[id]`, both tied to ongoing service oversight:

1. **Communications log.** Admin sends emails to clients today (signup invites, per-profile KYC invites, document update requests, bulk doc requests), but there's no single place to see what's been sent — only scattered metadata across `document_update_requests`, `audit_log`, and `*_sent_at` columns. Email *bodies* aren't persisted anywhere. Vanessa wants a right-rail card "Communications" with a `View all` button → modal listing every email (date, recipient, type, subject) with a `View` icon that opens the full rendered HTML body.
2. **Service alerts.** A button next to the existing step pills (`Documents`) on the sticky step-pill row opens a modal listing alerts attached to this service — meant for ongoing monitoring after the service is Active. Hybrid sources: auto-detected (documents nearing expiry, KYC last-reviewed > 12 months) + manual entries by admin (free-form title + note + severity). Admin can resolve/dismiss alerts; auto alerts disappear once the underlying condition is gone.

Track-from-now for comms (no backfill of historical emails). All outbound email types are logged.

---

## Hard rules

1. **Three batches, three commits.** After each: stage specific files → commit → `git push origin HEAD:main` → update CHANGES.md under `## B-108` → next.
2. `npm run build` clean after each batch.
3. **Migrations** (Batches 1 + 3): write SQL → `npm run db:push` → `npm run db:status`. Both come back clean before you commit.
4. **No `as any`.** Cast via `unknown` first if Supabase inference is flaky.
5. **No batch ID in commit messages** (CLAUDE.md rule).
6. **Don't restart the dev server.**

---

## Batch 1 — Communications log backend

**Goal:** every email that goes out via Resend writes a row to a new `service_communications` table including the rendered HTML body.

### Step 1.1 — Migration

File: `supabase/migrations/<timestamp>_service_communications.sql` (generate with `npx supabase migration new service_communications`).

```sql
CREATE TABLE IF NOT EXISTS public.service_communications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                        REFERENCES public.tenants(id),
  service_id          uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  -- Who sent it (admin user). Optional sender display name for legacy/system emails.
  sent_by             uuid REFERENCES public.users(id),
  sent_by_name        text,
  sent_at             timestamptz NOT NULL DEFAULT now(),
  -- Recipient: at least one of email / profile_id is set.
  sent_to_email       text,
  sent_to_profile_id  uuid REFERENCES public.client_profiles(id) ON DELETE SET NULL,
  -- Categorisation. Keep open-text rather than an enum so we can introduce
  -- new email types without a migration.
  email_type          text NOT NULL,
  --   Values we'll write from the existing endpoints:
  --   'client_signup_invite' | 'profile_kyc_invite' | 'service_kyc_invite'
  --   | 'document_update_request' | 'process_documents_request'
  subject             text NOT NULL,
  body_html           text NOT NULL,
  -- Optional context links — useful for the modal's "View" sub-dialog to
  -- jump to the related entity.
  related_entity_type text,   -- 'document' | 'profile' | 'service' | null
  related_entity_id   uuid,
  -- Resend metadata (so we can correlate with their dashboard if needed).
  resend_message_id   text,
  status              text NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_comms_service       ON public.service_communications(service_id);
CREATE INDEX IF NOT EXISTS idx_comms_service_time  ON public.service_communications(service_id, sent_at DESC);

ALTER TABLE public.service_communications ENABLE ROW LEVEL SECURITY;
-- App talks via service-role only, same pattern as audit_log + waivers.
```

`db:push` + `db:status` must come back clean.

### Step 1.2 — Shared logger helper

File: `src/lib/email/logCommunication.ts`.

```ts
import { createAdminClient } from "@/lib/supabase/admin";

export interface LogCommunicationInput {
  serviceId: string;
  tenantId: string;
  sentBy: string | null;
  sentByName: string | null;
  sentToEmail: string | null;
  sentToProfileId: string | null;
  emailType: string;
  subject: string;
  bodyHtml: string;
  relatedEntityType?: "document" | "profile" | "service" | null;
  relatedEntityId?: string | null;
  resendMessageId?: string | null;
  status?: "sent" | "failed";
}

export async function logCommunication(input: LogCommunicationInput): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("service_communications").insert({
    tenant_id: input.tenantId,
    service_id: input.serviceId,
    sent_by: input.sentBy,
    sent_by_name: input.sentByName,
    sent_to_email: input.sentToEmail,
    sent_to_profile_id: input.sentToProfileId,
    email_type: input.emailType,
    subject: input.subject,
    body_html: input.bodyHtml,
    related_entity_type: input.relatedEntityType ?? null,
    related_entity_id: input.relatedEntityId ?? null,
    resend_message_id: input.resendMessageId ?? null,
    status: input.status ?? "sent",
  });
  if (error) {
    // Don't throw — comms log is best-effort. The email itself already sent.
    console.error("[logCommunication] failed:", error);
  }
}
```

Best-effort write — never block or fail the calling endpoint. The email has already been sent at that point; we just log it.

### Step 1.3 — Wire every email endpoint

For each endpoint that calls `resend.emails.send(...)`, add a `logCommunication(...)` call right after the send succeeds. The endpoints (paths) are listed below; for each, identify the existing variable that holds the rendered `html` string and the recipient, then add the log call with the appropriate `emailType`:

| Endpoint | `emailType` value | `related_entity_type` | `related_entity_id` |
|---|---|---|---|
| `src/app/api/admin/clients/[id]/send-invite/route.ts` | `client_signup_invite` | `profile` | client's primary profile id |
| `src/app/api/admin/profiles/[id]/send-invite/route.ts` | `profile_kyc_invite` | `profile` | the profile id |
| `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` | `service_kyc_invite` | `profile` | the linked profile id |
| `src/app/api/admin/documents/[id]/request-update/route.ts` | `document_update_request` | `document` | the document id |
| `src/app/api/admin/processes/[id]/request-documents/route.ts` | `process_documents_request` | `service` | the service id |

For the **client signup invite** (`/api/admin/clients/[id]/send-invite`), the route operates on clients, not services. Two options:
- (a) Look up the service(s) tied to the client at log time; log one row per service.
- (b) Allow `service_communications.service_id` to be nullable for client-level events.

**Pick (a)** — keeping `service_id NOT NULL` is correct (every email is "about" something in service context). If the client has multiple services, log one row per. This makes the modal on each `/admin/services/[id]` page show only that service's emails.

For each endpoint, pass `sent_by = session.user.id` and `sent_by_name = session.user.name ?? session.user.email`. Capture Resend's returned message id from `data?.id` when the send succeeds.

### Step 1.4 — Commit + push + CHANGES.md

```
feat: log every outbound email to service_communications (body + metadata)
```

CHANGES.md entry under `## B-108` → batch 1, list the migration filename + the 5 endpoints touched.

---

## Batch 2 — Communications UI (right-rail card + modal)

**Goal:** New right-rail card "Communications" with count + `View all` button → full-screen modal listing emails for this service. Each row has a View icon → sub-dialog with the rendered HTML body.

### Step 2.1 — Server-side fetch

In [`src/app/(admin)/admin/services/[id]/loadServiceDetail.ts`](src/app/(admin)/admin/services/[id]/loadServiceDetail.ts), add a parallel fetch:

```ts
supabase
  .from("service_communications")
  .select(`
    id, sent_at, sent_by, sent_by_name, sent_to_email, sent_to_profile_id,
    email_type, subject, body_html, related_entity_type, related_entity_id, status
  `)
  .eq("service_id", serviceId)
  .eq("tenant_id", tenantId)
  .order("sent_at", { ascending: false })
  .limit(200),
```

Plumb the result through the loader's payload as `communications: ServiceCommunication[]` (define the type in [`src/app/(admin)/admin/services/[id]/page.tsx`](src/app/(admin)/admin/services/[id]/page.tsx) next to `WaivedDocumentRequirement`).

### Step 2.2 — Right-rail card

In `ServiceDetailClient.tsx`, render a new card in the right rail (the section currently containing Status, Internal Notes, Risk Assessment, etc.). Match the existing card styling. Card body:

```
COMMUNICATIONS
<count> emails sent

[ View all ]
```

If `count === 0`, show muted text "No emails sent yet" and disable the button.

Component: `src/components/admin/ServiceCommunicationsCard.tsx` for the card + button.

### Step 2.3 — Modal

`src/components/admin/ServiceCommunicationsDialog.tsx` — full-screen dialog (large width, scrollable body):

Table columns:
| Date (long format, B-100 tooltip pattern) | To (email + profile name if known) | Type (label-cased: "Document update request" etc.) | Subject (truncated to ~80 chars + ellipsis) | View |

The View column is an icon-only button (`Eye` from lucide) that opens a **nested** dialog with the full rendered HTML body inside an `<iframe srcDoc={comm.body_html} sandbox="">`. The iframe `sandbox=""` (no allow-flags) prevents the email body from running scripts or making network calls — defensive against future inbound content. Adjust height to fit content (`min-h-[60vh]`).

Sub-dialog header repeats date + recipient + subject for context. Close button returns to the list.

Filter / sort on the list dialog:
- Filter by email type (segmented pills or a small dropdown).
- Default sort: most recent first (already handled server-side).

### Step 2.4 — Commit + push + CHANGES.md

```
feat: communications card in right rail + modal with full email body viewer
```

CHANGES.md entry under `## B-108` → batch 2. Note the iframe sandbox approach (defensive against any inbound HTML; future-proof).

---

## Batch 3 — Service alerts (auto + manual)

**Goal:** New button in the step-pill row next to `Documents` → opens a modal listing alerts. Two sources: (a) auto alerts computed live from underlying data; (b) manual alerts persisted in a new table. Admin can resolve manual alerts and dismiss auto ones.

### Step 3.1 — Migration

File: `supabase/migrations/<timestamp>_service_alerts.sql`.

```sql
-- Manual alerts only — auto alerts are computed at render time so they
-- always reflect current truth.
CREATE TABLE IF NOT EXISTS public.service_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                 REFERENCES public.tenants(id),
  service_id   uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  severity     text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title        text NOT NULL,
  note         text,
  status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open', 'resolved')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES public.users(id),
  resolved_at  timestamptz,
  resolved_by  uuid REFERENCES public.users(id)
);

CREATE INDEX IF NOT EXISTS idx_alerts_service ON public.service_alerts(service_id);
CREATE INDEX IF NOT EXISTS idx_alerts_open    ON public.service_alerts(service_id) WHERE status = 'open';

-- Dismissals of *auto* alerts (which aren't persisted). A dismissal is keyed
-- on `(service_id, auto_alert_key)`; auto-detection re-suppresses an alert
-- whose key matches an existing dismissal row. Re-show happens automatically
-- when the underlying condition resolves and recurs (different key).
CREATE TABLE IF NOT EXISTS public.dismissed_auto_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                    REFERENCES public.tenants(id),
  service_id      uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  auto_alert_key  text NOT NULL,
  dismissed_at    timestamptz NOT NULL DEFAULT now(),
  dismissed_by    uuid REFERENCES public.users(id),
  UNIQUE (service_id, auto_alert_key)
);

ALTER TABLE public.service_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dismissed_auto_alerts ENABLE ROW LEVEL SECURITY;
```

`db:push` + `db:status` must be clean.

### Step 3.2 — Auto-detection helper

File: `src/lib/alerts/computeAutoAlerts.ts`.

Two detection rules to start:

```ts
export interface AutoAlert {
  key: string;          // stable, idempotent — `doc_expiry_<docId>`, `kyc_age_<profileId>`
  severity: "info" | "warning" | "critical";
  title: string;        // e.g. "Passport expires in 23 days — John Doe"
  note: string;         // longer context
  sourceEntityType: "document" | "profile";
  sourceEntityId: string;
  detectedAt: string;   // now()
}

export function computeAutoAlerts(input: {
  documents: ServiceDoc[];
  profiles: ClientProfile[];     // with their last KYC update timestamp
  now?: Date;
}): AutoAlert[] {
  const out: AutoAlert[] = [];
  const now = (input.now ?? new Date()).getTime();

  // Rule 1: documents expiring within 60 days.
  for (const d of input.documents) {
    if (!d.expiry_date) continue;
    const days = Math.round((new Date(d.expiry_date).getTime() - now) / 86400_000);
    if (days < 0) {
      out.push({
        key: `doc_expired_${d.id}`,
        severity: "critical",
        title: `${d.document_types?.name ?? "Document"} expired ${Math.abs(days)} days ago`,
        note: `Uploaded ${d.uploaded_at}. Owner: ${d.client_profiles?.full_name ?? "—"}.`,
        sourceEntityType: "document",
        sourceEntityId: d.id,
        detectedAt: new Date().toISOString(),
      });
    } else if (days <= 60) {
      out.push({
        key: `doc_expiry_${d.id}`,
        severity: days <= 30 ? "warning" : "info",
        title: `${d.document_types?.name ?? "Document"} expires in ${days} days`,
        note: `Owner: ${d.client_profiles?.full_name ?? "—"}.`,
        sourceEntityType: "document",
        sourceEntityId: d.id,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // Rule 2: KYC last updated > 12 months ago (profile-level).
  const TWELVE_MONTHS_MS = 365 * 86400_000;
  for (const p of input.profiles) {
    const last = p.kyc_updated_at;
    if (!last) continue;
    const age = now - new Date(last).getTime();
    if (age > TWELVE_MONTHS_MS) {
      const days = Math.floor(age / 86400_000);
      out.push({
        key: `kyc_age_${p.id}`,
        severity: age > TWELVE_MONTHS_MS * 1.5 ? "warning" : "info",
        title: `KYC review overdue — ${p.full_name}`,
        note: `Last reviewed ${days} days ago.`,
        sourceEntityType: "profile",
        sourceEntityId: p.id,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  return out;
}
```

Pure function. Keep it side-effect-free so it's easy to unit-test later (defer the test, but the shape is unit-testable).

### Step 3.3 — Load dismissals + apply at the page level

In `loadServiceDetail.ts`, add a parallel fetch:

```ts
supabase
  .from("dismissed_auto_alerts")
  .select("auto_alert_key, dismissed_at, dismissed_by")
  .eq("service_id", serviceId)
  .eq("tenant_id", tenantId),
```

…and the manual alerts:

```ts
supabase
  .from("service_alerts")
  .select("id, severity, title, note, status, created_at, created_by, resolved_at, resolved_by")
  .eq("service_id", serviceId)
  .eq("tenant_id", tenantId)
  .order("created_at", { ascending: false }),
```

In `ServiceDetailClient.tsx`, compute the combined alert list:

```ts
const autoAlerts = useMemo(
  () => computeAutoAlerts({ documents, profiles, now: new Date() }),
  [documents, profiles],
);
const dismissedKeys = useMemo(
  () => new Set(dismissedAutoAlerts.map((d) => d.auto_alert_key)),
  [dismissedAutoAlerts],
);
const visibleAutoAlerts = autoAlerts.filter((a) => !dismissedKeys.has(a.key));
const openManualAlerts  = manualAlerts.filter((m) => m.status === "open");
const totalAlertCount   = visibleAutoAlerts.length + openManualAlerts.length;
```

### Step 3.4 — Entry button in the step pill row

In `ServiceDetailClient.tsx` around the step-pill row (B-103/107 modifications), add an `Alerts` button next to the existing Review Wizard button. Visual treatment:

- Same pill shape as Review Wizard but `#dc2626` (red) when `totalAlertCount > 0`, or muted gray `#94a3b8` when zero.
- Label: `Alerts (<count>)`.
- Icon: lucide `Bell` or `AlertTriangle` (warning) — match severity of the highest-severity open alert (critical = AlertTriangle red, warning = Bell amber, info = Bell gray).
- Click → opens the alerts dialog.

Position: keep Review Wizard at the right edge as today, place Alerts button to the LEFT of Review Wizard, with the same `gap-x-8` (so both are visually separated from the step pills and from each other).

### Step 3.5 — Alerts modal

`src/components/admin/ServiceAlertsDialog.tsx`.

Two sections inside one modal:

1. **Open alerts** — combined list of `visibleAutoAlerts` and `openManualAlerts`, sorted by severity then created date. Each row:
   - Severity icon + label
   - Title (bold) + note (smaller, muted)
   - Source link (e.g. "↗ Driving Licence" → opens the doc detail dialog) for auto alerts that point at an entity
   - Action button: `Resolve` for manual alerts (writes `status='resolved'`) or `Dismiss` for auto alerts (writes a `dismissed_auto_alerts` row)
2. **Resolved alerts** — collapsible at the bottom, shows resolved manual alerts (for audit trail / context).

Below the lists: an inline form (or a small + button revealing a form) for **adding a manual alert**:
- Title (required)
- Note (optional textarea)
- Severity (segmented pills: info / warning / critical)
- Save → POST → refresh list.

### Step 3.6 — API routes

Create:

- `POST /api/admin/services/[id]/alerts` — body `{ title, note?, severity }` → insert into `service_alerts` with `created_by = session.user.id, status = 'open'`. Audit log `service_alert_created`.
- `PATCH /api/admin/services/[id]/alerts/[alertId]` — body `{ status: 'resolved' }` → update row, set `resolved_at + resolved_by`. Audit log `service_alert_resolved`.
- `POST /api/admin/services/[id]/alerts/dismiss-auto` — body `{ auto_alert_key }` → upsert into `dismissed_auto_alerts`. Audit log `auto_alert_dismissed` with the key in metadata.

Auth: admin_users only. Mirror the pattern from `waive-document/route.ts`.

### Step 3.7 — Commit + push + CHANGES.md

```
feat: service alerts (auto-detected + manual) with dismiss/resolve flow
```

CHANGES.md entry under `## B-108` → batch 3, list both migration filenames.

---

## Acceptance criteria

- [ ] `npm run build` clean after each batch
- [ ] DB: `service_communications`, `service_alerts`, `dismissed_auto_alerts` exist with the right columns
- [ ] Sending a doc update request creates a row in `service_communications`; opening the new Communications card → modal shows it; clicking View shows the rendered email body in an iframe
- [ ] Sending any of the 5 email types (signup invite, profile kyc invite, service kyc invite, document update request, process documents request) creates a row with the correct `email_type`
- [ ] On a service with a doc expiring in <60 days, the Alerts button shows `Alerts (1)` and the modal lists the doc with severity matching the rule
- [ ] On a service with KYC last-reviewed > 12 months, the Alerts button increments
- [ ] Admin can add a manual alert; it appears in the open list; resolving it moves it to the resolved section
- [ ] Admin can dismiss an auto alert; it disappears from the list and doesn't return until the underlying condition resolves and recurs (different key)
- [ ] Alerts button visual matches severity of the highest-severity open alert
- [ ] `npm run db:status` clean
- [ ] CHANGES.md has three sub-entries under `## B-108`

---

## Tech debt to log

Append to `docs/tech-debt.md` after batch 3:

- **Auto alert dismissals never expire.** A `dismissed_auto_alerts` row keyed on `(service_id, auto_alert_key)` permanently suppresses that exact alert. If the underlying condition recurs at the same expiry date / age threshold, the dismissal still applies (same key). Acceptable for v1 since most auto alerts have time-varying keys (`doc_expiry_<id>` is per-doc not per-date), but document so we revisit if alert recurrence becomes noisy.
- **Communications log doesn't track delivery status.** We store `status='sent'` based on Resend's synchronous response. Bounces/spam complaints fired later via webhook aren't captured. Add a webhook handler when delivery monitoring becomes a real need.
- **Email body stored verbatim — no template versioning.** If we change the invite template, old rows still show the old body. Fine for an audit log; bad if we ever want to re-render with current branding. Won't fix.

---

## After all three batches

Final commit + push + CHANGES.md → tell Vanessa: "B-108 done — communications log + alerts live." Stop.
