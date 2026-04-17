"use client";

import { useState, useEffect, useCallback } from "react";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, GripVertical, Settings2, FileText } from "lucide-react";
import { toast } from "sonner";
import type { ServiceTemplate, DocumentRequirement, DocumentCategory } from "@/types";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<
    (ServiceTemplate & { document_requirements?: DocumentRequirement[] })[]
  >([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [newTemplateOpen, setNewTemplateOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);

  const [newTemplate, setNewTemplate] = useState({
    name: "",
    description: "",
  });
  const [newDoc, setNewDoc] = useState({
    name: "",
    description: "",
    category: "corporate" as DocumentCategory,
    is_required: true,
  });
  const [activeTab, setActiveTab] = useState<"documents" | "fields">("documents");
  const [editingFields, setEditingFields] = useState<ServiceField[] | null>(null);
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [newField, setNewField] = useState({
    key: "",
    label: "",
    type: "text" as string,
    section: "Company Setup",
    required: false,
    placeholder: "",
  });
  const [savingFields, setSavingFields] = useState(false);

  const loadTemplates = useCallback(async () => {
    const res = await fetch("/api/admin/settings/templates");
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const selectedTemplate = templates.find((t) => t.id === selected);

  async function createTemplate() {
    if (!newTemplate.name.trim()) return;
    const res = await fetch("/api/admin/settings/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newTemplate),
    });
    const data = await res.json();
    if (!res.ok || data.error) { toast.error(data.error); return; }
    toast.success("Template created");
    setNewTemplateOpen(false);
    setNewTemplate({ name: "", description: "" });
    loadTemplates();
  }

  async function toggleTemplateActive(id: string, current: boolean) {
    await fetch(`/api/admin/settings/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !current }),
    });
    loadTemplates();
  }

  async function addDocument() {
    if (!selected || !newDoc.name.trim()) return;
    const maxOrder = (selectedTemplate?.document_requirements?.length || 0) + 1;
    const res = await fetch(`/api/admin/settings/templates/${selected}/requirements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newDoc, sort_order: maxOrder }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { toast.error(data.error); return; }
    toast.success("Document requirement added");
    setAddDocOpen(false);
    setNewDoc({ name: "", description: "", category: "corporate", is_required: true });
    loadTemplates();
  }

  async function deleteDocument(docId: string) {
    if (!confirm("Delete this document requirement?")) return;
    await fetch(`/api/admin/settings/requirements/${docId}`, { method: "DELETE" });
    loadTemplates();
  }

  // ── Service Fields ──────────────────────────────────────────────────────

  function initFieldsEditor() {
    const fields = (selectedTemplate?.service_fields as ServiceField[] | null) ?? [];
    setEditingFields([...fields]);
  }

  function updateField(idx: number, patch: Partial<ServiceField>) {
    if (!editingFields) return;
    const next = [...editingFields];
    next[idx] = { ...next[idx], ...patch } as ServiceField;
    setEditingFields(next);
  }

  function removeField(idx: number) {
    if (!editingFields) return;
    setEditingFields(editingFields.filter((_, i) => i !== idx));
  }

  function addField() {
    if (!newField.key.trim() || !newField.label.trim()) {
      toast.error("Key and label are required");
      return;
    }
    const field: ServiceField = {
      key: newField.key.trim().toLowerCase().replace(/\s+/g, "_"),
      label: newField.label.trim(),
      type: newField.type as ServiceField["type"],
      section: newField.section,
      required: newField.required,
      placeholder: newField.placeholder || undefined,
    };
    setEditingFields([...(editingFields ?? []), field]);
    setNewField({ key: "", label: "", type: "text", section: "Company Setup", required: false, placeholder: "" });
    setAddFieldOpen(false);
  }

  async function saveFields() {
    if (!selected || !editingFields) return;
    setSavingFields(true);
    try {
      const res = await fetch(`/api/admin/settings/templates/${selected}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_fields: editingFields }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("Service fields saved");
      loadTemplates();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingFields(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            Template Manager
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure service fields and document checklists per service type
          </p>
        </div>
        <Button
          onClick={() => setNewTemplateOpen(true)}
          className="bg-brand-navy hover:bg-brand-blue"
        >
          <Plus className="mr-2 h-4 w-4" /> New Template
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Template list */}
        <div className="space-y-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                selected === t.id
                  ? "border-brand-navy bg-brand-navy/5"
                  : "hover:bg-gray-50 bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-brand-navy">
                  {t.name}
                </span>
                <Switch
                  checked={t.is_active}
                  onCheckedChange={() => toggleTemplateActive(t.id, t.is_active)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {t.document_requirements?.length || 0} documents
              </p>
            </button>
          ))}
          {templates.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-8">
              No templates yet
            </p>
          )}
        </div>

        {/* Template detail (Documents + Service Fields tabs) */}
        <div className="col-span-2">
          {selectedTemplate ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-brand-navy">{selectedTemplate.name}</h2>
              </div>

              {/* Tab bar */}
              <div className="flex border-b mb-4">
                <button
                  onClick={() => setActiveTab("documents")}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "documents"
                      ? "border-brand-navy text-brand-navy"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  Documents ({(selectedTemplate.document_requirements || []).length})
                </button>
                <button
                  onClick={() => { setActiveTab("fields"); initFieldsEditor(); }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "fields"
                      ? "border-brand-navy text-brand-navy"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Service Fields ({((selectedTemplate.service_fields as ServiceField[] | null) ?? []).length})
                </button>
              </div>

              {/* Documents tab */}
              {activeTab === "documents" && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-brand-navy text-base">Document Checklist</CardTitle>
                    <Button
                      size="sm"
                      onClick={() => setAddDocOpen(true)}
                      className="bg-brand-navy hover:bg-brand-blue"
                    >
                      <Plus className="mr-1 h-3 w-3" /> Add Document
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y">
                      {(selectedTemplate.document_requirements || [])
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((doc) => (
                          <li key={doc.id} className="flex items-center justify-between py-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{doc.name}</span>
                                <Badge variant="outline" className="text-xs capitalize">{doc.category}</Badge>
                                {!doc.is_required && (
                                  <Badge variant="outline" className="text-xs text-gray-400">Optional</Badge>
                                )}
                              </div>
                              {doc.description && (
                                <p className="text-xs text-gray-500 mt-0.5 max-w-sm truncate">{doc.description}</p>
                              )}
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => deleteDocument(doc.id)} className="text-red-500 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      {(!selectedTemplate.document_requirements || selectedTemplate.document_requirements.length === 0) && (
                        <li className="py-8 text-center text-sm text-gray-400">No documents yet. Add the first one.</li>
                      )}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Service Fields tab */}
              {activeTab === "fields" && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-brand-navy text-base">Service Fields</CardTitle>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => setAddFieldOpen(true)}>
                        <Plus className="mr-1 h-3 w-3" /> Add Field
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void saveFields()}
                        disabled={savingFields}
                        className="bg-brand-navy hover:bg-brand-blue"
                      >
                        {savingFields ? "Saving..." : "Save Fields"}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {(!editingFields || editingFields.length === 0) ? (
                      <p className="py-8 text-center text-sm text-gray-400">No service fields defined. Add the first one.</p>
                    ) : (
                      <div className="space-y-2">
                        {/* Group by section */}
                        {(() => {
                          const sections: Record<string, { field: ServiceField; idx: number }[]> = {};
                          editingFields.forEach((f, idx) => {
                            const sec = f.section || "Other";
                            if (!sections[sec]) sections[sec] = [];
                            sections[sec].push({ field: f, idx });
                          });
                          return Object.entries(sections).map(([sectionName, items]) => (
                            <div key={sectionName} className="mb-4">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{sectionName}</p>
                              <div className="space-y-1">
                                {items.map(({ field, idx }) => (
                                  <div key={idx} className="flex items-center gap-2 border rounded-lg px-3 py-2 bg-white group hover:border-blue-200">
                                    <GripVertical className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-gray-900 truncate">{field.label}</span>
                                        <span className="text-[10px] text-gray-400 font-mono">{field.key}</span>
                                        <Badge variant="outline" className="text-[10px]">{field.type}</Badge>
                                        {field.required && (
                                          <Badge className="text-[10px] bg-red-50 text-red-600 border-red-200">Required</Badge>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <Switch
                                        checked={field.required ?? false}
                                        onCheckedChange={(v) => updateField(idx, { required: v })}
                                      />
                                      <span className="text-[10px] text-gray-400 w-12">{field.required ? "Req" : "Opt"}</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => removeField(idx)}
                                        className="h-6 w-6 p-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm border-2 border-dashed rounded-lg">
              Select a template to manage its configuration
            </div>
          )}
        </div>
      </div>

      {/* New template dialog */}
      <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Service Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Template name *</Label>
              <Input
                value={newTemplate.name}
                onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewTemplateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createTemplate} className="bg-brand-navy hover:bg-brand-blue">
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add field dialog */}
      <Dialog open={addFieldOpen} onOpenChange={setAddFieldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Service Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Field key *</Label>
                <Input
                  value={newField.key}
                  onChange={(e) => setNewField({ ...newField, key: e.target.value })}
                  placeholder="e.g. company_name"
                  className="font-mono text-sm"
                />
                <p className="text-[10px] text-gray-400">Lowercase, underscores, no spaces</p>
              </div>
              <div className="space-y-1">
                <Label>Label *</Label>
                <Input
                  value={newField.label}
                  onChange={(e) => setNewField({ ...newField, label: e.target.value })}
                  placeholder="e.g. Company Name"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Type</Label>
                <Select value={newField.type} onValueChange={(v) => setNewField({ ...newField, type: v ?? "text" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="textarea">Textarea</SelectItem>
                    <SelectItem value="select">Select</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="date">Date</SelectItem>
                    <SelectItem value="multi_select_country">Country Multi-Select</SelectItem>
                    <SelectItem value="text_array">Text Array</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Section</Label>
                <Select value={newField.section} onValueChange={(v) => setNewField({ ...newField, section: v ?? "Company Setup" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Company Setup">Company Setup</SelectItem>
                    <SelectItem value="Financial">Financial</SelectItem>
                    <SelectItem value="Banking">Banking</SelectItem>
                    <SelectItem value="Details">Details</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  checked={newField.required}
                  onCheckedChange={(v) => setNewField({ ...newField, required: v })}
                />
                <Label className="text-sm">Required</Label>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Placeholder text</Label>
              <Input
                value={newField.placeholder}
                onChange={(e) => setNewField({ ...newField, placeholder: e.target.value })}
                placeholder="Optional hint text shown in the input"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddFieldOpen(false)}>Cancel</Button>
            <Button onClick={addField} className="bg-brand-navy hover:bg-brand-blue">Add Field</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add document dialog */}
      <Dialog open={addDocOpen} onOpenChange={setAddDocOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Document Requirement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Document name *</Label>
              <Input
                value={newDoc.name}
                onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label>Instructions for client</Label>
              <Textarea
                value={newDoc.description}
                onChange={(e) => setNewDoc({ ...newDoc, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Category</Label>
                <Select
                  value={newDoc.category}
                  onValueChange={(v) => setNewDoc({ ...newDoc, category: v as DocumentCategory })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corporate">Corporate</SelectItem>
                    <SelectItem value="kyc">KYC</SelectItem>
                    <SelectItem value="compliance">Compliance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  checked={newDoc.is_required}
                  onCheckedChange={(v) => setNewDoc({ ...newDoc, is_required: v })}
                />
                <Label className="text-sm">Required</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDocOpen(false)}>
              Cancel
            </Button>
            <Button onClick={addDocument} className="bg-brand-navy hover:bg-brand-blue">
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
