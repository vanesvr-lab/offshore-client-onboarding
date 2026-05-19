# B-128 — Chatbot wire-up + KB seed (client + admin assistant widgets)

## Why

The placeholder "AI assistant" widget in `ClientShell.tsx:42` ships as UI-only today (B-101 noted "no backend wiring yet"). Vanessa wants it functional for the client portal and wants a matching widget on the admin side. Use cases: "how do I do X in the UI?", "where do I find Y?", "what does Z mean?" — bounded, finite-knowledge questions where accuracy beats fluency.

The plumbing for content already exists: `public.knowledge_base` (currently used only by the AI document verification path) has a full CRUD admin UI at `/admin/settings/knowledge-base`. B-128 reuses that table — new entries are tagged with category (`howto` / `nav` / `glossary`) and `applies_to.audience` (`admin` / `client` / `both`) so the same table powers both surfaces with different filters.

Vanessa's design choices from the 2026-05-18 conversation:
- **Both client + admin (separate panels)** — same backend, two widgets, different audience filters.
- **Hybrid keyword + LLM fallback** — full-text search returns top matches; if zero results, Claude wraps the top-K KB entries into a natural-language answer.
- **Starting content scope: ~40 entries** — drafted in `docs/chatbot-kb-seed-b128.md` (this brief's companion file). Some entries are tagged `<!-- VERIFY -->` where I guessed terminology Vanessa should review post-deploy.

## Out of scope (do NOT do in B-128)

- Embedding-based semantic search (no pgvector). If full-text search misses too many paraphrases in practice, B-130 can add embeddings; for now, Claude fallback covers paraphrase gaps.
- Multi-turn chat memory — every question is independent. The widget shows the last N turns visually but doesn't pass history to the search/LLM call.
- "Was this helpful?" feedback capture — defer until we have real usage data to know if it's worth the schema + UI work.
- Streaming responses — Claude responses are one-shot. Streaming is a polish layer (B-131+).
- Suggested-question chips on widget open — defer.

## Batch 1 — Seed migration

### Migration: `<timestamp>_seed_chatbot_kb.sql`

Use `npx supabase migration new seed_chatbot_kb` to generate the timestamp. The migration is **idempotent** (`ON CONFLICT (title) DO NOTHING`) so re-running it doesn't reset entries that Vanessa has edited in the admin UI.

For every entry in `docs/chatbot-kb-seed-b128.md`, emit one `INSERT` row:

```sql
INSERT INTO public.knowledge_base (title, category, content, applies_to, source, is_active)
VALUES
  (
    'How do I add a Director, Shareholder, or UBO to a service?',
    'howto',
    $$<the markdown content between ---content--- markers>$$,
    '{"audience": "admin"}'::jsonb,
    'b128_seed',
    true
  ),
  -- … one row per entry from the content file …
ON CONFLICT (title) DO NOTHING;
```

**Parsing notes for CLI:**
- The content file uses `### entry: <slug>` as the section header for each entry.
- Below each header: `category`, `audience`, `title` listed as bullet points.
- The markdown content lives between `---content---` and `---end---` markers.
- Strip the markers before inserting; preserve all markdown inside (including code fences, lists, links — Postgres stores it as plain `text`).
- Use Postgres dollar-quoting (`$$...$$`) for the content to avoid escaping single quotes inside markdown.

**`ON CONFLICT` target:** `(title)`. The current `knowledge_base` table may not have a UNIQUE constraint on `title` — if not, add one in this same migration *before* the INSERTs:

```sql
-- Add UNIQUE only if not already present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'knowledge_base' AND indexname = 'knowledge_base_title_key'
  ) THEN
    -- First, dedupe any existing duplicates (keep the most recently updated)
    DELETE FROM public.knowledge_base a
    USING public.knowledge_base b
    WHERE a.id < b.id AND a.title = b.title;

    ALTER TABLE public.knowledge_base ADD CONSTRAINT knowledge_base_title_key UNIQUE (title);
  END IF;
END$$;
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
-- Count seeded entries (should be ~40)
SELECT category, COUNT(*) FROM public.knowledge_base WHERE source = 'b128_seed' GROUP BY category;

-- Confirm audience filtering works
SELECT title FROM public.knowledge_base WHERE applies_to->>'audience' IN ('admin','both') AND is_active = true LIMIT 5;
```

Open `/admin/settings/knowledge-base` in the running app and confirm the new entries appear in the table.

### Commit message (Batch 1)

```
feat(db): seed chatbot knowledge base (~40 entries, B-128)

Idempotent seed of howto / nav / glossary entries into
knowledge_base, sourced from docs/chatbot-kb-seed-b128.md.
Entries tagged with applies_to.audience so the client + admin
widgets render the correct subset. Adds a UNIQUE constraint on
title to make the seed safely re-runnable.
```

---

## Batch 2 — Chatbot search API

### New route: `POST /api/chatbot/ask`

Public endpoint (no auth required for the client widget); the response itself filters by audience. Body:

```ts
{
  question: string;          // user's question text
  audience: 'admin' | 'client';
}
```

Logic:

1. **Validate**: `question` non-empty (≤ 500 chars), `audience` is one of the two.
2. **Keyword search via Postgres full-text:**
   ```sql
   SELECT id, title, category, content, applies_to
   FROM public.knowledge_base
   WHERE is_active = true
     AND (applies_to->>'audience' IN ($audience_arg, 'both'))
     AND (
       to_tsvector('english', title || ' ' || content) @@ plainto_tsquery('english', $question)
       OR title ILIKE '%' || $question || '%'
     )
   ORDER BY ts_rank(to_tsvector('english', title || ' ' || content), plainto_tsquery('english', $question)) DESC
   LIMIT 5;
   ```
   Cast the typed search via `plainto_tsquery` (forgiving of natural-language input). The `ILIKE` fallback catches substring-only matches the tsvector misses.

3. **If matches found (>= 1):** return them as-is:
   ```ts
   {
     mode: 'keyword',
     matches: [{ id, title, category, content, similarity_score }, …]
   }
   ```

4. **If zero matches:** **LLM fallback.** Load up to 10 candidate entries (broader filter — just by audience, ignoring the question) and pass them as context to Claude:

   ```ts
   // src/lib/chatbot/llmFallback.ts
   const candidates = await loadAllActiveByAudience(audience);  // up to 10
   const messages = [
     { role: 'user', content: `Answer the user's question using ONLY the knowledge below.
       If the knowledge doesn't contain the answer, say "I don't have that information yet —
       try asking your account manager." Do not invent procedures, paths, or terms.
       
       Knowledge:
       ${candidates.map(c => `## ${c.title}\n${c.content}`).join('\n\n')}
       
       Question: ${question}` }
   ];
   const completion = await anthropic.messages.create({
     model: 'claude-opus-4-6',
     max_tokens: 600,
     messages,
   });
   const text = completion.content[0].text;
   ```

   Response shape:
   ```ts
   {
     mode: 'llm',
     answer: string,
     candidates: [{ id, title, category }, …]  // for "Sources" UI
   }
   ```

5. **Audit log** the question text + mode (`keyword` vs `llm`) + matched entry IDs into a new lightweight table OR just leave it for now (decide based on whether tracking matters for V1). Recommendation: skip for B-128, add in a follow-up if useful.

6. **Errors:** If the LLM call fails (rate limit, network), return `{ mode: 'error', message: 'The assistant is unavailable right now — try again in a moment.' }` rather than crashing.

### Index for fast search

Add to Batch 1's migration (or a new one):

```sql
CREATE INDEX IF NOT EXISTS knowledge_base_fts_idx
  ON public.knowledge_base
  USING GIN (to_tsvector('english', title || ' ' || content));
```

### Verification (Batch 2)

```bash
# Smoke-test the API
curl -X POST http://localhost:3000/api/chatbot/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "how do I add a director", "audience": "admin"}'
# Expect: mode=keyword, matches array with the "How do I add a Director" entry first.

curl -X POST http://localhost:3000/api/chatbot/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "tell me about cats", "audience": "admin"}'
# Expect: mode=llm, answer says it doesn't have that info.
```

### Commit message (Batch 2)

```
feat: chatbot search API + LLM fallback (B-128)

POST /api/chatbot/ask runs Postgres full-text search over
knowledge_base filtered by applies_to.audience. Returns top 5
keyword matches; if zero matches, falls through to claude-opus-4-6
with up to 10 audience-filtered entries as context. Adds a GIN
index on (title || content) for fast tsvector lookups.
```

---

## Batch 3 — Client widget wire-up

### Update: `src/components/shared/ClientShell.tsx`

The placeholder widget at line 42 currently renders UI only. Replace its internal state + display with a real chat interaction.

**Widget shape:**
- A small floating bubble at the bottom-right of every client page (`ClientShell` is the layout shared across `/dashboard`, `/apply`, `/applications/[id]`, etc.).
- Click → expand into a panel (~380 × 500 px on desktop; full-screen sheet on mobile).
- Top: title "GWMS Assistant" + close button.
- Middle: scrollable transcript area. User messages right-aligned (brand-navy bubble), assistant messages left-aligned (gray bubble with white background).
- Bottom: textarea + send button (Enter to send, Shift+Enter for newline). Disabled while a request is in flight.

**Interaction:**

```ts
async function ask(question: string) {
  setMessages(m => [...m, { role: 'user', text: question }]);
  setLoading(true);
  const res = await fetch('/api/chatbot/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, audience: 'client' }),
  });
  const data = await res.json();
  if (data.mode === 'keyword') {
    setMessages(m => [...m, {
      role: 'assistant',
      mode: 'keyword',
      matches: data.matches,
    }]);
  } else if (data.mode === 'llm') {
    setMessages(m => [...m, {
      role: 'assistant',
      mode: 'llm',
      text: data.answer,
      sources: data.candidates,
    }]);
  } else {
    setMessages(m => [...m, { role: 'assistant', mode: 'error', text: data.message }]);
  }
  setLoading(false);
}
```

**Rendering:**
- **Keyword match** → render the matched entries as expandable cards. Each card shows the title as a header and the content as markdown (use `react-markdown` if not already a dep; otherwise a minimal renderer that handles headers, bold, lists, and inline links — KB content uses those plus the occasional code fence).
- **LLM answer** → render the `answer` text as markdown, then below it a "Sources" expander listing the candidate titles (clicking expands the source content inline).
- **Error** → plain text in a muted color.

**Empty state:**
"Hi! Ask me how to do something in the portal, where to find a page, or what a term means. Examples: *'How do I upload a document?'*, *'What does my application status mean?'*"

**Accessibility:**
- `aria-live="polite"` on the transcript region.
- Focus trap when the widget is open on mobile (full-screen sheet).
- Esc closes the widget.

### Verification (Batch 3)

Manual:
1. Log in as a client user. Click the assistant bubble.
2. Ask "how do I upload a document?" → expect the matching how-to entry to render.
3. Ask "what does substance review mean?" → expect zero keyword matches (substance is admin-audience), so it falls through to LLM, which should say it doesn't have that info (substance is filtered out of the client's candidate set).
4. Ask a gibberish question → LLM should respond "I don't have that information yet — try asking your account manager."
5. Test on a 375px-wide mobile viewport — panel becomes a full-screen sheet.

