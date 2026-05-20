# B-144 — Add a human-recognizable name to every service

## Why

Today services are identified by `service_number` (e.g. `GBC-0005`). The numbering is systematic but not memorable — an admin scanning the queue can't tell `GBC-0005` from `GBC-0006` without clicking in. Vanessa wants every service to carry a human-readable name as a SECONDARY label alongside the service_number, so admins can recognize "Acme Holdings GBC setup" or "Tony Stark — relocation" at a glance.

Design decisions (locked per the 2026-05-20 conversation):

- **Display priority**: service_number stays as the primary H1 everywhere. Name renders as a supplementary line below / next to it. Not a replacement, just a recognizable label.
- **Required at creation**: New Service wizard requires a name; Create button is disabled until the field is non-empty.
- **Existing services**: backfilled to `"{Template name} ({service_number})"` so every row has a non-empty name immediately after the migration. Admins can edit them via the service detail page when they care.

## Out of scope (do NOT do in B-144)

- **Search by name in the queue** — the existing search input on `/admin/queue` matches service_number / client name / template. Adding `name` to the search match list is a small follow-up; could be done in this brief if cheap, but the focus is data + display.
- **Permission gate on naming** — anyone with `data_access = 'edit'` (the existing flag from B-127) can edit the name. No new permission flag.
- **Auto-rename when underlying data changes** — if the primary director's name changes later, the service's name does NOT auto-update. Admins rename manually.
- **Versioning / history of name changes** — the audit_log captures the change but no dedicated "previous names" view.
- **Name uniqueness constraint** — two services CAN have the same name. service_number is the unique identifier.

---

## Batch 1 — Schema migration + backfill

### Migration: `<timestamp>_services_name.sql`

Use `npx supabase migration new services_name` to generate the timestamp.

```sql
-- B-144 — Add human-recognizable name to services.

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS name text;

-- Backfill existing rows: "{Template name} ({service_number})"
-- so every existing service has a non-empty name immediately.
UPDATE public.services s
SET name = COALESCE(
  st.name || ' (' || s.service_number || ')',
  s.service_number,  -- fallback when template name is somehow null
  'Service'           -- last-resort fallback
)
FROM public.service_templates st
WHERE s.service_template_id = st.id
  AND (s.name IS NULL OR s.name = '');

-- For services whose template lookup failed (unlikely but possible),
-- backfill with just the service_number.
UPDATE public.services
SET name = COALESCE(service_number, 'Service')
WHERE name IS NULL OR name = '';

-- Now add NOT NULL constraint
ALTER TABLE public.services
  ALTER COLUMN name SET NOT NULL;

-- Add CHECK to prevent empty-string names from sneaking in
ALTER TABLE public.services
  DROP CONSTRAINT IF EXISTS services_name_non_empty;
ALTER TABLE public.services
  ADD CONSTRAINT services_name_non_empty CHECK (length(trim(name)) > 0);

-- Audit trigger: log name changes (mirrors B-130's assignment trigger).
CREATE OR REPLACE FUNCTION public.log_service_name_change() RETURNS trigger AS $$
BEGIN
  IF OLD.name IS DISTINCT FROM NEW.name THEN
    INSERT INTO public.audit_log (
      actor_id, actor_role, action, entity_type, entity_id,
      previous_value, new_value
    ) VALUES (
      auth.uid(),
      'admin',
      'service_renamed',
      'service',
      NEW.id,
      jsonb_build_object('name', OLD.name),
      jsonb_build_object('name', NEW.name)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS service_name_audit ON public.services;
CREATE TRIGGER service_name_audit
  AFTER UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.log_service_name_change();
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
-- Every service has a name now
SELECT count(*) FROM public.services WHERE name IS NULL OR trim(name) = '';
-- Expect: 0

-- Spot-check the backfill
SELECT service_number, name FROM public.services LIMIT 5;
-- Expect: rows like ('GBC-0005', 'Global Business Company (GBC-0005)')

-- Empty-string protection
UPDATE public.services SET name = '   ' WHERE id = '<some-id>';
-- Expect: CHECK violation

-- Trigger fires on rename
UPDATE public.services SET name = 'Test rename' WHERE id = '<some-id>';
SELECT action, previous_value, new_value FROM public.audit_log
WHERE entity_id = '<some-id>' AND action = 'service_renamed'
ORDER BY created_at DESC LIMIT 1;
```

### Commit message (Batch 1)

```
feat(db): services.name + backfill + audit trigger (B-144)

Adds a human-recognizable name to every service so admins can
identify them by something more memorable than the systematic
service_number. Existing rows backfilled to "{Template name}
({service_number})" so every service has a non-empty name
immediately. NOT NULL + non-empty CHECK enforces every future
insert sets one. Audit trigger logs every rename as
service_renamed.
```

---

## Batch 2 — New Service wizard requires the name

### Update `src/app/(admin)/admin/services/new/NewServiceWizard.tsx`

Locate Step 1 (Pick template) — it's currently just the template picker. Add a name field below the picker (or to a new "Name + template" combined step, whichever fits the existing flow best).

```tsx
<div className="space-y-2 mt-6">
  <label className="block text-sm font-medium text-gray-700">
    Service name <span className="text-red-500">*</span>
  </label>
  <input
    type="text"
    value={name}
    onChange={(e) => setName(e.target.value)}
    placeholder="e.g. Acme Holdings GBC 2026"
    className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
    autoFocus
  />
  <p className="text-xs text-gray-500">
    A short label admins can recognize this service by. You can change it later.
  </p>
</div>
```

### Validation

The wizard's "Next" / "Create" button must disable until `name.trim().length > 0`. Extend the existing per-step validation pattern in the wizard.

