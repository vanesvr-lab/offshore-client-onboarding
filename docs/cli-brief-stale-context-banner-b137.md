# B-137 — Stale-context banner on document detail dialog

## Why

AI verification runs at upload time using whatever profile / KYC context exists in the database THEN. If the profile is later updated (name filled in, address corrected, occupation set), the AI's verification result becomes stale — but the document keeps showing whatever status it had at upload time. Admin has no signal that the verification might be outdated.

Concrete example from Vanessa's test:

1. Tony Stark's `client_profiles` row was created without `full_name` set.
2. Vanessa uploaded the proof-of-address PDF.
3. AI verification fired with `applicant_full_name = null` → name-match rule (Rule 1) couldn't be evaluated → flagged.
4. Vanessa then filled `client_profiles.full_name = "ANTHONY EDWARD STARK"`.
5. The document still shows "AI flagged issues" + "the document shows 'Anthony E. Stark' but no applicant name was provided" — even though the name IS now provided.

The fix isn't to defer AI verification (which I initially suggested) — that only handles the upload-before-save window. The real solution is to detect when the context has drifted from what AI saw, and prompt re-verification. This covers ALL drift cases: initial upload before form save, admin edits later, KYC re-fill via filing rep, etc.

Implementation: timestamp comparison on the document detail dialog. If `profile.updated_at > doc.verified_at` OR `kyc.updated_at > doc.verified_at`, the document was verified against now-stale context. Show a banner with a "Re-run AI" button (which already exists in the ADMIN REVIEW section — this just adds discoverability at the top of the dialog).

## Out of scope (do NOT do in B-137)

- **Auto re-run AI when context changes.** No background job, no save-side trigger. Drift is detected on view; admin chooses when to re-run.
- **`ai_deferred = true` on doc types.** Earlier-proposed alternative, dropped per the design conversation.
- **Per-field drift tracking.** B-137 uses table-level `updated_at`; it'll false-positive when admin edits a profile field that doesn't actually affect verification (e.g. phone number). False positives are cheap — admin clicks Re-run AI and verification confirms the same result.
- **Refresh-without-AI-cost option.** No "skip the AI call, just clear the badge" affordance. If the banner says "context changed", clicking actually re-verifies.
- **Banner on service-scoped docs** (Certificate of Incorporation, etc.) — those don't have a `client_profile_id`, so there's no profile context to drift. Banner only renders on per-person docs.

---

## Batch 1 — Stale-context detection + banner

### Server-side: detect drift when loading the document detail data

Locate where the document detail dialog loads its data. Likely candidates:

- `src/app/(admin)/admin/services/[id]/loadServiceDetail.ts` (where documents are loaded with related profile)
- A separate `/api/admin/documents/[id]` route or RSC fetch

When loading a document that has a non-null `client_profile_id` AND a non-null `verified_at`:

```ts
// Pseudocode — same pattern wherever document detail data is assembled
async function loadDocumentWithStaleness(documentId: string) {
  const { data: doc } = await supabase
    .from("documents")
    .select(`
      id, verified_at, verification_status, verification_result, client_profile_id,
      document_type_id, file_name, file_path, /* ...everything else needed by dialog... */
      client_profiles!inner(id, full_name, updated_at,
        client_profile_kyc(updated_at))
    `)
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return null;

  // Compute stale-context flag server-side
  const profileUpdatedAt = doc.client_profiles?.updated_at ?? null;
  const kycUpdatedAt =
    Array.isArray(doc.client_profiles?.client_profile_kyc)
      ? doc.client_profiles?.client_profile_kyc?.[0]?.updated_at ?? null
      : null;
  const verifiedAt = doc.verified_at;

  const contextNewerThanVerification =
    !!verifiedAt && (
      (!!profileUpdatedAt && profileUpdatedAt > verifiedAt) ||
      (!!kycUpdatedAt && kycUpdatedAt > verifiedAt)
    );

  return { ...doc, context_is_stale: contextNewerThanVerification };
}
```

The flag should be attached to the document object so the View dialog component renders the banner without a second round-trip.

### Client-side: render the banner