### Commit message (Batch 3)

```
feat: wire client-side chatbot to the search API (B-128)

ClientShell's placeholder assistant widget now POSTs to
/api/chatbot/ask with audience=client. Renders keyword matches as
expandable markdown cards and LLM fallbacks as natural-language
answers with a Sources expander. Accessible (aria-live + focus
trap + Esc to close); responsive (380px panel on desktop, full-
screen sheet on mobile).
```

---

## Batch 4 — Admin widget

### New component: `src/components/admin/AdminAssistant.tsx`

Same shape as the client widget (Batch 3) but mounted into the admin shell.

**Locate the admin layout** — likely `src/app/(admin)/layout.tsx` or `src/app/(admin)/admin/layout.tsx` (the brief assumes the second). Add the `AdminAssistant` widget at the bottom of the layout so it appears on every admin page.

**Differences from the client widget:**
- Calls `/api/chatbot/ask` with `audience: 'admin'`.
- Empty-state copy: "Ask how to do something in the admin portal. Examples: *'How do I override a service stage?'*, *'Where do I edit AI verification rules?'*"
- Bubble color matches admin brand (slightly different from client; use `bg-brand-navy` either way for consistency).

**Implementation:** copy the client widget's interaction logic into a shared hook `useChatbot(audience)` in `src/lib/chatbot/useChatbot.ts` so both widgets share the same fetch/state machinery. Each widget then becomes a thin renderer.

