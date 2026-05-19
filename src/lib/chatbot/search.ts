// B-128 — Knowledge-base search for the chatbot widget. Audience-
// filtered (the client widget never sees admin-only entries and vice
// versa). At v1 the table is ~50 rows so we pull the audience-relevant
// subset and rank in JS — the GIN tsvector index added in
// `20260519024709_seed_chatbot_kb.sql` is in place for when growth
// justifies a server-side ranker (RPC function with `plainto_tsquery`
// + `ts_rank`); local ranking is identical in user experience until
// then.

import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Audience = "admin" | "client";

export interface KbEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  applies_to: Record<string, unknown> | null;
}

export interface KbMatch extends KbEntry {
  rank: number;
}

function matchesAudience(entry: KbEntry, audience: Audience): boolean {
  const a = (entry.applies_to as { audience?: string } | null)?.audience ?? "both";
  return a === audience || a === "both";
}

async function loadActiveEntries(
  supabase: SupabaseClient,
): Promise<KbEntry[]> {
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("id, title, category, content, applies_to")
    .eq("is_active", true)
    .limit(500);
  if (error || !data) return [];
  return data as KbEntry[];
}

// Top-N matches for `question`, ranked by:
//   • 10 bonus if the full question appears as a substring of the title
//   •  5 per keyword (≥2 chars) found in the title
//   •  1 per keyword found in the content
// Returns at most `limit` rows ordered by score desc. Empty array when
// nothing scores > 0 — the caller falls through to the LLM with the
// audience candidate set.
export async function searchKnowledgeBase(
  question: string,
  audience: Audience,
  limit = 5,
  supabase: SupabaseClient | null = null,
): Promise<KbMatch[]> {
  const client = supabase ?? createAdminClient();
  const entries = await loadActiveEntries(client);
  const audienceMatches = entries.filter((e) => matchesAudience(e, audience));

  const q = question.trim().toLowerCase();
  if (!q) return [];
  const keywords = q
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const ranked = audienceMatches
    .map((entry) => {
      const titleLc = entry.title.toLowerCase();
      const contentLc = entry.content.toLowerCase();
      let score = 0;
      if (titleLc.includes(q)) score += 10;
      for (const kw of keywords) {
        if (titleLc.includes(kw)) score += 5;
        if (contentLc.includes(kw)) score += 1;
      }
      return { ...entry, rank: score };
    })
    .filter((e) => e.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);
  return ranked;
}

// Load up to `limit` audience-relevant entries (no question filter)
// for the LLM fallback's context.
export async function loadCandidatesByAudience(
  audience: Audience,
  limit = 10,
  supabase: SupabaseClient | null = null,
): Promise<KbEntry[]> {
  const client = supabase ?? createAdminClient();
  const entries = await loadActiveEntries(client);
  return entries.filter((e) => matchesAudience(e, audience)).slice(0, limit);
}
