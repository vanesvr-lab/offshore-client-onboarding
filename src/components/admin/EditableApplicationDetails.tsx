"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
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
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import { BUSINESS_TYPES } from "@/lib/utils/constants";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

const COUNTRIES = [
  "Mauritius", "United Kingdom", "France", "United States", "India", "China",
  "Singapore", "South Africa", "United Arab Emirates", "Switzerland", "Germany",
  "Netherlands", "Luxembourg", "Cayman Islands", "British Virgin Islands", "Other",
];

type SectionKey = "business" | "contact" | "service" | "notes";

export interface EditableAppData {
  id: string;
  business_name: string | null;
  business_type: string | null;
  business_country: string | null;
  business_address: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  service_details: Record<string, unknown> | null;
  admin_notes: string | null;
}

interface NoteDialogState {
  open: boolean;
  changes: Record<string, unknown>;
  note: string;
}

function SectionActions({
  section,
  editing,
  saving,
  onEdit,
  onCancel,
  onSave,
}: {
  section: SectionKey;
  editing: SectionKey | null;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (editing === section) {
    return (
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-brand-navy hover:bg-brand-blue"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onEdit}
      disabled={editing !== null}
      className="text-gray-400 hover:text-gray-700"
    >
      <Pencil className="h-3.5 w-3.5 mr-1" />
      Edit
    </Button>
  );
}

export function EditableApplicationDetails({
  app,
  serviceFields = [],
  templateName,
}: {
  app: EditableAppData;
  serviceFields?: ServiceField[];
  templateName?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [saving, setSaving] = useState(false);

  const [biz, setBiz] = useState({
    business_name: app.business_name ?? "",
    business_type: app.business_type ?? "",
    business_country: app.business_country ?? "",
    business_address: app.business_address ?? "",
  });
  const [contact, setContact] = useState({
    contact_name: app.contact_name ?? "",
    contact_email: app.contact_email ?? "",
    contact_phone: app.contact_phone ?? "",
  });
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    app.service_details ?? {}
  );
  const [notes, setNotes] = useState(app.admin_notes ?? "");

  const [noteDialog, setNoteDialog] = useState<NoteDialogState>({
    open: false,
    changes: {},
    note: "",
  });

  function startEdit(section: SectionKey) {
    if (section === "business") {
      setBiz({
        business_name: app.business_name ?? "",
        business_type: app.business_type ?? "",
        business_country: app.business_country ?? "",
        business_address: app.business_address ?? "",
      });
    } else if (section === "contact") {
      setContact({
        contact_name: app.contact_name ?? "",
        contact_email: app.contact_email ?? "",
        contact_phone: app.contact_phone ?? "",
      });
    } else if (section === "service") {
      setServiceDetails(app.service_details ?? {});
    } else if (section === "notes") {
      setNotes(app.admin_notes ?? "");
    }
    setEditing(section);
  }

  function cancelEdit() {
    setEditing(null);
  }

  function openNoteDialog(changes: Record<string, unknown>) {
    setNoteDialog({ open: true, changes, note: "" });
  }

  async function executeSave(changes: Record<string, unknown>, note: string) {
    setSaving(true);
    setNoteDialog({ open: false, changes: {}, note: "" });
    try {
      const res = await fetch(`/api/admin/applications/${app.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changes,
          note: note.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; changedFields?: string[] };
      if (!res.ok) throw new Error(data.error ?? "Update failed");
      const count = data.changedFields?.length ?? 0;
      toast.success(count > 0 ? "Changes saved" : "No changes detected");
      setEditing(null);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

  const actions = (section: SectionKey, changes: Record<string, unknown>) => ({
    editing,
    saving,
    onEdit: () => startEdit(section),
    onCancel: cancelEdit,
    onSave: () => openNoteDialog(changes),
  });

  return (
    <>
      {/* Optional change note dialog */}
      <Dialog
        disablePointerDismissal
        open={noteDialog.open}
        onOpenChange={(o) => {
          if (!o) setNoteDialog((d) => ({ ...d, open: false }));
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add a change note</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 mt-1">
            Optional — recorded in the audit trail.
          </p>
          <Textarea
            value={noteDialog.note}
            onChange={(e) =>
              setNoteDialog((d) => ({ ...d, note: e.target.value }))
            }
            placeholder="e.g. Corrected spelling as per client request"
            rows={3}
            className="mt-3"
          />
          <div className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => executeSave(noteDialog.changes, "")}
            >
              Skip
            </Button>
            <Button
              className="bg-brand-navy hover:bg-brand-blue"
              onClick={() => executeSave(noteDialog.changes, noteDialog.note)}
            >
              Save with note
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Section A: Business Information ─────────────────────────────── */}
      <Card className={editing === "business" ? "border-blue-200 bg-blue-50/30" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-brand-navy text-base">
              Section A: Business Information
            </CardTitle>
            <SectionActions
              section="business"
              {...actions("business", biz)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {editing === "business" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-gray-500">Business name</Label>
                <Input
                  value={biz.business_name}
                  onChange={(e) =>
                    setBiz((v) => ({ ...v, business_name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Business type</Label>
                <Select
                  value={biz.business_type}
                  onValueChange={(v) =>
                    setBiz((prev) => ({ ...prev, business_type: v ?? "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Country</Label>
                <Select
                  value={biz.business_country}
                  onValueChange={(v) =>
                    setBiz((prev) => ({ ...prev, business_country: v ?? "" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label className="text-xs text-gray-500">Address</Label>
                <Input
                  value={biz.business_address}
                  onChange={(e) =>
                    setBiz((v) => ({ ...v, business_address: e.target.value }))
                  }
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Business name</span>
                <p className="font-medium">{app.business_name || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Type</span>
                <p>{app.business_type || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Country</span>
                <p>{app.business_country || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Address</span>
                <p>{app.business_address || "—"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section B: Primary Contact ───────────────────────────────────── */}
      <Card className={editing === "contact" ? "border-blue-200 bg-blue-50/30" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-brand-navy text-base">
              Primary Contact
            </CardTitle>
            <SectionActions
              section="contact"
              {...actions("contact", contact)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {editing === "contact" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Name</Label>
                <Input
                  value={contact.contact_name}
                  onChange={(e) =>
                    setContact((v) => ({ ...v, contact_name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Email</Label>
                <Input
                  type="email"
                  value={contact.contact_email}
                  onChange={(e) =>
                    setContact((v) => ({
                      ...v,
                      contact_email: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Phone</Label>
                <Input
                  value={contact.contact_phone}
                  onChange={(e) =>
                    setContact((v) => ({
                      ...v,
                      contact_phone: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-gray-500 text-xs">Name</span>
                <p>{app.contact_name || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Email</span>
                <p>{app.contact_email || "—"}</p>
              </div>
              <div>
                <span className="text-gray-500 text-xs">Phone</span>
                <p>{app.contact_phone || "—"}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Section C: Service Details (dynamic) ─────────────────────────── */}
      {serviceFields.length > 0 && (
        <Card className={editing === "service" ? "border-blue-200 bg-blue-50/30" : ""}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-brand-navy text-base">
                Service Details{templateName ? ` — ${templateName}` : ""}
              </CardTitle>
              <SectionActions
                section="service"
                {...actions("service", { service_details: serviceDetails })}
              />
            </div>
          </CardHeader>
          <CardContent>
            <DynamicServiceForm
              fields={serviceFields}
              values={serviceDetails}
              onChange={(key, value) =>
                setServiceDetails((prev) => ({ ...prev, [key]: value }))
              }
              readOnly={editing !== "service"}
            />
          </CardContent>
        </Card>
      )}

      {/* ── Internal Notes ───────────────────────────────────────────────── */}
      <Card className={editing === "notes" ? "border-blue-200 bg-blue-50/30" : ""}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-brand-navy text-base">
              Internal Notes
            </CardTitle>
            <SectionActions
              section="notes"
              {...actions("notes", { admin_notes: notes || null })}
            />
          </div>
        </CardHeader>
        <CardContent>
          {editing === "notes" ? (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes for this application (not visible to client)…"
              rows={5}
            />
          ) : (
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {app.admin_notes || (
                <span className="text-gray-400">No notes added yet.</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