### Verification (Batch 4)

Manual:
1. Log in as an admin (Super User by default). The widget appears at the bottom-right of every admin page.
2. Ask "how do I invite a new admin?" → expect the how-to-add-admin entry to surface.
3. Ask "what is substance review?" → expect the glossary entry (audience='admin' includes both 'admin' and 'both').
4. Ask "how do I upload a document?" → expect a client-audience-only entry to NOT appear (the filter excludes it). The LLM fallback should say it doesn't know (no admin-relevant entries match the question).

### Commit message (Batch 4)

```
feat: admin-side chatbot widget (B-128)

AdminAssistant mounts in the admin layout shell on every page.
Shares the useChatbot hook with the client widget; only the audience
filter and empty-state copy differ. Admin sees howto + nav + glossary
entries tagged audience=admin or audience=both.
```

---

## Batch 5 — Polish

1. **Debounce send** so rapid double-clicks don't fire two requests. 300ms gap.
2. **Loading state** — show a typing indicator (three dots animating) in the transcript while the request is in flight.
3. **Reset transcript** button at the top of the panel (X icon next to close) — wipes the in-memory transcript without closing the widget.
4. **Hover-tooltip on the bubble** — "Need help? Ask the assistant" (or similar). Helps discoverability.
5. **Anonymous error reporting** — wrap the fetch in a try/catch; on uncaught errors log to console (not user-visible) for now.