### POST body

Update the wizard's submit handler to include `name` in the POST body to `/api/admin/services` (or whatever the service-create endpoint is). CLI: grep for the existing service-create call.

### Update the create-service API route

In `src/app/api/admin/services/route.ts`:

```ts
const body = (await request.json()) as {
  service_template_id: string;
  name: string;       // NEW — required
  service_details?: Record<string, unknown>;
  roles?: Array<…>;
};

if (!body.service_template_id) return NextResponse.json({ error: "service_template_id is required" }, { status: 400 });
if (!body.name || body.name.trim().length === 0) {
  return NextResponse.json({ error: "Service name is required" }, { status: 400 });
}

// In the INSERT:
.from("services")
.insert({
  tenant_id: tenantId,
  service_template_id: body.service_template_id,
  name: body.name.trim(),       // NEW
  service_details: body.service_details ?? {},
  status: "start",
  ...(serviceNumber ? { service_number: serviceNumber } : {}),
})
```

### Verification (Batch 2)

Manual:
1. `/admin/services/new` → Step 1 shows the template list + a name field. Create button disabled when name is empty.
2. Type a name + pick a template + proceed. Service is created with the typed name persisted in `services.name`.
3. Verify in the DB: `SELECT name FROM services WHERE id = '<new-id>'` returns the typed name.

### Commit message (Batch 2)

```
feat: NewServiceWizard requires a service name (B-144)

Adds a required name field to Step 1 of the new-service wizard.
Create button stays disabled until the name is non-empty.
POST /api/admin/services validates name presence + trim, and the
INSERT includes the name. Existing services were backfilled in
Batch 1.
```

---

## Batch 3 — Display name as supplementary label on service detail + queue

### Service detail page header (`ServiceDetailClient.tsx`)

Locate the page header — currently shows the service_number as the H1 with the template name as a subtitle. Add the name as a SECONDARY line, NOT replacing service_number.

Suggested layout:

```tsx
<header>
  <h1 className="text-2xl font-bold text-brand-navy">
    {service.service_number}
  </h1>
  <p className="text-sm font-medium text-gray-700 mt-1 flex items-center gap-2">
    {service.name}
    {canEdit && (
      <button
        type="button"
        onClick={() => setEditingName(true)}
        className="text-gray-400 hover:text-gray-600"
        title="Edit service name"
      >
        <Pencil className="h-3 w-3" />
      </button>
    )}
  </p>
  <p className="text-xs text-gray-500 mt-0.5">
    {template.name} · {/* existing subtitle content */}
  </p>
</header>
```

Inline edit affordance: clicking the pencil icon swaps the `<p>` with the name for an `<input>` that saves on blur (calls `PATCH /api/admin/services/[id]` with `{ name }`). On save, the audit trigger from Batch 1 captures the rename automatically.

### Queue / ServicesTable (`src/components/admin/ServicesTable.tsx`)

In the "Service #" column, display the name as a smaller secondary line below the service_number:

```tsx
<td className="px-3 py-2">
  <Link href={`/admin/services/${s.id}`}>
    <div className="font-medium text-brand-navy">{s.service_number}</div>
    <div className="text-xs text-gray-500 truncate max-w-[300px]" title={s.name}>
      {s.name}
    </div>
  </Link>
</td>
```

Also extend the existing search input to match against `name` (it currently matches service_number / client / template — add name to the OR).

CLI: read the existing `ServicesTable.tsx` to see the exact column layout + search predicate before editing.

### PATCH API (`/api/admin/services/[id]`)

Existing route already accepts `assigned_admin_id`. Add `name` to the allowlist:

```ts
const ALLOWED_FIELDS = ["assigned_admin_id", "name"] as const;

if ("name" in body) {
  if (typeof body.name !== "string" || body.name.trim().length === 0) {
    return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
  }
  patch.name = body.name.trim();
}
```

The audit_log entry is automatic via the trigger from Batch 1.

### Verification (Batch 3)

Manual:
1. Open a service detail page. Header shows: service_number (H1) → name (subtitle with pencil) → template (smaller).
2. Click the pencil → input swaps in → type a new name → blur/Enter → name persists. Audit trail shows `service_renamed` with the before/after values.
3. Navigate to `/admin/queue`. Each row's first column shows service_number on top + name on a smaller line below.
4. Search the queue by typing part of a service name → results filter to matching services.

### Commit message (Batch 3)

```
feat: display service name as secondary label (B-144)

Service detail page header shows the name below the service_number
H1, with an inline pencil-edit affordance. PATCH /api/admin/services
/[id] accepts the name in its allowlist with a non-empty validation.
The audit_log trigger from Batch 1 captures every rename as
service_renamed.

Queue's ServicesTable renders the name as a smaller secondary line
beneath the service_number in the "Service #" column. The existing
search input now also matches against name (OR'd with service_number,
client, and template).
```

---

## Batch 4 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-144 — Service name (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Service name auto-rename signals — admin renames are manual today. If the primary director's name changes, the service's name doesn't auto-update. If we later want optional auto-suggestions ('Update service name to match new primary?'), that's a follow-up. ~half-day."
- **Add new Open entry**: "Bulk rename UI — no way to rename multiple services at once. If admins end up wanting to rename 20 services after a client rebrand, give them a bulk affordance. ~1-2 hours."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write, commit + push file, `db:push`, `db:status`, CHANGES.md.
2. **Per-batch commits:** four commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No auto-rename when the primary director / client info changes.
- No name uniqueness constraint — two services CAN have the same name; service_number is the unique handle.
- No bulk rename UI.
- No client-portal exposure of the name (admin-side label only).
- service_number stays as the primary identifier — name is supplementary.