Locate the document detail dialog component (CLI: grep for the dialog opened from the eye-icon View click in `loadServiceDetail.ts` flow). The dialog already renders:
- The status pills ("AI flagged issues", "Pending admin review")
- The AI verification block (Confidence / Rules passed / explanation)
- EXTRACTED FIELDS panel
- ADMIN REVIEW section (with the existing Re-run AI button)

Add a NEW banner above the status pills (between the document preview and the STATUS section), visible only when `doc.context_is_stale === true`:

```tsx
{doc.context_is_stale && (
  <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm text-blue-900 flex items-center justify-between gap-3">
    <div className="flex items-start gap-2 min-w-0">
      <RefreshCw className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Profile info has changed</p>
        <p className="text-xs text-blue-800 mt-0.5">
          This document was verified before the profile was updated. Re-run AI to refresh.
        </p>
      </div>
    </div>
    <Button
      size="sm"
      onClick={() => onRerunAi()}
      disabled={rerunPending}
      className="bg-blue-600 hover:bg-blue-700 text-white shrink-0 h-8 text-xs"
    >
      {rerunPending ? (
        <>
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Re-running…
        </>
      ) : (
        <>
          <RefreshCw className="h-3 w-3 mr-1" />
          Re-run AI
        </>
      )}
    </Button>
  </div>
)}
```

`onRerunAi` calls the existing `/api/documents/[id]/verify-with-context` endpoint (the same one the existing ADMIN REVIEW "Re-run AI" button uses). On success, refetch the document data so the badges + extracted fields + banner state all update.

**Important — don't render the banner if `doc.verified_at` is null** (the document was never verified successfully, so there's nothing to be "stale"; this would be a different status: "manual_review" or "pending").

### Verification (Batch 1)

Manual:
1. Find a per-person document (Tony's passport or proof-of-address) that's already been verified.
2. Check the document detail dialog → no banner visible.
3. In the KYC form, change Tony's full_name from "ANTHONY EDWARD STARK" to "Anthony E. Stark" (and save).
4. Re-open the document detail dialog → blue banner now visible at the top: "Profile info has changed".
5. Click "Re-run AI" → spinner → re-verification completes → banner disappears (since `verified_at` is now newer than `profile.updated_at`).
6. Toggle the name back, save → banner reappears.

Edge cases:
1. Re-upload a doc (replace) → `verified_at` gets refreshed by the verification re-run → banner shouldn't appear (assuming no profile edit between upload and view).
2. Service-scoped doc (e.g. corporate Certificate of Incorporation) → no `client_profile_id` → banner doesn't render.
3. Brand-new doc with `verification_status = "pending"` and `verified_at = null` → banner doesn't render (different state, handled by existing "Pending verification" UI).

### Commit message (Batch 1)

```
feat: stale-context banner on document detail (B-137)

Document detail dialog now detects when profile.updated_at or
client_profile_kyc.updated_at is newer than documents.verified_at,
indicating the AI's verification ran against now-stale context.
Shows a blue banner at the top of the dialog with a Re-run AI
button that fires /api/documents/[id]/verify-with-context.

Detection is server-side (in the data loader) so the dialog
renders the banner without a second round-trip. Only fires on
per-person docs (client_profile_id != null) where verified_at is
non-null. Re-upload paths automatically clear the banner via
the refreshed verified_at.
```

---

## Batch 2 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-137 — Stale-context banner on document detail (done YYYY-MM-DD)`. Mention this replaces the earlier ai_deferred approach.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Verification-context signature for precise drift detection — B-137 uses `profile.updated_at > doc.verified_at`, which false-positives when admin edits a profile field that doesn't affect verification (e.g. phone). Could add a `verification_context_signature` text column on documents (hash of the fields actually used in the AI prompt) and compare hashes instead of timestamps. Cleaner, but more code surface. Estimate: ~3 hours; defer until false positives become annoying."
- **Add new Open entry**: "Banner on bulk reviews — when an admin opens the per-document dialog, the banner shows. If an admin is bulk-reviewing many docs from a list view, they don't see the banner until they click into each. A list-level chip ('1 doc has stale verification') could surface drift earlier. ~half-day."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure app-code change.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No `ai_deferred = true` migration on doc types.
- No auto re-run AI when context changes — admin clicks the button.
- No verification-context signature column — timestamp comparison only.
- No banner on service-scoped docs without `client_profile_id`.
- No list-view drift indicator.