### Verification (Batch 5)

Spot-check each polish item works on the dev server.

### Commit message (Batch 5)

```
feat: chatbot polish — debounce, typing indicator, reset, tooltip (B-128)
```

---

## Batch 6 — CHANGES.md + tech debt

### CHANGES.md

Add a top-of-file entry under `## B-128 — Chatbot wire-up + KB seed (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In the CHANGES.md Tech Debt Tracker and in `docs/tech-debt.md`:

- **Move #9 (partial) to fully Resolved**: "The chat assistant in `ApplicationStatusPanel` is still hardcoded by status, but B-128 ships the real chatbot widget powered by the knowledge_base. The status-panel chat is now arguably redundant — consider removing it if usage telemetry shows users go to the new widget instead." <!-- Optionally also: write a small follow-up to delete ApplicationStatusPanel's hardcoded chat -->
- **Move #17 (KB integration is fail-open) — NO change**: B-128 doesn't fix this; the LLM fallback still silently degrades if the KB query errors. Note in CHANGES.md that it remains an open item.
- **Add new Open entry**: "Chatbot multi-turn memory — questions are independent today. If users start asking follow-ups ('what about X?'), wire conversation history through the search API + LLM context. New brief if/when it becomes a pain point."
- **Add new Open entry**: "Chatbot 'Was this helpful?' feedback — capture thumbs-up / thumbs-down on each answer to drive content tuning. New brief when content needs refining."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding` (main project dir, NOT the worktree — `.env.local` only lives at main):

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write migration, commit + push file, `npm run db:push`, `npm run db:status`, document in CHANGES.md.
2. **Per-batch commits:** six commits total (one per batch). Stage by filename — never `git add .` or `git add -A`.
3. **Final check:** `git status` says "working tree clean" + "up to date with origin/main".
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No embeddings / pgvector — full-text + LLM fallback only.
- No multi-turn memory — every question is independent.
- No feedback capture (thumbs up/down).
- No streaming responses.
- No suggested-question chips.
- ApplicationStatusPanel's existing hardcoded "Elarix AI" card stays for now (tech-debt sweep, not B-128 scope).
