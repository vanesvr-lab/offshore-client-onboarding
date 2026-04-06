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
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ServiceTemplate, DocumentRequirement, DocumentCategory } from "@/types";

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">
            Template Manager
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Configure document checklists per service type
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

        {/* Document requirements */}
        <div className="col-span-2">
          {selectedTemplate ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-brand-navy text-base">
                  {selectedTemplate.name}
                </CardTitle>
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
                      <li
                        key={doc.id}
                        className="flex items-center justify-between py-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {doc.name}
                            </span>
                            <Badge variant="outline" className="text-xs capitalize">
                              {doc.category}
                            </Badge>
                            {!doc.is_required && (
                              <Badge variant="outline" className="text-xs text-gray-400">
                                Optional
                              </Badge>
                            )}
                          </div>
                          {doc.description && (
                            <p className="text-xs text-gray-500 mt-0.5 max-w-sm truncate">
                              {doc.description}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteDocument(doc.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  {(!selectedTemplate.document_requirements ||
                    selectedTemplate.document_requirements.length === 0) && (
                    <li className="py-8 text-center text-sm text-gray-400">
                      No documents yet. Add the first one.
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-48 text-gray-400 text-sm border-2 border-dashed rounded-lg">
              Select a template to manage its documents
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
