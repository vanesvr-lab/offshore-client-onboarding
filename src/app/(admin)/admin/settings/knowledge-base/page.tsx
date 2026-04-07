import { createAdminClient } from "@/lib/supabase/admin";
import { KnowledgeBaseManager } from "@/components/admin/KnowledgeBaseManager";

export const dynamic = "force-dynamic";

interface KnowledgeBaseEntry {
  id: string;
  title: string;
  category: "rule" | "document_requirement" | "regulatory_text" | "general";
  content: string;
  applies_to: Record<string, unknown> | null;
  source: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default async function KnowledgeBasePage() {
  const supabase = createAdminClient();

  // The table may not yet exist on first deploy — gracefully handle that case
  const { data: rawEntries, error } = await supabase
    .from("knowledge_base")
    .select("*")
    .order("category")
    .order("title");

  const entries: KnowledgeBaseEntry[] = (rawEntries ?? []) as KnowledgeBaseEntry[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">
          Compliance Knowledge Base
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Regulatory rules, required-document lists, and source text used by
          AI preliminary verification. The AI references active entries when
          analyzing uploaded documents.
        </p>
      </div>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">Database table not yet created</p>
          <p>
            Run this SQL in the Supabase SQL Editor to create the
            <code className="mx-1 px-1.5 py-0.5 rounded bg-amber-100 font-mono text-xs">
              knowledge_base
            </code>
            table:
          </p>
          <pre className="mt-2 p-3 bg-amber-100/60 rounded text-xs overflow-x-auto whitespace-pre-wrap">{`CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null check (category in ('rule', 'document_requirement', 'regulatory_text', 'general')),
  content text not null,
  applies_to jsonb default '{}'::jsonb,
  source text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id)
);
CREATE INDEX IF NOT EXISTS knowledge_base_category_idx
  ON knowledge_base(category) WHERE is_active;`}</pre>
        </div>
      ) : (
        <KnowledgeBaseManager initialEntries={entries} />
      )}
    </div>
  );
}
