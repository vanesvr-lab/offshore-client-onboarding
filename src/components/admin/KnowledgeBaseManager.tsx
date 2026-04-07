"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";
import { toast } from "sonner";

type Category = "rule" | "document_requirement" | "regulatory_text" | "general";

interface KnowledgeBaseEntry {
  id: string;
  title: string;
  category: Category;
  content: string;
  applies_to: Record<string, unknown> | null;
  source: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  rule: "Rule",
  document_requirement: "Document Requirement",
  regulatory_text: "Regulatory Text",
  general: "General Guidance",
};

const CATEGORY_COLORS: Record<Category, string> = {
  rule: "bg-blue-100 text-blue-700",
  document_requirement: "bg-purple-100 text-purple-700",
  regulatory_text: "bg-amber-100 text-amber-700",
  general: "bg-gray-100 text-gray-700",
};

interface Props {
  initialEntries: KnowledgeBaseEntry[];
}

export function KnowledgeBaseManager({ initialEntries }: Props) {
  const router = useRouter();
  const [entries, setEntries] = useState(initialEntries);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeBaseEntry | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    title: "",
    category: "rule" as Category,
    content: "",
    source: "",
  });

  function openNew() {
    setEditing(null);
    setForm({ title: "", category: "rule", content: "", source: "" });
    setOpen(true);
  }

  function openEdit(entry: KnowledgeBaseEntry) {
    setEditing(entry);
    setForm({
      title: entry.title,
      category: entry.category,
      content: entry.content,
      source: entry.source ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setSaving(true);
    try {
      const url = editing
        ? `/api/admin/knowledge-base/${editing.id}`
        : "/api/admin/knowledge-base";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          category: form.category,
          content: form.content.trim(),
          source: form.source.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");

      if (editing) {
        setEntries((prev) =>
          prev.map((e) => (e.id === editing.id ? (data.entry as KnowledgeBaseEntry) : e))
        );
      } else {
        setEntries((prev) => [...prev, data.entry as KnowledgeBaseEntry]);
      }
      toast.success(editing ? "Entry updated" : "Entry created");
      setOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this knowledge base entry? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/knowledge-base/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Delete failed");
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success("Entry deleted");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  // Group by category for display
  const grouped: Record<Category, KnowledgeBaseEntry[]> = {
    rule: [],
    document_requirement: [],
    regulatory_text: [],
    general: [],
  };
  entries.forEach((e) => grouped[e.category]?.push(e));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{entries.length} entries</p>
        <Button onClick={openNew} className="bg-brand-navy hover:bg-brand-blue gap-1.5">
          <Plus className="h-4 w-4" /> New Entry
        </Button>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              No knowledge base entries yet.
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Add rules, document requirements, and regulatory text excerpts
              that the AI can reference during verification.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(Object.keys(grouped) as Category[]).map((cat) =>
            grouped[cat].length > 0 ? (
              <Card key={cat}>
                <CardHeader>
                  <CardTitle className="text-base text-brand-navy flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${CATEGORY_COLORS[cat]}`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </span>
                    <span className="text-gray-400 text-xs font-normal">
                      ({grouped[cat].length})
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                  {grouped[cat].map((entry) => (
                    <div
                      key={entry.id}
                      className="py-3 flex items-start justify-between gap-4 first:pt-0 last:pb-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm">
                          {entry.title}
                        </p>
                        <p className="text-gray-600 text-xs mt-1 line-clamp-2">
                          {entry.content}
                        </p>
                        {entry.source && (
                          <p className="text-gray-400 text-xs mt-1 italic">
                            Source: {entry.source}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(entry)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove(entry.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => { if (o) setOpen(true); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Entry" : "New Knowledge Base Entry"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Certified Passport Copy Requirements"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select
                value={form.category}
                onValueChange={(v) =>
                  setForm({ ...form, category: (v ?? "rule") as Category })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rule">Rule</SelectItem>
                  <SelectItem value="document_requirement">
                    Document Requirement
                  </SelectItem>
                  <SelectItem value="regulatory_text">Regulatory Text</SelectItem>
                  <SelectItem value="general">General Guidance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Content *</Label>
              <Textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={8}
                placeholder="Full text of the rule, document requirement, or regulatory excerpt. The AI will reference this verbatim during verification."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Source (optional)</Label>
              <Input
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="e.g. FSC Rules 2022 Section 3.1, FIAMLA Act"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
